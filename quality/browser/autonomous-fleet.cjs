'use strict';
// Native desktop/mobile check of the private read-only engineering fleet board.
const {chromium}=require('playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {runCycle}=require('../../packages/application-factory/autonomy/loop');
const {buildFleet,renderFleetHtml}=require('../../packages/application-factory/autonomy/fleet');
const at='2026-10-13T00:00:00Z';
async function main(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-fleet-browser-'));
 let browser;
 const report={kind:'autonomous-fleet-native-acceptance',passed:false,
  inspected:0,viewports:[],remoteRequests:0,pageErrors:[],released:false,
  realCustomers:null,collectedRevenue:null,paymentsSent:0,externalMessagesSent:0};
 try{
  const made=runCycle({outputRoot:dir,at});
  assert.equal(made.accepted,1);assert.equal(made.verification,'executed-packaged-workflow');
  const fleet=buildFleet({outputRoot:dir,at,lookbackCycles:1});
  assert.equal(fleet.summary.verifiedApps,1);
  const html=renderFleetHtml(fleet);
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:width===390?844:900}});
   page.on('request',req=>{report.remoteRequests++;});
   page.on('pageerror',error=>{report.pageErrors.push(String(error));});
   await page.setContent(html,{waitUntil:'domcontentloaded'});
   assert.equal(await page.locator('h1').textContent(),'Autonomous Factory Fleet');
   assert.equal(await page.locator('.card strong').first().textContent(),'1');
   assert.equal(await page.locator('script,form,iframe').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   assert.match(await page.locator('main').textContent(),/source-checked|source-checked local|Verified packages/i);
   const log=page.locator('main table tbody tr');
   assert.equal(await log.count(),1);
   const text=await log.first().textContent();
   assert.match(text,/verified/i);
   assert.doesNotMatch(text,/revenue|\$[0-9]/i);
   report.viewports.push(width);
   report.inspected++;
   await page.close();
  }
  assert.equal(report.remoteRequests,0);assert.equal(report.pageErrors.length,0);
  report.passed=true;console.log(JSON.stringify(report,null,2));return report;
 }finally{await browser?.close();fs.rmSync(dir,{recursive:true,force:true});}
}
if(require.main===module)main().catch(e=>{console.error('Native fleet acceptance failed: '+e.message);process.exitCode=1;});
module.exports={main};
