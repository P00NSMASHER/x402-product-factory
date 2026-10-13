"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const recipes = require('../recipes.json');
const target = path.join(__dirname, 'runtime.js');
const factory = fs.existsSync(target) ? require(target) : {};
const BASE = Date.parse('2026-10-13T12:00:00Z');
function setup(t) {
  assert.equal(typeof factory.openRuntime, 'function', 'persistent runtime must exist');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-durable-test-'));
  const filename = path.join(dir, 'state.sqlite');
  let now = BASE;
  const instances = [];
  function open() { const r = factory.openRuntime({filename, recipes, clock:()=>now}); instances.push(r); return r; }
  const runtime = open();
  t.after(()=>{for(const r of instances)r.close();fs.rmSync(dir,{recursive:true,force:true});});
  return {dir,filename,runtime,open,setNow:n=>{now=n;}};
}
function provision(r,tenant='customer-a',workspace='main',recipe=recipes[0].id) {
  const {token} = r.provisionTenant(tenant);
  r.createWorkspace(token,{id:workspace,recipeId:recipe});
  return token;
}
function add(r,token,key='request-1',name='Synthetic supplier') {
  return r.command(token,'main',{type:'add',name,dueOn:'2026-10-13'},key);
}
test('runtime persists intake and stores no raw bearer credential',t=>{
  const x=setup(t), token=provision(x.runtime); add(x.runtime,token); x.runtime.close();
  const again=x.open(); assert.equal(again.workspace(token,'main').snapshot.records.length,1);
  const db=new DatabaseSync(x.filename);const row=db.prepare('SELECT * FROM tenants').get();db.close();
  assert.equal(JSON.stringify(row).includes(token),false);assert.equal(row.token_hash.length,64);
});
test('same workspace IDs remain isolated across customers',t=>{
  const {runtime:r}=setup(t),a=provision(r),b=provision(r,'customer-b');add(r,a);
  assert.equal(r.workspace(b,'main').snapshot.records.length,0);
  assert.throws(()=>r.command(b,'main',{type:'archive',recordId:'r1'},'b-request'),/RECORD_UNKNOWN/);
  r.createWorkspace(a,{id:'private-a',recipeId:recipes[0].id});assert.throws(()=>r.workspace(b,'private-a'),/NOT_FOUND/);
  assert.equal(r.workspaces(b).length,1);
});
test('invalid revoked and rotated credentials cannot read persisted data',t=>{
  const {runtime:r}=setup(t), token=provision(r);
  assert.throws(()=>r.workspaces('not-a-credential'),/UNAUTHORIZED/);
  const next=r.rotateCredential('customer-a').token;
  assert.throws(()=>r.workspaces(token),/UNAUTHORIZED/);assert.equal(r.workspaces(next).length,1);
  r.revokeTenant('customer-a');assert.throws(()=>r.workspaces(next),/UNAUTHORIZED/);
});
test('duplicate command replays the original result and conflicting key reuse fails',t=>{
  const {runtime:r}=setup(t),token=provision(r),a=add(r,token);
  assert.deepEqual(add(r,token),a);assert.equal(r.workspace(token,'main').snapshot.records.length,1);
  assert.throws(()=>add(r,token,'request-1','Different supplier'),/IDEMPOTENCY_CONFLICT/);
});
test('expected version rejects stale writes without partial changes',t=>{
  const {runtime:r}=setup(t),token=provision(r);add(r,token);
  assert.throws(()=>r.command(token,'main',{type:'add',name:'Second',dueOn:'2026-10-13'},'request-2',0),/VERSION_CONFLICT/);
  assert.equal(r.workspace(token,'main').snapshot.records.length,1);
});
test('client commands cannot inject tenant identity clock snapshots or unknown fields',t=>{
  const {runtime:r}=setup(t),token=provision(r);
  for(const extra of [{tenantId:'customer-b'},{today:'2030-01-01'},{snapshot:{}},{price:4}])
    assert.throws(()=>r.command(token,'main',{type:'add',name:'Test',dueOn:'2026-10-13',...extra},'bad'),/COMMAND_INVALID/);
  assert.throws(()=>r.createWorkspace(token,{id:'other',recipeId:recipes[0].id,tenantId:'customer-b'}),/WORKSPACE_INVALID/);
});
test('two connections cannot claim the same active job',t=>{
  const x=setup(t);provision(x.runtime);const b=x.open();
  const first=x.runtime.claimDue();assert.ok(first);assert.equal(b.claimDue(),null);
});
test('expired claims are recoverable and fenced from committing',t=>{
  const x=setup(t),token=provision(x.runtime);add(x.runtime,token);const stale=x.runtime.claimDue();
  x.setNow(BASE+31000);const fresh=x.open().claimDue();assert.ok(fresh);assert.notEqual(fresh.leaseToken,stale.leaseToken);
  assert.throws(()=>x.runtime.finishClaim(stale),/LEASE_LOST/);
  x.runtime.finishClaim(fresh);assert.equal(x.runtime.inbox(token,'main').length,1);
});
test('catch-up persists one current notification and repeated sweeps do not duplicate it',t=>{
  const x=setup(t),token=provision(x.runtime);add(x.runtime,token);x.runtime.close();x.setNow(BASE+20*86400000);
  const r=x.open();assert.equal(r.sweep().completed,1);assert.equal(r.inbox(token,'main').length,1);
  assert.equal(r.sweep().claimed,0);x.setNow(BASE+20*86400000+61000);r.sweep();assert.equal(r.inbox(token,'main').length,1);
  assert.equal(r.workspace(token,'main').snapshot.today,'2026-11-02');
});
test('completion cancels obsolete inbox items and prevents new reminders',t=>{
  const x=setup(t),r=x.runtime,token=provision(r);add(r,token);r.sweep();assert.equal(r.inbox(token,'main')[0].status,'open');
  for(const req of recipes[0].requirements)r.command(token,'main',{type:'receive',recordId:'r1',requirementId:req.id,...(req.renewable?{expiresOn:'2028-01-01'}:{})},'doc-'+req.id);
  assert.ok(r.inbox(token,'main').every(i=>i.status==='cancelled'));x.setNow(BASE+4*86400000);r.sweep();assert.equal(r.inbox(token,'main').length,1);
});
test('archived intake cancels notifications',t=>{
  const {runtime:r}=setup(t),token=provision(r);add(r,token);r.sweep();r.command(token,'main',{type:'archive',recordId:'r1'},'archive');
  assert.equal(r.inbox(token,'main')[0].status,'cancelled');
});
test('pause revokes outstanding lease; resume schedules immediate work',t=>{
  const {runtime:r}=setup(t),token=provision(r);add(r,token);const claim=r.claimDue();
  r.command(token,'main',{type:'automation',enabled:false},'pause');assert.throws(()=>r.finishClaim(claim),/LEASE_LOST/);assert.equal(r.claimDue(),null);
  r.command(token,'main',{type:'automation',enabled:true},'resume');assert.equal(r.sweep().completed,1);
});
test('corrupt snapshot rolls back and quarantines without blocking healthy workspaces',t=>{
  const x=setup(t),r=x.runtime,token=provision(r);add(r,token);r.createWorkspace(token,{id:'healthy',recipeId:recipes[1].id});
  const db=new DatabaseSync(x.filename);db.prepare("UPDATE workspaces SET snapshot = '{}' WHERE id='main'").run();db.close();
  let report=r.sweep();assert.equal(report.failed,1);assert.equal(report.completed,1);assert.equal(r.inbox(token,'main').length,0);
  assert.equal(r.workspaces(token).find(w=>w.id==='main').lastError,'SNAPSHOT_INVALID');
  assert.equal(r.sweep().claimed,0);x.setNow(BASE+60001);r.sweep();x.setNow(BASE+180002);r.sweep();
  const state=r.workspaces(token).find(w=>w.id==='main');assert.equal(state.failures,3);assert.equal(state.quarantined,true);
  x.setNow(BASE+86400000);assert.equal(r.claimDue()?.workspaceId,'healthy');
});
test('failure receipt never stores raw error messages and stale failures cannot overwrite jobs',t=>{
  const {runtime:r}=setup(t),token=provision(r),claim=r.claimDue();
  r.failClaim(claim,new Error('PRIVATE_CUSTOMER_SECRET'));
  assert.equal(r.workspaces(token)[0].lastError,'AUTOMATION_FAILED');
  assert.throws(()=>r.failClaim(claim,new Error('again')),/LEASE_LOST/);
});
test('clock rollback is rejected without changing snapshots',t=>{
  const x=setup(t),token=provision(x.runtime);add(x.runtime,token);const before=x.runtime.workspace(token,'main').snapshot;
  x.setNow(BASE-86400000);assert.throws(()=>add(x.runtime,token,'next'),/CLOCK_INVALID/);
  assert.deepEqual(x.runtime.workspace(token,'main').snapshot,before);
});
test('unknown database versions and corrupt database files fail closed',t=>{
  const x=setup(t);x.runtime.close();const db=new DatabaseSync(x.filename);db.exec('PRAGMA user_version = 99');db.close();
  assert.throws(()=>x.open(),/SCHEMA_UNSUPPORTED/);
});
test('database files have private permissions on POSIX',t=>{
  const x=setup(t);if(process.platform!=='win32')assert.equal(fs.statSync(x.filename).mode&0o777,0o600);
});
test('all three existing recipes run through persisted APIs and renew automatically',t=>{
  const x=setup(t),r=x.runtime;
  for(const [i,recipe] of recipes.entries()){
    const token=provision(r,'customer-'+String.fromCharCode(97+i),'main',recipe.id);add(r,token);
    for(const req of recipe.requirements)r.command(token,'main',{type:'receive',recordId:'r1',requirementId:req.id,...(req.renewable?{expiresOn:'2026-12-31'}:{})},'doc-'+req.id);
    assert.equal(r.workspace(token,'main').records[0].status,'complete');
  }
  x.setNow(Date.parse('2026-12-20T12:00:00Z'));const report=r.sweep();assert.equal(report.completed,3);assert.equal(report.notifications,2);
});
test('100 persisted workspaces recover after restart without any browser',t=>{
  const x=setup(t),tokens=[];
  for(let i=0;i<100;i++){const token=provision(x.runtime,'customer-n'+i,'main',recipes[i%3].id);tokens.push(token);add(x.runtime,token);}
  x.runtime.close();const r=x.open();let completed=0,notifications=0;
  for(let i=0;i<4;i++){const n=r.sweep();completed+=n.completed;notifications+=n.notifications;}
  assert.equal(completed,100);assert.equal(notifications,100);assert.equal(r.sweep().claimed,0);
  for(const token of tokens)assert.equal(r.inbox(token,'main').length,1);
});
test('a foreign SQLite database cannot masquerade as runtime schema version one',t=>{
  const x=setup(t);x.runtime.close();fs.rmSync(x.filename,{force:true});
  const db=new DatabaseSync(x.filename);db.exec('CREATE TABLE unrelated(value TEXT); PRAGMA user_version=1;');db.close();
  assert.throws(()=>x.open(),/SCHEMA_UNSUPPORTED/);
});
test('lease expiration during commit rolls back both notification and snapshot changes',t=>{
  const x=setup(t),token=provision(x.runtime);add(x.runtime,token);const before=x.runtime.workspace(token,'main');const claim=x.runtime.claimDue();
  // A separate runtime uses the real same DB with a clock crossing the lease boundary.
  let calls=0;const r=factory.openRuntime({filename:x.filename,recipes,clock:()=>++calls===1?BASE:BASE+31000});
  try{assert.throws(()=>r.finishClaim(claim),/LEASE_LOST/);assert.equal(r.inbox(token,'main').length,0);
    assert.deepEqual(r.workspace(token,'main').snapshot,before.snapshot);assert.equal(r.workspace(token,'main').version,before.version);
  }finally{r.close();}
});
test('reopening malformed database bytes refuses to manufacture a replacement state',t=>{
  const x=setup(t);x.runtime.close();fs.writeFileSync(x.filename,'not a sqlite database');
  assert.throws(()=>x.open());assert.equal(fs.readFileSync(x.filename,'utf8'),'not a sqlite database');
});
test('revocation also fences already claimed work',t=>{
  const {runtime:r}=setup(t);provision(r);const claim=r.claimDue();r.revokeTenant('customer-a');
  assert.throws(()=>r.finishClaim(claim),/LEASE_LOST/);assert.equal(r.claimDue(),null);
});
test('POSIX refuses a shared state directory instead of silently weakening isolation',t=>{
  const x=setup(t);if(process.platform==='win32')return;
  fs.chmodSync(x.dir,0o755);try{assert.throws(()=>x.open(),/STATE_PATH_UNSAFE/);}finally{fs.chmodSync(x.dir,0o700);}
});
