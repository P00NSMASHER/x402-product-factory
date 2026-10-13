'use strict';
// Execute the manufactured apps' own invitation/runtime/browser modules with synthetic data.
const {chromium}=require('playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {compileApplication,verifyApplication}=require('../../packages/application-factory/manufacturing/assembler');
const recipes=require('../../packages/application-factory/recipes.json');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn){const end=Date.now()+8000;while(Date.now()<end){if(await fn())return;await wait(25);}throw new Error('PILOT_BROWSER_TIMEOUT');}
async function main(output){
 const report={kind:'manufactured-private-pilot-acceptance',passed:false,journeys:0,provisionedTrials:0,completedOutcomes:0,resumeChecks:0,expiryChecks:0,pageErrors:0,outboundRequests:0,qualifiesAsDemandEvidence:false,realCustomers:null,collectedRevenue:null,releaseApproved:false};
 const browser=await chromium.launch({headless:true});
 try{
  for(const recipe of recipes){
   const app=compileApplication(recipe),root=path.join(output,recipe.id+'-'+app.digest);verifyApplication(root,app.digest);
   const {openRuntime}=require(path.join(root,'packages/application-factory/runtime/runtime'));
   const {createRuntimeServer}=require(path.join(root,'packages/application-factory/runtime/http'));
   const catalog=require(path.join(root,'packages/application-factory/recipes.json'));
   const temp=fs.mkdtempSync(path.join(os.tmpdir(),'factory-private-pilot-browser-'));let runtime,server,time=Date.now();
   try{
    runtime=openRuntime({filename:path.join(temp,'runtime.sqlite'),recipes:catalog,clock:()=>time});server=createRuntimeServer({runtime,pollMs:20});await server.listen({port:0});
    const origin='http://127.0.0.1:'+server.address().port;
    for(const width of [1440,390]){
     const invite=runtime.issuePilot({recipeId:recipe.id,durationDays:1});const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage();page.setDefaultTimeout(8000);
     page.on('pageerror',()=>report.pageErrors++);page.on('request',r=>{if(!r.url().startsWith(origin+'/'))report.outboundRequests++;});
     const login=async()=>{await page.getByLabel('Private pilot code',{exact:true}).fill(invite.inviteCode);await page.locator('#pilot-consent').check();await page.getByRole('button',{name:'Start or resume pilot',exact:true}).click();await until(async()=>(await page.locator('#workspace-title').textContent())===recipe.title);};
     try{
      await page.goto(origin+'/app/pilots/'+recipe.id);await page.getByRole('link',{name:'Use private pilot code',exact:true}).click();
      await login();assert.equal(await page.locator('#workspace-select option').count(),1);assert.equal(await page.locator('#record-count').textContent(),'0');
      assert.equal(await page.locator('#pilot-code').inputValue(),'');assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
      const name='Synthetic private evaluation '+width;
      await page.getByRole('button',{name:'+ New intake',exact:true}).click();await page.getByLabel('Name',{exact:true}).fill(name);await page.getByLabel('Due date').fill(new Date(time).toISOString().slice(0,10));
      await page.getByRole('button',{name:'Save intake',exact:true}).click();await page.locator('#new-dialog').waitFor({state:'hidden'});
      await page.getByRole('button',{name:'Open '+name,exact:true}).click();
      for(const req of recipe.requirements){
       const form=page.locator('#documents form').filter({has:page.getByRole('heading',{name:req.label,exact:true})});
       if(req.renewable)await form.locator('input[type=date]').fill('2028-01-01');
       await form.getByRole('button',{name:'Mark received',exact:true}).click();await form.getByRole('button',{name:'Update receipt',exact:true}).waitFor();
      }
      await page.getByRole('button',{name:'Close record',exact:true}).click();await until(async()=>(await page.locator('#pilot-summary').textContent()).includes('1 completed checklists'));
      await page.reload();await until(async()=>(await page.locator('#record-count').textContent())==='1');
      await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.locator('#login-panel').waitFor({state:'visible'});
      await until(async()=>!(await page.locator('#sign-in').isDisabled()));await login();assert.equal(await page.locator('#record-count').textContent(),'1');report.resumeChecks++;
      const observation=runtime.pilotReport();assert.equal(observation.qualifiesAsDemandEvidence,false);assert.equal(observation.collectedRevenue,null);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      runtime.revokePilot(invite.inviteId);await page.reload();await page.locator('#login-panel').waitFor({state:'visible'});
      await page.getByLabel('Private pilot code',{exact:true}).fill(invite.inviteCode);await page.locator('#pilot-consent').check();const rejected=page.waitForResponse(r=>r.url()===origin+'/app/api/pilot');await page.getByRole('button',{name:'Start or resume pilot',exact:true}).click();assert.equal((await rejected).status(),401);assert.equal(await page.locator('#workspace-panel').isVisible(),false);
      report.journeys++;
     }finally{await context.close();}
    }
    const observed=runtime.pilotReport();report.provisionedTrials+=observed.activatedTrials;report.completedOutcomes+=observed.completedRecords;
    const expiring=runtime.issuePilot({recipeId:recipe.id,durationDays:1}),session=runtime.activatePilot(expiring.inviteCode,true);time=session.expiresAt;
    assert.throws(()=>runtime.workspaces(session.credential),/UNAUTHORIZED/);assert.equal(runtime.sweep().claimed,0);report.expiryChecks++;
   }finally{await server?.close();runtime?.close();fs.rmSync(temp,{recursive:true,force:true});}
  }
  assert.equal(report.journeys,6);assert.equal(report.provisionedTrials,6);assert.equal(report.completedOutcomes,6);assert.equal(report.pageErrors,0);assert.equal(report.outboundRequests,0);report.passed=true;
  fs.writeFileSync(path.join(output,'private-pilot-acceptance.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));return report;
 }finally{await browser.close();}
}
if(require.main===module)main(process.argv[2]).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
