'use strict';
// Browser-test a REAL manufactured app through local TLS + authenticated loopback gateway.
// This is not an externally deployed service.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const http=require('node:http'),https=require('node:https'),{execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const {manufactureBatch}=require('../../packages/application-factory/manufacturing/line');
const {manufactureQuoteBatch}=require('../../packages/application-factory/quote-family/manufacturing');
const {manufactureInventoryBatch}=require('../../packages/application-factory/inventory-family/manufacturing');
const docs=require('../../packages/application-factory/recipes.json');
const quotes=require('../../packages/application-factory/quote-family/recipes.json');
const inventory=require('../../packages/application-factory/inventory-family/recipes.json');
const {launchPrivateFleet}=require('../../packages/application-factory/deploy/fleet-preview');
const {createRemoteGateway}=require('../../packages/application-factory/deploy/remote-gateway');
const listen=s=>new Promise((resolve,reject)=>{s.once('error',reject);
 s.listen(0,'127.0.0.1',()=>{s.off('error',reject);resolve(s.address().port);});});
async function main(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'factory-browser-tls-demo-'));
 const sources={document:path.join(root,'docs'),quote:path.join(root,'quotes'),inventory:path.join(root,'inventory')};
 let fleet,gate,tls,browser;
 try{
  assert.equal(manufactureBatch({recipes:[docs[0]],outputRoot:sources.document}).accepted,1);
  assert.equal(manufactureQuoteBatch({recipes:[quotes[0]],outputRoot:sources.quote}).accepted,1);
  assert.equal(manufactureInventoryBatch({catalog:[inventory[0]],outputRoot:sources.inventory}).accepted,1);
  fleet=await launchPrivateFleet({sources,stateRoot:path.join(root,'session')});
  const keyFile=path.join(root,'dev.key'),certFile=path.join(root,'dev.crt');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=127.0.0.1',
   '-keyout',keyFile,'-out',certFile],{stdio:'ignore'});
  tls=https.createServer({key:fs.readFileSync(keyFile),cert:fs.readFileSync(certFile)},(req,res)=>{
   if(!gate){res.writeHead(503);res.end();return;}
   const forward=http.request({host:'127.0.0.1',port:gate.port,path:req.url,method:req.method,headers:req.headers},up=>{
    res.writeHead(up.statusCode,up.headers);up.pipe(res);
   });
   forward.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(forward);
  });
  const port=await listen(tls),origin='https://127.0.0.1:'+port;
  const app=fleet.apps.find(x=>x.family==='quote');assert.ok(app);
  gate=await createRemoteGateway({fleet,family:app.family,id:app.id,externalOrigin:origin});
  const code=JSON.parse(fs.readFileSync(gate.loginCodeFile,'utf8')).code;
  const token=JSON.parse(fs.readFileSync(app.privateCredentialFile,'utf8')).credentials.operator;
  browser=await chromium.launch({headless:true});
  for(const width of [390,1440]){
   const ctx=await browser.newContext({viewport:{width,height:844},ignoreHTTPSErrors:true});
   const page=await ctx.newPage(),failures=[],external=[];
   page.on('pageerror',e=>failures.push(e.message));
   page.on('request',req=>{if(new URL(req.url()).origin!==origin)external.push(req.url());});
   const initial=await page.goto(origin+'/app',{waitUntil:'domcontentloaded'});
   assert.equal(initial.status(),401);
   await page.locator('input[name="code"]').fill(code);
   await page.getByRole('button',{name:'Open demo'}).click();
   await page.locator('#login-form').waitFor({state:'visible'});
   assert.equal(new URL(page.url()).origin,origin);
   await page.locator('#token').fill(token);
   await page.locator('#login-form button[type=submit]').click();
   await page.locator('#workspace').waitFor({state:'visible'});
   await page.locator('#metric-total').waitFor({state:'visible'});
   assert.equal(await page.locator('#metric-total').textContent(),'0');
   assert.deepEqual(external,[]);assert.deepEqual(failures,[]);
   const denied=await ctx.request.get(origin+'/v1/recipe');assert.equal(denied.status(),401);
   const protectedNoSession=await browser.newContext({ignoreHTTPSErrors:true});
   assert.equal((await protectedNoSession.request.get(origin+'/v1/recipe')).status(),401);
   assert.equal((await protectedNoSession.request.get(origin+'/app',{headers:{Origin:'https://attacker.invalid'}})).status(),403);
   await protectedNoSession.close();await ctx.close();
  }
  console.log(JSON.stringify({kind:'synthetic-remote-gateway-tls-browser',passed:true,
   familiesSupported:['document','quote','inventory'],realQuoteBrowserAccess:true,
   testedWidths:[390,1440],unauthorizedRejected:true,originGuardVerified:true,
   credentialsUploaded:false,externalDeployment:false,releaseApproved:false}));
 }finally{
  if(browser)await browser.close();
  if(gate)await gate.close();
  if(tls?.listening)await new Promise(resolve=>tls.close(resolve));
  if(fleet)await fleet.stop();fs.rmSync(root,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error('Synthetic TLS browser rehearsal failed:',e.message);process.exitCode=1;});
