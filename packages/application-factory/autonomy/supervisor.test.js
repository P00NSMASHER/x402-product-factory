'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {runCycle}=require('./loop');
const {verifyApplication}=require('../manufacturing/assembler');
const {CHECKS}=require('../manufacturing/acceptance');
let subject={};try{subject=require('./supervisor');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const EPOCH=Date.parse('2026-10-13T00:00:00Z'),SLOT=21600000;
const time=i=>new Date(EPOCH+i*SLOT).toISOString();
function output(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'factory-backfill-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}
function standIn(folder,digest){const app=verifyApplication(folder,digest);
 return {kind:'assembled-application-acceptance',passed:true,recipeId:app.recipeId,artifactDigest:digest,
 ...Object.fromEntries(CHECKS.map(k=>[k,true])),externalMessagesSent:0,paymentsSent:0,
 realCustomers:null,collectedRevenue:null,releaseApproved:false};}
const acceptance=process.platform==='win32'?standIn:undefined;
test('oldest missed scheduled candidate is selected before the newest',t=>{
 const d=output(t);
 assert.equal(typeof subject.planRecovery,'function');
 const p=subject.planRecovery({at:time(4),outputRoot:d,windowCycles:3});
 assert.equal(p.selectedCycle,2);assert.equal(p.currentCycle,4);
 assert.equal(p.nextAction,'manufacture_and_verify');assert.equal(p.releaseApproved,false);
});
test('one recovered cycle is built and its receipt written',t=>{
 const d=output(t);assert.equal(typeof subject.runRecovery,'function');
 const r=subject.runRecovery({at:time(2),outputRoot:d,windowCycles:2,...(acceptance?{accept:acceptance}:{})});
 assert.equal(r.selectedCycle,1);assert.equal(r.accepted,1);assert.equal(r.failed,0);
 assert.equal(r.releaseApproved,false);assert.equal(r.realCustomers,null);
 assert.equal(r.collectedRevenue,null);assert.equal(r.transmittedMessages,0);
 assert.equal(fs.existsSync(path.join(d,'autonomy','cycle-1.json')),true);
});
test('previously completed app is skipped only if its saved acceptance is independently valid',t=>{
 if(acceptance)return;
 const d=output(t);runCycle({at:time(0),outputRoot:d});
 const p=subject.planRecovery({at:time(1),outputRoot:d,windowCycles:2});
 assert.equal(p.selectedCycle,1);assert.equal(p.skippedCompleted,1);
});
test('legacy accepted receipt remains readable without inventing historical execution time',t=>{
 if(acceptance)return;
 const d=output(t);runCycle({at:time(0),outputRoot:d});
 const filename=path.join(d,'autonomy','cycle-0.json'),saved=JSON.parse(fs.readFileSync(filename));
 for(const field of ['scheduledFor','executedAt','recoveredLate','executionKind'])delete saved[field];
 saved.digest=crypto.createHash('sha256').update(JSON.stringify({...saved,digest:undefined})).digest('hex');
 fs.writeFileSync(filename,JSON.stringify(saved,null,2)+'\n',{mode:0o600});
 const original=fs.readFileSync(filename),p=subject.planRecovery({at:time(0),outputRoot:d,windowCycles:1});
 assert.equal(p.skippedCompleted,1);assert.equal(p.selectedCycle,null);
 assert.deepEqual(fs.readFileSync(filename),original);
});
test('failed candidate stays quarantined while healthy slots remain eligible',t=>{
 const d=output(t);runCycle({at:time(0),outputRoot:d,accept:()=>{throw Error('fixture failure');}});
 const p=subject.planRecovery({at:time(1),outputRoot:d,windowCycles:2});
 assert.equal(p.selectedCycle,1);assert.equal(p.skippedQuarantined,1);
 assert.deepEqual(p.blockedCycles,[0]);
});
test('missing future research does not trigger duplicate manufacture',t=>{
 const d=output(t);const p=subject.planRecovery({at:time(80),outputRoot:d,windowCycles:2});
 assert.equal(p.selectedCycle,null);assert.equal(p.missingIdeas,2);
 assert.equal(p.nextAction,'no_due_work');
});
test('bad schedules and unsafe output roots are rejected',t=>{
 const d=output(t);
 for(const windowCycles of [0,9,-1,'3'])assert.throws(()=>
 subject.planRecovery({at:time(2),outputRoot:d,windowCycles}),/RECOVERY_CONFIG_INVALID/);
 assert.throws(()=>subject.planRecovery({at:time(2),outputRoot:'relative'}),/OUTPUT_UNSAFE/);
});

test('a fixture-only acceptance receipt is explicitly rechecked instead of counted completed',t=>{
 const d=output(t);
 runCycle({at:time(0),outputRoot:d,accept:standIn});
 const p=subject.planRecovery({at:time(0),outputRoot:d,windowCycles:1});
 assert.equal(p.selectedCycle,0);assert.equal(p.nextAction,'requires_real_acceptance');
 assert.equal(p.skippedCompleted,0);
});
test('quarantine is not automatically retried across supervisor invocations',t=>{
 const d=output(t);
 runCycle({at:time(0),outputRoot:d,accept:()=>{throw Error('synthetic failure');}});
 const p=subject.runRecovery({at:time(0),outputRoot:d,windowCycles:1});
 assert.equal(p.selectedCycle,null);assert.equal(p.accepted,0);assert.equal(p.skippedQuarantined,1);
 assert.equal(p.failed,0);assert.equal(p.releaseApproved,false);
});
test('malformed stored acceptance evidence cannot turn an old build into accepted work',t=>{
 if(standIn===acceptance)return;
 const d=output(t),r=runCycle({at:time(0),outputRoot:d});
 assert.equal(r.accepted,1);
 const artifact=r.artifacts[0].artifact;
 fs.writeFileSync(path.join(d,'verification',artifact+'.json'),'{"passed":false}');
 assert.throws(()=>subject.planRecovery({at:time(0),outputRoot:d,windowCycles:1}),/RECOVERY_RECEIPT_INVALID/);
});
test('stored accepted artifact checksum drift prevents automatic reuse',t=>{
 if(standIn===acceptance)return;
 const d=output(t),r=runCycle({at:time(0),outputRoot:d});
 assert.equal(r.accepted,1);
 fs.appendFileSync(path.join(d,r.artifacts[0].artifact,'README.md'),'\nchanged bytes');
 assert.throws(()=>subject.planRecovery({at:time(0),outputRoot:d,windowCycles:1}),/RECOVERY_ARTIFACT_INVALID/);
});
test('existing exclusive recovery lock prevents overlapping supervisors',t=>{
 const d=output(t),state=path.join(d,'autonomy');fs.mkdirSync(state,{mode:0o700});
 const lock=path.join(state,'.supervisor.lock');fs.writeFileSync(lock,'in progress',{mode:0o600});
 assert.throws(()=>subject.runRecovery({at:time(1),outputRoot:d,windowCycles:2}),/RECOVERY_BUSY/);
 assert.equal(fs.readFileSync(lock,'utf8'),'in progress');
});
