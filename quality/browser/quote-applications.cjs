'use strict';
// Independently inspect manufactured quote family UI in native desktop and mobile Chromium.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {verifyQuoteApp}=require('../../packages/application-factory/quote-family/manufacturing');
async function run(root){
 const report={kind:'native-quote-family-browser-acceptance',passed:false,editions:3,viewports:2,
  completeJourneys:0,pageErrors:[],outboundRequests:0,roleBoundariesVerified:0,ordersVerified:0,
  browserStorageUsed:false,realCustomers:null,collectedRevenue:null,externalMessagesSent:0,paymentsSent:0,releaseApproved:false};
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manufacturing-report.json'),'utf8'));
 assert.equal(manifest.accepted,3);assert.equal(manifest.failed,0);
 let browser;
 const artifacts=process.env.FACTORY_QUOTE_BROWSER_ARTIFACT_DIR;
 if(artifacts)fs.mkdirSync(artifacts,{recursive:true});
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  for(const r of manifest.apps){
   assert.equal(r.status,'accepted');const appdir=path.join(root,r.id+'-'+r.digest);
   verifyQuoteApp(appdir,r.digest);
   const {openStore}=require(path.join(appdir,'store.js')),{createServer}=require(path.join(appdir,'server.js'));
   const recipe=require(path.join(appdir,'recipe.json'));
   const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'factory-quote-browser-'));
   let server,store;
   try{
    store=openStore({filename:path.join(tmp,'state.sqlite'),recipe,clock:()=>Date.parse('2026-10-13T12:00:00Z')});
    server=createServer({store,pollMs:500});await server.listen(0);const origin='http://127.0.0.1:'+server.port();
    for(const width of [1440,390]){
     const tenant=store.provision('synthetic-'+width);
     const context=await browser.newContext({viewport:{width,height:width===390?844:950}});
     const page=await context.newPage();page.setDefaultTimeout(8000);
     page.on('pageerror',e=>report.pageErrors.push(String(e)));
     page.on('request',req=>{if(!req.url().startsWith(origin+'/'))report.outboundRequests++;});
     await page.goto(origin+'/app',{waitUntil:'domcontentloaded'});
     async function login(key,expectedRole){
      await page.locator('#token').fill(key);await page.locator('#login-form button[type="submit"]').click();
      await page.locator('#workspace').waitFor({state:'visible'});
      assert.equal(await page.locator('#role').textContent(),expectedRole);
     }
     await login(tenant.operatorToken,'Estimate operator');
     assert.equal(await page.locator('#title').textContent(),recipe.title);
     await page.locator('#new-quote').click();
     await page.locator('#client-name').fill('Synthetic '+recipe.id+' '+width);
     await page.locator('#valid-until').fill('2026-10-20');
     await page.locator('#create-form button[type="submit"]').click();
     await page.locator('#detail-name').waitFor({state:'visible'});
     await page.locator('#quantity').fill('4');
     await page.locator('#price').fill('15.25');
     await page.locator('#line-form button[type="submit"]').click();
     await page.waitForFunction(() => document.getElementById('detail-total')?.textContent === '$61.00');
     await page.locator('#submit-review').click();
     await page.waitForFunction(() => document.getElementById('current-status')?.textContent === 'pending review');
     await page.locator('#logout').click();
     await login(tenant.reviewerToken,'Independent reviewer');
     await page.getByRole('button',{name:'Synthetic '+recipe.id+' '+width}).click();
     assert.equal(await page.locator('#approve').isVisible(),true);
     assert.equal(await page.locator('#new-quote').isVisible(),false);
     report.roleBoundariesVerified++;
     await page.locator('#approve').click();await page.waitForFunction(() => document.getElementById('current-status')?.textContent === 'approved');
     await page.locator('#logout').click();await login(tenant.operatorToken,'Estimate operator');
     await page.getByRole('button',{name:'Synthetic '+recipe.id+' '+width}).click();
     await page.locator('#convert').click();await page.locator('#order-info').waitFor({state:'visible'});
     assert.match(await page.locator('#order-info').textContent(),/NOT PAID/);
     assert.equal(store.orders(tenant.operatorToken).length,1);
     assert.equal(store.orders(tenant.operatorToken)[0].totalCents,6100);
     report.ordersVerified++;
     const local=await page.evaluate(()=>localStorage.length+sessionStorage.length);
     assert.equal(local,0);assert.equal((await context.cookies()).length,0);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
     if(artifacts)await page.screenshot({path:path.join(artifacts,r.id+'-'+width+'.png'),fullPage:true});
     await page.locator('#logout').click();assert.equal(await page.locator('#token').inputValue(),'');
     await context.close();report.completeJourneys++;
    }
   }finally{await server?.close();store?.close();fs.rmSync(tmp,{recursive:true,force:true});}
  }
  assert.equal(report.completeJourneys,6);assert.equal(report.outboundRequests,0);
  assert.deepEqual(report.pageErrors,[]);report.passed=true;
  console.log(JSON.stringify(report,null,2));return report;
 }finally{await browser?.close();}
}
if(require.main===module)run(process.argv[2]).catch(e=>{console.error('Native quote acceptance rejected candidate:',e.message);process.exitCode=1;});
module.exports={run};
