'use strict';
// Native browser acceptance for public-organization-only sales review; no checkout or remote requests.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const recipes=require('../../packages/application-factory/recipes.json');
const {createCampaign}=require('../../packages/application-factory/growth/campaign');
const {buildSalesBoard,renderSalesBoard}=require('../../packages/application-factory/sales/board');
const asOf='2026-10-13';
const candidate=(name,domain,recipeId)=>({company:name,homepage:'https://'+domain,recipeId,
 observations:[{url:'https://'+domain+'/about',observedOn:asOf,signal:'business_category',
 note:'Public organization website identifies its business or services.'}]});
async function main(){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'factory-sales-browser-'));
 let browser,campaign;
 const report={kind:'native-sales-command-center-acceptance',passed:false,
  viewports:[],researchOrganizations:3,suppressed:1,actionableReviews:0,
  remoteRequests:0,scriptErrors:[],realCustomers:null,collectedRevenue:null,
  transmittedMessages:0,paymentsSent:0,releaseApproved:false};
 try{
   campaign=createCampaign({filename:path.join(tmp,'campaign.json'),key:Buffer.alloc(32,61),
     recipes,clock:()=>Date.parse(asOf+'T12:00:00Z')});
   campaign.importTargets([
     candidate("Acme's Supply",'supply.example.org','supplier-desk'),
     candidate('Ridgeway Maintenance','ridgeway.example.org','contractor-renewals'),
     candidate('Cedar Agency','cedar.example.org','agency-intake')]);
   campaign.record({domain:'ridgeway.example.org',kind:'do_not_contact',key:'synthetic-stop'});
   campaign.record({domain:'cedar.example.org',kind:'reviewed',key:'synthetic-reviewed'});
   // Only unreviewed supply company is in the manual task queue; no messaging.
   const board=buildSalesBoard({campaign,recipes,asOf});report.actionableReviews=board.actions.length;
   assert.equal(board.actions.length,2); // Unreviewed supplier + reviewed agency draft.
   assert.equal(board.stats.verifiedBuyers,0);
   assert.equal(board.actions.some(a=>a.domain==='ridgeway.example.org'),false);
   const html=renderSalesBoard(board);
   browser=await chromium.launch({headless:true,args:['--no-sandbox']});
   for(const width of [1440,390]){
     const page=await browser.newPage({viewport:{width,height:width===390?844:950}});
     page.on('pageerror',error=>report.scriptErrors.push(error.message));
     page.on('request',request=>report.remoteRequests++);
     await page.setContent(html,{waitUntil:'domcontentloaded'});
     assert.equal(await page.locator('h1').textContent(),'Sales command center');
     assert.equal(await page.locator('.metric strong').first().textContent(),'3');
     assert.equal(await page.locator('.pill').first().textContent(),'Research stage · Not approved for sending');
     assert.equal(await page.locator('script,form,iframe').count(),0);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
     const filtered=await page.locator('main table').nth(1).locator('tbody tr').count();
     assert.equal(filtered,2);
     assert.equal((await page.locator('main table').nth(1).textContent()).includes('Ridgeway Maintenance'),false);
     const artifactDir=process.env.RUNNER_TEMP&&path.resolve(process.env.RUNNER_TEMP,'sales-browser-artifacts');
     if(artifactDir){fs.mkdirSync(artifactDir,{recursive:true});await page.screenshot({path:path.join(artifactDir,'sales-'+width+'.png'),fullPage:true});}
     report.viewports.push(width);
     await page.close();
   }
   assert.deepEqual(report.scriptErrors,[]);
   assert.equal(report.remoteRequests,0);
   report.passed=true;
   return report;
 }finally{await browser?.close();campaign?.close();fs.rmSync(tmp,{recursive:true,force:true});}
}
if(require.main===module)main().then(r=>console.log(JSON.stringify(r,null,2))).catch(error=>{console.error('Sales browser acceptance failed:',error.message);process.exitCode=1;});
module.exports={main};
