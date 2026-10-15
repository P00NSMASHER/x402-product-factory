'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const recipes=require('./recipes.json');
let factory={};try{factory=require('./manufacturing');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
function folder(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'inventory-build-test-'));
 t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}
test('each supported inventory edition is independently compiled, run and audited',t=>{
 assert.equal(typeof factory.manufactureInventoryBatch,'function');
 const outputRoot=folder(t),result=factory.manufactureInventoryBatch({outputRoot});
 assert.equal(result.accepted,3);assert.equal(result.failed,0);assert.equal(result.results.length,3);
 assert.equal(result.verification,'executed-packaged-inventory-lifecycle');assert.equal(result.paymentsSent,0);
 assert.equal(result.releaseApproved,false);assert.equal(result.realCustomers,null);assert.equal(result.collectedRevenue,null);
 for(const entry of result.results){assert.equal(entry.status,'accepted');
  const dir=path.join(outputRoot,entry.artifact);
  const m=factory.verifyInventoryPackage(dir,entry.digest);
  assert.equal(m.releaseApproved,false);assert.equal(m.marketValidated,false);
  assert.equal(fs.existsSync(path.join(dir,'run.js')),true);
  const acceptance=JSON.parse(fs.readFileSync(path.join(outputRoot,'verification',entry.artifact+'.json')));
  assert.equal(acceptance.passed,true);assert.equal(acceptance.tenantIsolation,true);
  assert.equal(acceptance.verifiedReorderWorkflow,true);
 }
});
test('repeat manufacturing reuses existing apps but independently reexecutes acceptance',t=>{
 const outputRoot=folder(t),a=factory.manufactureInventoryBatch({outputRoot});
 const proof=path.join(outputRoot,'verification',a.results[0].artifact+'.json');
 const original=fs.readFileSync(proof),before=fs.statSync(proof,{bigint:true});
 const b=factory.manufactureInventoryBatch({outputRoot});
 assert.equal(a.accepted,3);assert.equal(b.reused,3);assert.equal(b.accepted,3);
 assert.ok(b.results.every(v=>v.reused===true));
 assert.deepEqual(fs.readFileSync(proof),original);assert.equal(fs.statSync(proof,{bigint:true}).mtimeNs,before.mtimeNs);
});
test('changing an assembled source file fails content integrity and is not accepted on repeat',t=>{
 const outputRoot=folder(t),a=factory.manufactureInventoryBatch({outputRoot});
 const dest=path.join(outputRoot,a.results[0].artifact);
 fs.appendFileSync(path.join(dest,'run.js'),'\nmalicious modification');
 assert.throws(()=>factory.verifyInventoryPackage(dest,a.results[0].digest),/ARTIFACT_INVALID/);
 const next=factory.manufactureInventoryBatch({outputRoot});assert.equal(next.failed,1);
 assert.equal(next.results[0].status,'quarantined');
});
test('relative outputs and repository-internal state directories are disallowed',()=>{
 assert.throws(()=>factory.manufactureInventoryBatch({outputRoot:'relative'}),/OUTPUT_UNSAFE/);
 assert.throws(()=>factory.manufactureInventoryBatch({outputRoot:__dirname}),/OUTPUT_UNSAFE/);
});
