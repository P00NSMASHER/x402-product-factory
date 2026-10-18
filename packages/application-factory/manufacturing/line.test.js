'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const recipes=require('../recipes.json'),A=require('./assembler');
let L={};try{L=require('./line');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
function setup(t){assert.equal(typeof L.manufactureBatch,'function','resumable manufacturing line must exist');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-line-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function receipt(root,digest){const manifest=A.verifyApplication(root,digest);return {kind:'assembled-application-acceptance',passed:true,recipeId:manifest.recipeId,artifactDigest:digest,
 tenantIsolation:true,idempotentIntake:true,encryptedEvidence:true,headlessAutomation:true,restartPersistence:true,verifiedRecovery:true,oldCredentialsRejected:true,
 realCustomers:null,collectedRevenue:null,paymentsSent:0,externalMessagesSent:0,releaseApproved:false};}
test('one batch assembles three isolated applications and writes bounded evidence',t=>{
 const outputRoot=setup(t),r=L.manufactureBatch({recipes,outputRoot,accept:receipt});
 assert.equal(r.accepted,3);assert.equal(r.failed,0);assert.equal(r.reused,0);assert.equal(r.releaseApproved,false);
 for(const row of r.results){assert.equal(row.status,'accepted');assert.ok(fs.existsSync(path.join(outputRoot,row.artifact,'manifest.json')));}
});
test('rerun verifies and reuses accepted artifacts without rebuilding them',t=>{
 const outputRoot=setup(t),first=L.manufactureBatch({recipes,outputRoot,accept:receipt}),entry=path.join(outputRoot,first.results[0].artifact,'manifest.json');
 const proof=path.join(outputRoot,'verification',first.results[0].artifact+'.json');
 const original=fs.readFileSync(proof),proofStat=fs.statSync(proof,{bigint:true});
 const before=fs.statSync(entry).mtimeMs;let checks=0;
 const again=L.manufactureBatch({recipes,outputRoot,accept:(...args)=>{checks++;return receipt(...args);}});
 assert.equal(again.accepted,3);assert.equal(again.reused,3);assert.equal(checks,3);assert.equal(fs.statSync(entry).mtimeMs,before);
 assert.deepEqual(fs.readFileSync(proof),original);assert.equal(fs.statSync(proof,{bigint:true}).mtimeNs,proofStat.mtimeNs);
});
test('bounded transient failure retries the same edition then accepts',t=>{
 const outputRoot=setup(t);let attempts=0;
 const r=L.manufactureBatch({recipes:[recipes[0]],outputRoot,accept:(...args)=>{if(++attempts===1)throw new Error('PRIVATE_FAILURE');return receipt(...args);}});
 assert.equal(r.accepted,1);assert.equal(r.results[0].attempts,2);assert.equal(JSON.stringify(r).includes('PRIVATE_FAILURE'),false);
});
test('a repeatedly failing edition is quarantined while healthy editions complete',t=>{
 const outputRoot=setup(t);let badAttempts=0;
 const accept=(root,digest)=>{if(A.verifyApplication(root,digest).recipeId===recipes[1].id){badAttempts++;throw new Error('PRIVATE_KEY');}return receipt(root,digest);};
 const r=L.manufactureBatch({recipes,outputRoot,maxAttempts:2,accept});assert.equal(r.accepted,2);assert.equal(r.failed,1);assert.equal(badAttempts,2);
 assert.equal(r.results[1].status,'quarantined');assert.equal(JSON.stringify(r).includes('PRIVATE_KEY'),false);
 const next=L.manufactureBatch({recipes,outputRoot,accept});assert.equal(next.results[1].status,'quarantined');assert.equal(badAttempts,2);
 const retry=L.manufactureBatch({recipes,outputRoot,retryFailed:true,accept:receipt});assert.equal(retry.accepted,3);
});
test('corrupted accepted artifact is never silently overwritten or counted as passing',t=>{
 const outputRoot=setup(t),r=L.manufactureBatch({recipes,outputRoot,accept:receipt}),file=path.join(outputRoot,r.results[0].artifact,'README.md');fs.appendFileSync(file,'tampered');
 const next=L.manufactureBatch({recipes,outputRoot,accept:receipt});assert.equal(next.accepted,2);assert.equal(next.failed,1);assert.match(fs.readFileSync(file,'utf8'),/tampered$/);
});
test('changed accepted receipt is never replaced by a later successful execution',t=>{
 const outputRoot=setup(t),r=L.manufactureBatch({recipes:[recipes[0]],outputRoot,accept:receipt});
 const proof=path.join(outputRoot,'verification',r.results[0].artifact+'.json');
 const changed=fs.readFileSync(proof,'utf8').replace('"passed": true','"passed": false');
 fs.writeFileSync(proof,changed,{mode:0o600});
 const next=L.manufactureBatch({recipes:[recipes[0]],outputRoot,accept:receipt});
 assert.equal(next.accepted,0);assert.equal(next.failed,1);
 assert.equal(next.results[0].reason,'EXISTING_ARTIFACT_REJECTED');
 assert.equal(fs.readFileSync(proof,'utf8'),changed);
});
test('forged or incomplete verifier receipts cannot promote a candidate',t=>{
 const outputRoot=setup(t),r=L.manufactureBatch({recipes:[recipes[0]],outputRoot,accept:()=>({passed:true})});
 assert.equal(r.accepted,0);assert.equal(r.results[0].status,'quarantined');
 assert.equal(fs.readdirSync(outputRoot).some(name=>name.startsWith('supplier-desk-')),false);
});
test('single-writer lock fails closed and does not remove another owner lock',t=>{
 const outputRoot=setup(t),lock=path.join(outputRoot,'.manufacturing.lock');fs.writeFileSync(lock,'other owner');
 assert.throws(()=>L.manufactureBatch({recipes,outputRoot,accept:receipt}),/MANUFACTURING_BUSY/);assert.equal(fs.readFileSync(lock,'utf8'),'other owner');
});
test('a real SIGKILL leaves evidence but does not permanently block manufacturing', {timeout:15000}, async t=>{
 if(process.platform==='win32')return t.skip('Linux process ownership acceptance required');
 const outputRoot=setup(t),marker=path.join(outputRoot,'acceptance-entered');
 const script="const fs=require('node:fs');const {manufactureBatch}=require(process.argv[1]);"+
  "const recipes=require(process.argv[2]);manufactureBatch({recipes:[recipes[0]],outputRoot:process.argv[3],"+
  "accept:()=>{fs.writeFileSync(process.argv[4],'ready');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);}});";
 const child=spawn(process.execPath,['-e',script,require.resolve('./line'),require.resolve('../recipes.json'),outputRoot,marker],
  {stdio:'ignore'});t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
 const deadline=Date.now()+5000;
 while(!fs.existsSync(marker)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(fs.existsSync(marker),true,'child never reached packaged acceptance');
 child.kill('SIGKILL');await once(child,'exit');
 const resumed=L.manufactureBatch({recipes:[recipes[0]],outputRoot,accept:receipt});
 assert.equal(resumed.accepted,1);assert.equal(resumed.failed,0);
 const history=path.join(outputRoot,'.lock-history');
 assert.equal(fs.readdirSync(history).filter(name=>name.endsWith('.lock')).length,1);
 const event=JSON.parse(fs.readFileSync(path.join(history,
  fs.readdirSync(history).find(name=>name.endsWith('.json'))),'utf8'));
 assert.equal(event.kind,'stale-private-process-lock-recovery');
 assert.ok(Number.isFinite(Date.parse(event.observedDeadAt)));
 assert.equal(event.original.pid,child.pid);assert.equal(event.originalDigest.length,64);
});
test('invalid batch and duplicate edition IDs are rejected before writing files',t=>{
 const outputRoot=setup(t);for(const batch of [[],[recipes[0],recipes[0]],Array(101).fill(recipes[0])])assert.throws(()=>L.manufactureBatch({recipes:batch,outputRoot,accept:receipt}),/BATCH_INVALID/);
 assert.deepEqual(fs.readdirSync(outputRoot),[]);
});
test('new source identity does not replace an earlier accepted version',t=>{
 const outputRoot=setup(t),a=L.manufactureBatch({recipes:[recipes[0]],outputRoot,accept:receipt});
 const changed={...recipes[0],title:'Supply Desk revised'},b=L.manufactureBatch({recipes:[changed],outputRoot,accept:receipt});
 assert.notEqual(a.results[0].digest,b.results[0].digest);assert.ok(fs.existsSync(path.join(outputRoot,a.results[0].artifact)));
});
test('100 configured editions use the same assembly line and remain noncommercial',t=>{
 const outputRoot=setup(t),batch=Array.from({length:100},(_,i)=>({...recipes[i%3],id:'synthetic-'+i}));
 const r=L.manufactureBatch({recipes:batch,outputRoot,accept:receipt});assert.equal(r.accepted,100);assert.equal(r.results.length,100);
 assert.equal(r.realCustomers,null);assert.equal(r.collectedRevenue,null);
});
