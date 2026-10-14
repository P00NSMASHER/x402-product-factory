'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {manufactureBatch}=require('../manufacturing/line');
const {manufactureQuoteBatch}=require('../quote-family/manufacturing');
const {manufactureInventoryBatch}=require('../inventory-family/manufacturing');
const docs=require('../recipes.json'),quotes=require('../quote-family/recipes.json');
const inventory=require('../inventory-family/recipes.json');
const {launchPrivateFleet,resumePrivateFleet}=require('./fleet-preview');
const {acquireSession}=require('./session-lock');
const {parseHost,exerciseCrash}=require('../../../scripts/supervise-private-fleet');
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-process-recovery-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const sources={document:path.join(dir,'document'),quote:path.join(dir,'quote'),inventory:path.join(dir,'inventory')};
 const a=manufactureBatch({recipes:[docs[0]],outputRoot:sources.document});
 const b=manufactureQuoteBatch({recipes:[quotes[0]],outputRoot:sources.quote});
 const c=manufactureInventoryBatch({catalog:[inventory[0]],outputRoot:sources.inventory});
 for(const m of [a,b,c])assert.equal(m.accepted,1);
 return {dir,sources,stateRoot:path.join(dir,'private-state')};
}
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
test('full private fleet can be reopened after graceful exit without reprovisioning or credential rotation',async t=>{
 if(process.platform==='win32')return t.skip('Linux process-state acceptance required');
 const f=fixture(t),old=await launchPrivateFleet({sources:f.sources,stateRoot:f.stateRoot});
 const initial=old.apps.map(a=>({id:a.id,family:a.family,secret:sha(a.privateCredentialFile)}));
 const reportDigest=sha(path.join(f.stateRoot,'preview-report.json'));
 await assert.rejects(resumePrivateFleet({sources:f.sources,stateRoot:f.stateRoot}),/SESSION_ALREADY_ACTIVE/);
 await old.stop();
 const restarted=await resumePrivateFleet({sources:f.sources,stateRoot:f.stateRoot});t.after(()=>restarted.stop());
 assert.equal(restarted.resumed,true);assert.equal(restarted.apps.length,3);
 assert.equal(sha(path.join(f.stateRoot,'preview-report.json')),reportDigest);
 for(let i=0;i<restarted.apps.length;i++){
  assert.equal(restarted.apps[i].id,initial[i].id);
  assert.equal(sha(restarted.apps[i].privateCredentialFile),initial[i].secret);
  assert.equal((await fetch(restarted.apps[i].origin+'/health')).status,200);
 }
 await restarted.stop();
 assert.equal(fs.existsSync(path.join(f.stateRoot,'.factory-private-session-owner.json')),false);
});
test('real child SIGKILL and independently resumed host preserve tenant data, credentials and authorization',async t=>{
 if(process.platform==='win32')return t.skip('Linux process-state acceptance required');
 const f=fixture(t),args=parseHost(['--exercise-crash','--document',f.sources.document,
  '--quote',f.sources.quote,'--inventory',f.sources.inventory,'--state-root',f.stateRoot]);
 const proof=await exerciseCrash(args);
 assert.equal(proof.kind,'unattended-private-host-crash-recovery');assert.equal(proof.apps,3);
 assert.equal(proof.killedLauncher,true);assert.equal(proof.newLauncherBooted,true);
 assert.equal(proof.sqliteRecordStatePreserved,true);
 assert.equal(proof.syntheticCredentialHashesPreserved,true);
 assert.equal(proof.tenantApiBoundariesVerified,true);
 assert.equal(proof.externalContacts,0);assert.equal(proof.paymentsSent,0);
 assert.equal(proof.realCustomers,null);assert.equal(proof.releaseApproved,false);
 assert.equal(fs.existsSync(path.join(f.stateRoot,'.factory-private-session-owner.json')),false);
});
test('changed package and corrupted resume receipt do not reset private SQLite state or credentials',async t=>{
 if(process.platform==='win32')return t.skip('Linux process-state acceptance required');
 const f=fixture(t),fleet=await launchPrivateFleet({sources:f.sources,stateRoot:f.stateRoot});
 const credentials=fleet.apps.map(a=>({file:a.privateCredentialFile,digest:sha(a.privateCredentialFile)}));
 await fleet.stop();
 const filename=path.join(f.stateRoot,'preview-report.json'),original=fs.readFileSync(filename,'utf8');
 fs.writeFileSync(filename,original.replace('private-runnable-fleet','forged-accepted-fleet'));
 await assert.rejects(resumePrivateFleet({sources:f.sources,stateRoot:f.stateRoot}),/PREVIEW_RESUME_RECEIPT_INVALID/);
 fs.writeFileSync(filename,original);
 const store=path.join(f.stateRoot,'document-'+docs[0].id,'runtime.sqlite');
 const mode=fs.statSync(store).mode;
 fs.chmodSync(store,0o644);
 await assert.rejects(resumePrivateFleet({sources:f.sources,stateRoot:f.stateRoot}),/PREVIEW_RESUME_DATABASE_UNSAFE/);
 fs.chmodSync(store,mode&0o777);
 const report=JSON.parse(fs.readFileSync(path.join(f.sources.quote,'manufacturing-report.json'),'utf8'));
 fs.appendFileSync(path.join(f.sources.quote,report.apps[0].id+'-'+report.apps[0].digest,'recipe.json'),'\n');
 await assert.rejects(resumePrivateFleet({sources:f.sources,stateRoot:f.stateRoot}),/DEPLOYMENT_PACKAGE_INVALID/);
 for(const row of credentials)assert.equal(sha(row.file),row.digest);
 assert.equal(fs.existsSync(path.join(f.stateRoot,'.factory-private-session-owner.json')),false);
});
test('failed resume never erases original state even if portal port is already occupied',async t=>{
 if(process.platform==='win32')return t.skip('Linux process-state acceptance required');
 const http=require('node:http'),f=fixture(t);
 const old=await launchPrivateFleet({sources:f.sources,stateRoot:f.stateRoot});
 await old.stop();
 const blocker=http.createServer((req,res)=>res.end('blocked'));
 await new Promise(resolve=>blocker.listen(0,'127.0.0.1',resolve));
 try{
  await assert.rejects(resumePrivateFleet({sources:f.sources,stateRoot:f.stateRoot,
   portalPort:blocker.address().port}),/EADDRINUSE/);
  assert.ok(fs.existsSync(path.join(f.stateRoot,'preview-report.json')));
  assert.ok(fs.existsSync(path.join(f.stateRoot,'document-'+docs[0].id,'credentials.json')));
  assert.equal(fs.existsSync(path.join(f.stateRoot,'.factory-private-session-owner.json')),false);
 }finally{blocker.closeAllConnections();await new Promise(resolve=>blocker.close(resolve));}
});
test('private process owner refuses active PID, malformed symlink and unsafe reuse',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'private-session-lock-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const lock=acquireSession(root);
 assert.throws(()=>acquireSession(root),/SESSION_ALREADY_ACTIVE/);
 lock.release();lock.release();
 assert.equal(fs.existsSync(lock.file),false);
 fs.symlinkSync('/etc/hosts',lock.file);
 assert.throws(()=>acquireSession(root),/SESSION_LOCK_UNSAFE/);
 fs.rmSync(lock.file);
 fs.writeFileSync(lock.file,JSON.stringify({kind:'private-fleet-session-owner',pid:process.pid,
  nonce:'a'.repeat(32)})+'\n',{mode:0o600});
 assert.throws(()=>acquireSession(root),/SESSION_ALREADY_ACTIVE/);
});
test('no public or external host supervisors and no arbitrary paths or flags',()=>{
 for(const args of [[],['--contact'],['--watch'],['--exercise-crash','--public'],
  ['--resume-watch','--document','https://example.com','--quote','/tmp/b',
    '--inventory','/tmp/c','--state-root','/tmp/state'],
  ['--watch','--document','/tmp/a','--quote','/tmp/b','--inventory','/tmp/c',
    '--state-root','relative'],
  ['--watch','--document','/tmp/a','--quote','/tmp/b','--inventory','/tmp/c',
    '--state-root','/tmp/state','--port','443']]){
  assert.throws(()=>parseHost(args),/HOST_USAGE_INVALID|USAGE_INVALID/);
 }
});
