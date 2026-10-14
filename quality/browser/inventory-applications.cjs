'use strict';
// Native Chromium acceptance against real SQLite and loopback browser, never an external app deployment.
const {chromium}=require('playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {openStore}=require('../../packages/application-factory/inventory-family/store');
const {createServer}=require('../../packages/application-factory/inventory-family/server');
const recipes=require('../../packages/application-factory/inventory-family/recipes.json');
const sleep=n=>new Promise(r=>setTimeout(r,n));
async function eventually(check,label){
 const end=Date.now()+8000;
 while(Date.now()<end){if(await check())return;await sleep(35);}
 throw Error('Timed out: '+label);
}
async function main(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'factory-inventory-native-'));
 const artifacts=process.env.FACTORY_INVENTORY_BROWSER_ARTIFACT_DIR;
 if(artifacts)fs.mkdirSync(artifacts,{recursive:true});
 const report={kind:'inventory-family-native-browser-acceptance',passed:false,
   editions:3,viewports:[1440,390],completeJourneys:0,roleBoundaries:0,
   independentApprovals:0,nonBindingReplenishments:0,outboundRequests:0,
   browserStorageUsed:false,pageErrors:[],externalMessagesSent:0,paymentsSent:0,
   realCustomers:null,collectedRevenue:null,releaseApproved:false};
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  for(const recipe of recipes){
   const dir=path.join(root,recipe.id);fs.mkdirSync(dir,{mode:0o700});
   const store=openStore({filename:path.join(dir,'inventory.sqlite'),recipe,
     clock:()=>Date.parse('2026-10-13T12:00:00Z')});
   const server=createServer({store,automation:false});
   let url;
   try{
    const a=store.provision('synthetic-a'),b=store.provision('synthetic-b');
    await server.listen({port:0});
    url='http://127.0.0.1:'+server.address().port;
    for(const width of [1440,390]){
     const context=await browser.newContext({viewport:{width,height:width===390?844:920}});
     const page=await context.newPage();page.setDefaultTimeout(8000);
     page.on('pageerror',err=>report.pageErrors.push(String(err)));
     page.on('request',req=>{if(!req.url().startsWith(url+'/'))report.outboundRequests++;});
     const login=async key=>{
      await page.goto(url+'/app');
      await page.getByLabel('Workspace access key').fill(key);
      await page.getByRole('button',{name:'Open inventory'}).click();
      await page.locator('#app-shell').waitFor({state:'visible'});
      await eventually(async()=>await page.locator('#title').textContent()===recipe.title,'edition title');
     };
     const logout=async()=>{await page.getByRole('button',{name:'Sign out'}).click();
      await page.locator('#login-panel').waitFor({state:'visible'});};
     await login(a.operatorKey);
     assert.equal(await page.locator('#operator-actions').isVisible(),true);
     assert.equal(await page.locator('#reviewer-actions').isVisible(),false);
     assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
     assert.equal((await context.cookies()).length,0);
     await page.locator('#quantity').fill('4');
     await page.locator('[data-action="receive"]').click();
     await eventually(async()=>await page.locator('#detail-onhand').textContent()==='4','received stock');
     await page.getByRole('button',{name:'Request internal replenishment'}).click();
     await eventually(async()=>(await page.locator('#proposal-note').textContent()).includes('pending review'),'reorder requested');
     await logout();
     await login(a.reviewerKey);
     assert.equal(await page.locator('#operator-actions').isVisible(),false);
     assert.equal(await page.locator('#reviewer-actions').isVisible(),true);
     assert.equal(await page.locator('#approve-reorder').isEnabled(),true);
     await page.getByRole('button',{name:'Approve internal proposal'}).click();
     await eventually(async()=>(await page.locator('#proposal-note').textContent()).includes('approved internal'),'internal approval');
     report.independentApprovals++;report.roleBoundaries++;
     await logout();
     await login(a.operatorKey);
     await page.getByRole('button',{name:'Record reviewed stock arrival'}).click();
     await eventually(async()=>{
      const val=await page.locator('#detail-onhand').textContent(),onOrder=await page.locator('#detail-onorder').textContent();
      return Number(val)>4&&onOrder==='0';
     },'internal receipt recorded');
     assert.match(await page.locator('#proposal-note').textContent(),/received internal/);
     report.nonBindingReplenishments++;
     const screenshot=artifacts?path.join(artifacts,recipe.id+'-'+width+'.png'):null;
     if(screenshot)await page.screenshot({path:screenshot,fullPage:true});
     await logout();
     await login(b.operatorKey);
     assert.equal(await page.locator('#detail-onhand').textContent(),'0');
     assert.equal(await page.locator('#detail-reserved').textContent(),'0');
     assert.equal(await page.locator('#metric-review').textContent(),'0');
     report.completeJourneys++;
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
     await context.close();
    }
   }finally{await server.close();store.close();}
  }
  assert.equal(report.completeJourneys,6);
  assert.equal(report.roleBoundaries,6);
  assert.equal(report.nonBindingReplenishments,6);
  assert.equal(report.outboundRequests,0);
  assert.deepEqual(report.pageErrors,[]);
  report.passed=true;console.log(JSON.stringify(report,null,2));return report;
 }finally{await browser?.close();fs.rmSync(root,{recursive:true,force:true});}
}
if(require.main===module)main().catch(error=>{
 console.error('Inventory native browser acceptance failed: '+error.message);process.exitCode=1;
});
module.exports={main};
