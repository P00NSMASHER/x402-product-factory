'use strict';
// Real native Chromium checks of the private multi-app operator portal.
// No credential entered in browser; only 127.0.0.1 requests allowed.
const {chromium}=require('playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {launchPrivateFleet}=require('../../packages/application-factory/deploy/fleet-preview');
let phase='input';
async function main(args=process.argv.slice(2)){
 if(args.length!==8)throw Error('USAGE_INVALID');
 const options=Object.create(null);
 for(let i=0;i<args.length;i+=2){
  if(!['--document','--quote','--inventory','--state-root'].includes(args[i])||
     Object.hasOwn(options,args[i])||!path.isAbsolute(args[i+1]))throw Error('USAGE_INVALID');
  options[args[i]]=args[i+1];
 }
 if(Object.keys(options).length!==4)throw Error('USAGE_INVALID');
 const dir=options['--state-root'],sources={document:options['--document'],
  quote:options['--quote'],inventory:options['--inventory']};
 phase='fleet-start';
 const fleet=await launchPrivateFleet({sources,stateRoot:dir});
 let browser=null;
 const report={kind:'native-private-fleet-browser',passed:false,appCount:fleet.apps.length,
  viewports:[1440,390],portalViewsVerified:0,appFamilyLinksVerified:0,
  pageErrors:[],outboundRequests:0,credentialsDisplayed:false,
  realCustomers:null,collectedRevenue:null,paymentsSent:0,externalMessagesSent:0,
  releaseApproved:false,publicHostingEnabled:false};
 try{
  phase='chromium-launch';
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const origins=new Set([fleet.origin,...fleet.apps.map(a=>a.origin)]);
  const seen=new Set();
  for(const width of [1440,390]){
   phase='viewport-'+width;
   const context=await browser.newContext({viewport:{width,height:width===390?844:900}});
   try{
    const page=await context.newPage();page.setDefaultTimeout(12000);
    page.on('pageerror',error=>report.pageErrors.push(String(error).slice(0,180)));
    page.on('request',req=>{try{
     if(!origins.has(new URL(req.url()).origin))report.outboundRequests++;
    }catch{report.outboundRequests++;}});
    phase='portal-navigation-'+width;
    const response=await page.goto(fleet.origin+'/',{waitUntil:'domcontentloaded'});
    assert.equal(response.status(),200);
    assert.equal(await page.locator('.card').count(),fleet.apps.length);
    assert.equal(await page.getByRole('heading',{name:'Application factory · private fleet'}).isVisible(),true);
    assert.ok((await page.locator('body').innerText()).includes('Release status: HOLD'));
    phase='portal-overflow-'+width;
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
    assert.equal((await page.locator('script').count()),0);
    const content=await page.content();
    for(const app of fleet.apps){
     const auth=JSON.parse(fs.readFileSync(app.privateCredentialFile,'utf8')).credentials;
     for(const key of Object.values(auth)){
      if(content.includes(key))report.credentialsDisplayed=true;
     }
    }
    for(const family of ['document','quote','inventory']){
     phase='app-navigation-'+family+'-'+width;
     const item=fleet.apps.find(a=>a.family===family);
     const link=page.locator('a[href="'+item.origin+'/app"]');
     assert.equal(await link.count(),1);
     await Promise.all([page.waitForURL(item.origin+'/app'),link.click()]);
     assert.equal(new URL(page.url()).origin,item.origin);
     assert.ok(await page.locator('body').isVisible());
     assert.ok((await page.locator('body').innerText()).length>75);
     report.appFamilyLinksVerified++;
     seen.add(family);
     await page.goto(fleet.origin+'/',{waitUntil:'domcontentloaded'});
    }
    if(process.env.FACTORY_PRIVATE_FLEET_SCREENSHOT_DIR){
     const root=process.env.FACTORY_PRIVATE_FLEET_SCREENSHOT_DIR;
     fs.mkdirSync(root,{recursive:true});
     await page.screenshot({path:path.join(root,'portal-'+width+'.png'),fullPage:true});
    }
    phase='viewport-complete-'+width;
    report.portalViewsVerified++;
   }finally{await context.close();}
  }
  assert.equal(seen.size,3);
  assert.equal(report.pageErrors.length,0);
  assert.equal(report.outboundRequests,0);
  assert.equal(report.credentialsDisplayed,false);
  assert.equal(report.portalViewsVerified,2);
  assert.equal(report.appFamilyLinksVerified,6);
  phase='all-views-passed';
  report.passed=true;
  return report;
 }finally{await browser?.close();await fleet.stop();}
}
if(require.main===module)main().then(result=>console.log(JSON.stringify(result))).catch(error=>{
 const kind=['AssertionError','TimeoutError','Error','TypeError'].includes(error?.name)?error.name:'UNKNOWN';
 console.error('PRIVATE_FLEET_NATIVE_GATE:'+phase+':'+kind);process.exitCode=1;
});
module.exports={main};
