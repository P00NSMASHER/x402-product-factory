'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {manufactureBatch}=require('../manufacturing/line');
const {manufactureQuoteBatch}=require('../quote-family/manufacturing');
const {manufactureInventoryBatch}=require('../inventory-family/manufacturing');
const docs=require('../recipes.json'),quotes=require('../quote-family/recipes.json');
const inventory=require('../inventory-family/recipes.json');
const {launchPrivateFleet,portalHTML,CSP}=require('./fleet-preview');
const {exercise}=require('../../../scripts/run-private-fleet-preview');
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-runnable-fleet-test-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 return {dir,sources:{document:path.join(dir,'docs'),quote:path.join(dir,'quotes'),inventory:path.join(dir,'inventory')},
  stateRoot:path.join(dir,'session')};
}
function manufacture(f){
 assert.equal(manufactureBatch({recipes:[docs[0]],outputRoot:f.sources.document}).accepted,1);
 assert.equal(manufactureQuoteBatch({recipes:[quotes[0]],outputRoot:f.sources.quote}).accepted,1);
 assert.equal(manufactureInventoryBatch({catalog:[inventory[0]],outputRoot:f.sources.inventory}).accepted,1);
}
const get=(port,route,headers={})=>new Promise((resolve,reject)=>{
 const req=http.request({hostname:'127.0.0.1',port,path:route,headers,timeout:4000},res=>{
  const chunks=[];res.on('data',v=>chunks.push(v));
  res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString('utf8'),headers:res.headers}));
 });req.on('error',reject);req.on('timeout',()=>req.destroy(Error('timeout')));req.end();
});
test('single launch runs authenticated versions of all three real assembled families together',async t=>{
 if(process.platform==='win32')return t.skip('Linux packaged acceptance required');
 const f=fixture(t);manufacture(f);
 const fleet=await launchPrivateFleet({sources:f.sources,stateRoot:f.stateRoot});t.after(()=>fleet.stop());
 assert.equal(fleet.apps.length,3);
 assert.equal(new Set(fleet.apps.map(v=>v.port)).size,3);
 assert.deepEqual(fleet.report.families,{document:1,quote:1,inventory:1});
 const reportFile=path.join(f.stateRoot,'preview-report.json');
 const report=JSON.parse(fs.readFileSync(reportFile));
 assert.equal(report.digest,fleet.report.digest);
 assert.equal(report.operatorKeysAbsentFromReport,true);
 const portal=await get(fleet.port,'/');
 assert.equal(portal.status,200);
 assert.match(portal.headers['content-security-policy'],/default-src 'none'/);
 assert.match(portal.body,/Release status: HOLD/);
 assert.equal((portal.body.match(/<article /g)||[]).length,3);
 assert.equal((await get(fleet.port,'/health',{Host:'evil.example'})).status,403);
 assert.equal((await get(fleet.port,'/health',{Origin:'https://evil.example'})).status,403);
 assert.equal((await get(fleet.port,'/random')).status,404);
 for(const app of fleet.apps){
  assert.ok(app.origin.startsWith('http://127.0.0.1:'));
  assert.equal((await get(app.port,'/app')).status,200);
  const stat=fs.statSync(app.privateCredentialFile);
  if(process.platform!=='win32')assert.equal(stat.mode&0o077,0);
  const cred=JSON.parse(fs.readFileSync(app.privateCredentialFile));
  assert.equal(cred.sourceDigest,app.digest);assert.equal(cred.syntheticOnly,true);
  for(const token of Object.values(cred.credentials)){
   assert.equal(token.length,43);
   assert.equal(portal.body.includes(token),false);
   assert.equal(JSON.stringify(report).includes(token),false);
  }
  assert.equal((await get(app.port,app.family==='document'?'/v1/workspaces':app.family==='quote'?'/v1/quotes':'/v1/context')).status,401);
 }
 const observed=await exercise(fleet);assert.equal(observed.passed,true);assert.equal(observed.apps,3);
 assert.equal(observed.externalMessagesSent,0);assert.equal(observed.paymentsSent,0);
 assert.equal(observed.publicHostingEnabled,false);assert.equal(observed.releaseApproved,false);
 await fleet.stop();await fleet.stop();
});
test('no duplicate session overwrite, no mismatched artifact set and no leaked secrets',async t=>{
 if(process.platform==='win32')return t.skip('Linux packaged acceptance required');
 const f=fixture(t);manufacture(f);
 const fleet=await launchPrivateFleet({sources:f.sources,stateRoot:f.stateRoot});
 await assert.rejects(launchPrivateFleet({sources:f.sources,stateRoot:f.stateRoot}),/PREVIEW_OUTPUT_EXISTS/);
 await fleet.stop();
 const readdir=fs.readdirSync(f.stateRoot);
 assert.ok(readdir.includes('preview-report.json'));
 assert.ok(readdir.some(name=>name.startsWith('document-')));
});
test('tampered packages and forged acceptance are refused before private session creation',async t=>{
 if(process.platform==='win32')return t.skip('Linux packaged acceptance required');
 const f=fixture(t);manufacture(f);
 const report=JSON.parse(fs.readFileSync(path.join(f.sources.document,'manufacturing-report.json')));
 const dir=path.join(f.sources.document,report.results[0].artifact);
 fs.appendFileSync(path.join(dir,'README.md'),'tamper');
 await assert.rejects(launchPrivateFleet({sources:f.sources,stateRoot:f.stateRoot}),/DEPLOYMENT_PACKAGE_INVALID/);
 assert.equal(fs.existsSync(f.stateRoot),false);
});
test('occupied portal port cleans up any privately launched services',async t=>{
 if(process.platform==='win32')return t.skip('Linux packaged acceptance required');
 const f=fixture(t);manufacture(f);
 const blocker=http.createServer((req,res)=>res.end('occupied'));
 await new Promise(resolve=>blocker.listen(0,'127.0.0.1',resolve));
 t.after(()=>{blocker.closeAllConnections();blocker.close();});
 await assert.rejects(launchPrivateFleet({sources:f.sources,stateRoot:f.stateRoot,portalPort:blocker.address().port}),/EADDRINUSE/);
 assert.equal(fs.existsSync(f.stateRoot),false);
});
test('portal source excludes scripts, remote requests, billing and external forms',()=>{
 const safe={family:'document',id:'safe-synthetic',title:'<script>unsafe</script>',origin:'http://127.0.0.1:8899'};
 const html=portalHTML([safe]);
 assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'));
 assert.doesNotMatch(html,/<script|<form|checkout|stripe/i);
 assert.doesNotMatch(CSP,/unsafe-inline|https:|connect-src 'self'/);
});
