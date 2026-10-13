'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {runCycle}=require('./loop');
const {planRecovery}=require('./supervisor');
let subject={};try{subject=require('./checkpoint');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
const epoch=Date.parse('2026-10-13T00:00:00Z'),slot=21600000,at=n=>new Date(epoch+n*slot).toISOString();
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-durable-checkpoint-'));
 const source=path.join(dir,'source'),destination=path.join(dir,'destination');fs.mkdirSync(source,{mode:0o700});
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {source,destination,dir};}
const restore=(source,destination,extra={})=>{
 assert.equal(typeof subject.restoreCheckpoint,'function','checkpoint restore implementation missing');
 return subject.restoreCheckpoint({sourceRoot:source,outputRoot:destination,...extra});
};
test('restores actual verified app, its receipt and independent acceptance in another directory',t=>{
 const f=fixture(t),built=runCycle({at:at(0),outputRoot:f.source});
 assert.equal(built.accepted,1);assert.equal(built.verification,'executed-packaged-workflow');
 const report=restore(f.source,f.destination);
 assert.equal(report.verifiedImports,1);assert.equal(report.skippedFixtures,0);
 assert.equal(report.transmittedMessages,0);assert.equal(report.paymentsSent,0);
 assert.equal(report.realCustomers,null);assert.equal(report.collectedRevenue,null);assert.equal(report.releaseApproved,false);
 const plan=planRecovery({at:at(0),outputRoot:f.destination,windowCycles:1});
 assert.equal(plan.skippedCompleted,1);assert.equal(plan.selectedCycle,null);
});
test('second restore is idempotent and never overwrites an accepted package',t=>{
 const f=fixture(t);runCycle({at:at(0),outputRoot:f.source});
 const first=restore(f.source,f.destination),next=restore(f.source,f.destination);
 assert.equal(first.verifiedImports,1);assert.equal(next.verifiedImports,0);
 assert.equal(next.alreadyPresent,1);
 assert.equal(fs.readdirSync(path.join(f.destination,'autonomy')).filter(v=>/^cycle-\d+\.json$/.test(v)).length,1);
});
test('tampered package is refused and never given a verified destination receipt',t=>{
 const f=fixture(t),r=runCycle({at:at(0),outputRoot:f.source});
 fs.appendFileSync(path.join(f.source,r.artifacts[0].artifact,'manifest.json'),'\nchanged');
 assert.throws(()=>restore(f.source,f.destination),/CHECKPOINT_INVALID|RECOVERY_ARTIFACT_INVALID/);
 assert.equal(fs.existsSync(path.join(f.destination,'autonomy','cycle-0.json')),false);
});
test('altering recorded accepted count cannot be restored',t=>{
 const f=fixture(t);runCycle({at:at(0),outputRoot:f.source});
 const file=path.join(f.source,'autonomy','cycle-0.json');
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('"accepted": 1','"accepted": 5'));
 assert.throws(()=>restore(f.source,f.destination),/CHECKPOINT_INVALID|RECOVERY_RECEIPT_INVALID/);
});
test('injected synthetic acceptance cannot be promoted by a cross-run restore',t=>{
 const f=fixture(t),{verifyApplication}=require('../manufacturing/assembler'),{CHECKS}=require('../manufacturing/acceptance');
 const fake=(root,digest)=>{const app=verifyApplication(root,digest);
  return {kind:'assembled-application-acceptance',passed:true,recipeId:app.recipeId,artifactDigest:digest,
   ...Object.fromEntries(CHECKS.map(k=>[k,true])),
   externalMessagesSent:0,paymentsSent:0,realCustomers:null,collectedRevenue:null,releaseApproved:false};};
 const r=runCycle({at:at(0),outputRoot:f.source,accept:fake});assert.equal(r.accepted,1);
 const report=restore(f.source,f.destination);assert.equal(report.verifiedImports,0);
 assert.equal(report.skippedFixtures,1);assert.equal(report.releaseApproved,false);
 assert.equal(fs.existsSync(path.join(f.destination,'autonomy','cycle-0.json')),false);
});
test('quarantined source cycles are skipped without reattempting the failed package',t=>{
 const f=fixture(t);const r=runCycle({at:at(0),outputRoot:f.source,accept:()=>{throw Error('synthetic failure');}});
 assert.equal(r.failed,1);
 const report=restore(f.source,f.destination);assert.equal(report.verifiedImports,0);
 assert.equal(report.skippedQuarantined,1);assert.equal(report.transmittedMessages,0);
});
test('conflicting pre-existing target app or receipt cannot be silently overwritten',t=>{
 const f=fixture(t);runCycle({at:at(0),outputRoot:f.source});
 restore(f.source,f.destination);
 const file=path.join(f.destination,'autonomy','cycle-0.json');
 fs.appendFileSync(file,'\nNOT-THE-SAME');
 assert.throws(()=>restore(f.source,f.destination),/CHECKPOINT_CONFLICT|RECOVERY_RECEIPT_INVALID/);
 assert.match(fs.readFileSync(file,'utf8'),/NOT-THE-SAME/);
});
test('invalid lookback limits and source inside repository are rejected',t=>{
 const f=fixture(t);
 for(const maxCycles of [0,33,-1,'8',2.5])assert.throws(
  ()=>restore(f.source,f.destination,{maxCycles}),/CHECKPOINT_CONFIG_INVALID/);
 assert.throws(()=>restore('relative',f.destination),/CHECKPOINT_PATH_UNSAFE/);
 assert.throws(()=>restore(f.source,path.resolve(__dirname,'../recipes.json')),/CHECKPOINT_PATH_UNSAFE/);
});
test('symlinked source objects cannot escape a private checkpoint archive',t=>{
 if(process.platform==='win32')return;
 const f=fixture(t);runCycle({at:at(0),outputRoot:f.source});
 const receipt=path.join(f.source,'autonomy','cycle-0.json'),other=path.join(f.dir,'external.json');
 fs.renameSync(receipt,other);fs.symlinkSync(other,receipt);
 assert.throws(()=>restore(f.source,f.destination),/CHECKPOINT_INVALID|RECOVERY_RECEIPT_INVALID/);
});
test('empty directory yields an explicit zero-state report without contacts, money, or guessing',t=>{
 const f=fixture(t);const r=restore(f.source,f.destination);
 assert.equal(r.verifiedImports,0);assert.equal(r.alreadyPresent,0);
 assert.equal(r.realCustomers,null);assert.equal(r.collectedRevenue,null);
 assert.equal(r.releaseApproved,false);assert.equal(r.outreachEnabled,false);
});
test('restores the newest candidate if a prior snapshot covers more than the requested limit',t=>{
 const f=fixture(t);runCycle({at:at(0),outputRoot:f.source});runCycle({at:at(1),outputRoot:f.source});
 const r=restore(f.source,f.destination,{maxCycles:1});
 assert.equal(r.verifiedImports,1);assert.deepEqual(r.cyclesRestored,[1]);
 assert.equal(fs.existsSync(path.join(f.destination,'autonomy','cycle-0.json')),false);
 assert.equal(planRecovery({at:at(1),outputRoot:f.destination,windowCycles:1}).skippedCompleted,1);
});
