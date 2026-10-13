"use strict";
// Native-browser acceptance; its only network target is the temporary loopback service.
const {chromium}=require('playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {openRuntime}=require('../../packages/application-factory/runtime/runtime');
const {createRuntimeServer}=require('../../packages/application-factory/runtime/http');
const recipes=require('../../packages/application-factory/recipes.json');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,description){const end=Date.now()+7000;while(Date.now()<end){if(await predicate())return;await wait(25);}throw new Error('Timed out: '+description);}
async function main(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-native-browser-'));
  const artifacts=process.env.FACTORY_BROWSER_ARTIFACT_DIR;
  if(artifacts)fs.mkdirSync(artifacts,{recursive:true});
  let runtime,server,browser,url;
  const filename=path.join(dir,'runtime.sqlite'),clock=()=>Date.parse('2026-10-13T12:00:00Z');
  const report={kind:'native-browser-durable-workspace-acceptance',passed:false,editions:3,viewports:2,completeJourneys:0,
    pageErrors:[],outboundRequests:0,uncertainWriteReconciled:false,serverRestartVerified:false,
    browserStorageUsed:false,externalMessagesSent:0,paymentsSent:0,realCustomers:null,collectedRevenue:null,releaseApproved:false};
  async function start(){runtime=openRuntime({filename,recipes,clock});server=createRuntimeServer({runtime,pollMs:25});await server.listen({port:0});url='http://127.0.0.1:'+server.address().port;}
  async function pageFor(context){const page=await context.newPage();page.setDefaultTimeout(7000);
    page.on('pageerror',e=>report.pageErrors.push(String(e)));
    page.on('request',request=>{if(!request.url().startsWith(url+'/'))report.outboundRequests++;});
    await page.goto(url+'/app');return page;
  }
  async function login(page,token){await page.getByLabel('Workspace access key').fill(token);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('#workspace-panel').waitFor({state:'visible'});await until(async()=>Boolean(await page.locator('#workspace-title').textContent()),'workspace title');}
  async function choose(page,recipe){await page.locator('#workspace-select').selectOption(recipe.id);await until(async()=>(await page.locator('#workspace-title').textContent())===recipe.title,'edition selection');}
  try{
    await start();const first=runtime.provisionTenant('synthetic-a'),second=runtime.provisionTenant('synthetic-b');
    for(const key of [first.token,second.token])for(const r of recipes)runtime.createWorkspace(key,{id:r.id,recipeId:r.id});
    browser=await chromium.launch({headless:true});
    for(const width of [1440,390]){
      const context=await browser.newContext({viewport:{width,height:1000}});let page=await pageFor(context);await login(page,first.token);
      const cookie=(await context.cookies()).find(c=>c.name==='factory_browser_session');assert.ok(cookie?.httpOnly);assert.equal(cookie.sameSite,'Strict');assert.equal(cookie.path,'/app');assert.notEqual(cookie.value,first.token);
      assert.equal(await page.locator('#credential').inputValue(),'');assert.equal(await page.evaluate(()=>document.cookie.includes('factory_browser_session')),false);
      assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
      for(const recipe of recipes){
        await choose(page,recipe);const name=width===390&&recipe.id==='agency-intake'?'<img src=x onerror=alert(1)> synthetic agency':`Synthetic ${recipe.title} ${width}`;
        await page.getByRole('button',{name:'+ New intake',exact:true}).click();await page.getByLabel('Name',{exact:true}).fill(name);await page.getByLabel('Due date').fill('2026-10-13');
        await page.getByRole('button',{name:'Save intake',exact:true}).click();await page.locator('#new-dialog').waitFor({state:'hidden'});
        await page.getByRole('button',{name:'Open '+name,exact:true}).waitFor({state:'visible'});
        await page.reload();await page.locator('#workspace-panel').waitFor({state:'visible'});await choose(page,recipe);
        await page.getByRole('button',{name:'Open '+name,exact:true}).waitFor({state:'visible'});
        await page.close();await until(()=>runtime.inbox(first.token,recipe.id).some(n=>n.recordName===name),'headless worker inbox');
        page=await pageFor(context);await page.locator('#workspace-panel').waitFor({state:'visible'});await choose(page,recipe);
        await until(async()=>Number(await page.locator('#notice-count').textContent())>0,'saved inbox');
        await page.getByRole('button',{name:'Open '+name,exact:true}).click();
        for(const req of recipe.requirements){
          let form=page.locator('#documents form').filter({has:page.getByRole('heading',{name:req.label,exact:true})});
          if(req.renewable)await form.locator('input[type=date]').fill('2028-01-01');
          await form.getByRole('button',{name:'Mark received',exact:true}).click();await form.getByRole('button',{name:'Update receipt',exact:true}).waitFor({state:'visible'});
        }
        await page.getByRole('button',{name:'Close record',exact:true}).click();assert.equal(await page.locator('#records img').count(),0);
        const row=page.getByRole('button',{name:'Open '+name,exact:true}).locator('xpath=ancestor::tr');await until(async()=>(await row.locator('.badge').textContent())==='complete','completed checklist');
        report.completeJourneys++;
      }
      await page.getByRole('button',{name:'Pause automation',exact:true}).click();await page.getByRole('button',{name:'Resume automation',exact:true}).waitFor();
      await page.getByRole('button',{name:'Resume automation',exact:true}).click();await page.getByRole('button',{name:'Pause automation',exact:true}).waitFor();
      if(width===1440){
        // Let the service COMMIT, then deliberately lose its response. The retry must reuse the receipt.
        await page.getByRole('button',{name:'+ New intake',exact:true}).click();await page.getByLabel('Name',{exact:true}).fill('Synthetic lost response');await page.getByLabel('Due date').fill('2026-10-13');
        let firstWrite=true;
        await page.route('**/app/api/workspaces/agency-intake/commands',async route=>{if(firstWrite){firstWrite=false;await route.fetch();await route.abort('failed');}else await route.continue();});
        await page.getByRole('button',{name:'Save intake',exact:true}).click();await until(async()=>(await page.locator('#error').textContent()).includes('outcome is unknown'),'uncertain response');
        await page.getByRole('button',{name:'Close new intake',exact:true}).click();await page.getByRole('button',{name:'Retry pending action',exact:true}).click();await page.locator('#retry-command').waitFor({state:'hidden'});
        assert.equal(runtime.workspace(first.token,'agency-intake').records.filter(r=>r.name==='Synthetic lost response').length,1);report.uncertainWriteReconciled=true;
        await page.unroute('**/app/api/workspaces/agency-intake/commands');
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no horizontal page overflow');
      if(artifacts)await page.screenshot({path:path.join(artifacts,`connected-${width}.png`),fullPage:true});
      const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Export saved snapshot'}).click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'agency-intake.json');
      await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();await until(async()=>!(await page.getByRole('button',{name:'Sign in',exact:true}).isDisabled()),'logout completion');assert.equal(await page.locator('#records').textContent(),'');
      await login(page,second.token);assert.equal(await page.locator('#record-count').textContent(),'0');await context.close();
    }
    const context=await browser.newContext(),before=await pageFor(context);await login(before,first.token);
    await server.close();runtime.close();await start();await before.goto(url+'/app');await before.getByRole('button',{name:'Sign in',exact:true}).waitFor();
    await login(before,first.token);await until(async()=>Number(await before.locator('#record-count').textContent())>=2,'database records after restart');report.serverRestartVerified=true;
    await context.close();assert.equal(report.pageErrors.length,0);assert.equal(report.outboundRequests,0);assert.equal(report.completeJourneys,6);report.passed=true;
    if(artifacts)fs.writeFileSync(path.join(artifacts,'acceptance.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
  }finally{await browser?.close();await server?.close();runtime?.close();fs.rmSync(dir,{recursive:true,force:true});}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
