'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {manufactureBatch}=require('../manufacturing/line');
const {manufactureQuoteBatch}=require('../quote-family/manufacturing');
const {manufactureInventoryBatch}=require('../inventory-family/manufacturing');
const docs=require('../recipes.json'),quotes=require('../quote-family/recipes.json');
const inventory=require('../inventory-family/recipes.json');
const {launchPrivateFleet}=require('./fleet-preview');
const {createPrivateFleetSupervisor}=require('./private-supervisor');
const today=new Date().toISOString().slice(0,10);
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'private-fleet-supervisor-test-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sources={document:path.join(root,'docs'),quote:path.join(root,'quote'),inventory:path.join(root,'inventory')};
 assert.equal(manufactureBatch({recipes:[docs[0]],outputRoot:sources.document}).accepted,1);
 assert.equal(manufactureQuoteBatch({recipes:[quotes[0]],outputRoot:sources.quote}).accepted,1);
 assert.equal(manufactureInventoryBatch({catalog:[inventory[0]],outputRoot:sources.inventory}).accepted,1);
 return {root,sources,stateRoot:path.join(root,'session')};
}
const key=(app)=>JSON.parse(fs.readFileSync(app.privateCredentialFile,'utf8')).credentials.operator;
const hex=(file)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const get=async(app,route,token)=>{
 const r=await fetch(app.origin+route,{headers:token?{Authorization:'Bearer '+token}:{}});
 return {status:r.status,body:await r.json()};
};
async function post(app,route,token,key,body){
 const r=await fetch(app.origin+route,{method:'POST',headers:{Authorization:'Bearer '+token,
  'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});
 assert.ok([200,201].includes(r.status),app.family+' command response '+r.status);
 return r.json();
}
test('real three-family outages self-heal from the same private SQLite state with unchanged credentials',async t=>{
 if(process.platform==='win32')return t.skip('Independent Linux SQLite package QA required');
 const f=fixture(t),fleet=await launchPrivateFleet({sources:f.sources,stateRoot:f.stateRoot});
 t.after(()=>fleet.stop());
 const sup=createPrivateFleetSupervisor({fleet,maxRestarts:2});t.after(()=>sup.stop());
 const initial=await sup.tick();
 assert.equal(initial.healthy,3);assert.equal(initial.verifiedRecoveries,0);
 const oldOrigins=new Map(),credentials=new Map();
 for(const app of fleet.apps){oldOrigins.set(app.family,app.origin);
  credentials.set(app.family,{token:key(app),digest:hex(app.privateCredentialFile),file:app.privateCredentialFile});}
 const doc=fleet.apps.find(x=>x.family==='document'),qt=fleet.apps.find(x=>x.family==='quote');
 const stock=fleet.apps.find(x=>x.family==='inventory');
 await post(doc,'/v1/workspaces/'+docs[0].id+'/commands',credentials.get('document').token,
  'synthetic-doc-0001',{command:{type:'add',name:'Synthetic durable state',dueOn:today}});
 const until=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
 await post(qt,'/v1/quotes',credentials.get('quote').token,'synthetic-quote-0001',
  {clientLabel:'Synthetic estimate before outage',validUntil:until});
 await post(stock,'/v1/command',credentials.get('inventory').token,'synthetic-inventory-0001',
  {sku:inventory[0].items[0].id,command:{type:'receive',quantity:5},expectedRevision:1});
 for(const app of [...fleet.apps])await app.close();
 const recovered=await sup.tick();
 assert.equal(recovered.healthy,3);assert.equal(recovered.verifiedRecoveries,3);
 assert.equal(recovered.recoveryAttempts,3);assert.equal(recovered.quarantined,0);
 assert.equal(recovered.externalContacts,0);assert.equal(recovered.transmittedMessages,0);
 assert.equal(recovered.paymentsSent,0);assert.equal(recovered.releaseApproved,false);
 const report=JSON.parse(fs.readFileSync(sup.reportPath,'utf8'));
 const {digest,...unsigned}=report;
 assert.equal(digest,crypto.createHash('sha256').update(JSON.stringify(unsigned)).digest('hex'));
 if(process.platform!=='win32')assert.equal(fs.statSync(sup.reportPath).mode&0o077,0);
 for(const app of fleet.apps){
  const recorded=credentials.get(app.family);
  assert.equal(app.privateCredentialFile,recorded.file);
  assert.equal(hex(recorded.file),recorded.digest);
  assert.equal(key(app),recorded.token);
  assert.equal(JSON.stringify(report).includes(recorded.token),false);
  assert.equal((await get(app,'/health')).status,200);
 }
 assert.equal((await get(fleet.apps.find(a=>a.family==='document'),
  '/v1/workspaces/'+docs[0].id,credentials.get('document').token)).body.records.length,1);
 assert.equal((await get(fleet.apps.find(a=>a.family==='quote'),
  '/v1/quotes',credentials.get('quote').token)).body.length,1);
 const ctx=(await get(fleet.apps.find(a=>a.family==='inventory'),
  '/v1/context',credentials.get('inventory').token)).body;
 assert.equal(ctx.items.find(x=>x.sku===inventory[0].items[0].id).onHand,5);
 const portal=await (await fetch(fleet.origin+'/')).text();
 for(const app of fleet.apps)assert.ok(portal.includes(app.origin+'/app'));
 for(const old of oldOrigins.values())
  if(!fleet.apps.some(a=>a.origin===old))assert.equal(portal.includes(old+'/app'),false);
 const again=await sup.tick();assert.equal(again.recoveryAttempts,3);
 assert.equal(again.verifiedRecoveries,3);
});
test('tampered package cannot reset its durable quarantine budget by restarting the supervisor',async t=>{
 if(process.platform==='win32')return t.skip('Independent Linux SQLite package QA required');
 const f=fixture(t),fleet=await launchPrivateFleet({sources:f.sources,stateRoot:f.stateRoot});
 t.after(()=>fleet.stop());
 const sup=createPrivateFleetSupervisor({fleet,maxRestarts:2});
 const app=fleet.apps[0],secret=hex(app.privateCredentialFile);
 const report=JSON.parse(fs.readFileSync(path.join(f.sources.document,'manufacturing-report.json')));
 const pkg=path.join(f.sources.document,report.results[0].artifact);
 fs.appendFileSync(path.join(pkg,'README.md'),'\n/* adversarial modification */\n');
 await app.close();
 const first=await sup.tick();
 assert.equal(first.recoveryAttempts,1);assert.equal(first.quarantined,0);
 assert.equal(first.services[0].status,'unhealthy');
 sup.stop();
 const resumed=createPrivateFleetSupervisor({fleet,maxRestarts:3});t.after(()=>resumed.stop());
 assert.equal(resumed.report().recoveryAttempts,1);
 assert.equal(resumed.report().restartLimit,2,
  'a recreated supervisor must retain the original session budget');
 assert.equal(resumed.report().checks,1);
 const second=await resumed.tick();
 assert.equal(second.recoveryAttempts,2);assert.equal(second.quarantined,1);
 assert.equal(second.services[0].lastOutcome,'recovery_failed');
 resumed.stop();
 const held=createPrivateFleetSupervisor({fleet,maxRestarts:3});t.after(()=>held.stop());
 assert.equal(held.report().recoveryAttempts,2);
 assert.equal(held.report().quarantined,1,'raising the new process budget must not clear quarantine');
 const third=await held.tick();
 assert.equal(third.recoveryAttempts,2);assert.equal(third.quarantined,1);
 assert.equal(hex(app.privateCredentialFile),secret);
 assert.equal(third.externalContacts,0);
 assert.equal(third.publicHostingEnabled,false);
});
test('corrupt or source-mismatched watchdog checkpoints fail closed instead of resetting attempts',async t=>{
 if(process.platform==='win32')return t.skip('Linux package QA required');
 const f=fixture(t),fleet=await launchPrivateFleet({sources:f.sources,stateRoot:f.stateRoot});
 t.after(()=>fleet.stop());
 const sup=createPrivateFleetSupervisor({fleet,maxRestarts:2});
 await sup.tick();sup.stop();
 const filename=sup.reportPath,original=fs.readFileSync(filename,'utf8');
 fs.writeFileSync(filename,original.replace('"checks": 1','"checks": 0'));
 assert.throws(()=>createPrivateFleetSupervisor({fleet,maxRestarts:2}),
  /SUPERVISOR_CHECKPOINT_INVALID/);
 fs.writeFileSync(filename,original);
 const unsupported=JSON.parse(original);unsupported.schemaVersion=1;
 const unsupportedBody={...unsupported};delete unsupportedBody.digest;
 unsupported.digest=crypto.createHash('sha256').update(JSON.stringify(unsupportedBody)).digest('hex');
 fs.writeFileSync(filename,JSON.stringify(unsupported,null,2)+'\n',{mode:0o600});
 assert.throws(()=>createPrivateFleetSupervisor({fleet,maxRestarts:2}),
  /SUPERVISOR_CHECKPOINT_INVALID/);
 const report=JSON.parse(original);report.services[0].sourceDigest='0'.repeat(64);
 const sourceBody={...report};delete sourceBody.digest;
 report.digest=crypto.createHash('sha256').update(JSON.stringify(sourceBody)).digest('hex');
 fs.writeFileSync(filename,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 assert.throws(()=>createPrivateFleetSupervisor({fleet,maxRestarts:2}),
  /SUPERVISOR_CHECKPOINT_INVALID/);
});
test('supervisor rejects public URLs, duplicate IDs and unsafe restart budgets',async()=>{
 const fake={apps:[{family:'document',id:'sample',digest:'a'.repeat(64),origin:'https://example.com'}],
  stateRoot:'/tmp/state',recover:async()=>{},stop:async()=>{}};
 assert.throws(()=>createPrivateFleetSupervisor({fleet:fake}),/SUPERVISOR_ENDPOINT_INVALID/);
 fake.apps[0].origin='http://127.0.0.1:1234';
 for(const num of [0,-1,4,NaN])assert.throws(()=>
  createPrivateFleetSupervisor({fleet:fake,maxRestarts:num}),/SUPERVISOR_CONFIG_INVALID/);
 assert.throws(()=>createPrivateFleetSupervisor({fleet:fake,intervalMs:50}),/SUPERVISOR_CONFIG_INVALID/);
 fake.apps.push({...fake.apps[0]});
 assert.throws(()=>createPrivateFleetSupervisor({fleet:fake}),/SUPERVISOR_CONFIG_INVALID/);
});
test('watchdog scheduling is in-process local-only and cleanly stops with preview',async t=>{
 if(process.platform==='win32')return t.skip('Linux package QA');
 const f=fixture(t),fleet=await launchPrivateFleet({sources:f.sources,stateRoot:f.stateRoot});
 t.after(()=>fleet.stop());
 const watch=createPrivateFleetSupervisor({fleet,maxRestarts:1,intervalMs:300});
 assert.deepEqual(watch.start(),{enabled:true,intervalMs:300,loopbackOnly:true,contactsSent:0});
 assert.throws(()=>watch.start(),/SUPERVISOR_ALREADY_RUNNING/);
 const x=await watch.tick();assert.equal(x.healthy,3);
 assert.equal(watch.stop().externalContacts,0);
 await assert.rejects(watch.tick(),/SUPERVISOR_STOPPED/);
});


test('restart is durably consumed before asynchronous recovery can be interrupted', {timeout:15000}, async t=>{
 if(process.platform==='win32')return t.skip('Linux private-checkpoint semantics');
 const http=require('node:http');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'supervisor-crash-window-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const server=http.createServer((_req,res)=>{
  res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});
  res.end('{"status":"down"}');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 let reached,release;
 const recoveryEntered=new Promise(resolve=>{reached=resolve;});
 const recoveryBlocked=new Promise(resolve=>{release=resolve;});
 const fleet={stateRoot:root,
  apps:[{family:'document',id:'test-package',digest:'a'.repeat(64),
   origin:'http://127.0.0.1:'+server.address().port}],
  recover:async()=>{reached();await recoveryBlocked;throw Error('interrupted recovery');},
  stop:async()=>{}};
 const supervisor=createPrivateFleetSupervisor({fleet,maxRestarts:1});
 t.after(()=>supervisor.stop());
 const pending=supervisor.tick();
 try{
  await recoveryEntered;
  const receipt=JSON.parse(fs.readFileSync(supervisor.reportPath,'utf8'));
  assert.equal(receipt.recoveryAttempts,1,
   'the attempt must be persisted while recovery is still in flight');
  assert.equal(receipt.services[0].status,'unhealthy');
  assert.equal(receipt.services[0].lastOutcome,'pending');
  const resumed=createPrivateFleetSupervisor({fleet,maxRestarts:1});
  t.after(()=>resumed.stop());
  assert.equal(resumed.report().recoveryAttempts,1);
  assert.equal(resumed.report().quarantined,1,
   'a recreated watchdog must not grant a third attempt');
 }finally{
  release();
  await pending;
 }
});
