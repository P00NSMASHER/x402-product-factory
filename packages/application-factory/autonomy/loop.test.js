'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
let loop={};try{loop=require('./loop');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const EPOCH='2026-10-13T00:00:00Z';
// Windows cannot fsync the inherited packaged recovery directory (EPERM).
// Linux exact-head CI runs the real packaged service; Windows still verifies every byte.
function checkedFixtureAcceptance(folder,digest){
 const {verifyApplication}=require('../manufacturing/assembler');
 const {CHECKS}=require('../manufacturing/acceptance');
 const manifest=verifyApplication(folder,digest);
 return {kind:'assembled-application-acceptance',passed:true,recipeId:manifest.recipeId,artifactDigest:digest,
   ...Object.fromEntries(CHECKS.map(key=>[key,true])),
   externalMessagesSent:0,paymentsSent:0,realCustomers:null,collectedRevenue:null,releaseApproved:false};
}
const platformAcceptance=process.platform==='win32'?checkedFixtureAcceptance:undefined;
function dir(t){const p=fs.mkdtempSync(path.join(os.tmpdir(),'factory-autonomy-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;}
test('planner picks the same first candidate throughout one UTC six-hour slot',()=>{
 assert.equal(typeof loop.planCycle,'function','automatic planner missing');
 const a=loop.planCycle({at:EPOCH}),b=loop.planCycle({at:'2026-10-13T05:59:59Z'});
 assert.deepEqual(a,b);
 assert.equal(a.recipes.length,1);assert.equal(a.scheduleHours,6);assert.equal(a.cycle,0);
 assert.equal(a.mode,'synthetic-candidate-only');
});
test('each slot advances to a different work-ready candidate without manual product prompts',()=>{
 const seen=new Set();
 for(let i=0;i<72;i++){
  const p=loop.planCycle({at:new Date(Date.parse(EPOCH)+i*21600000).toISOString()});
  assert.equal(p.recipes.length,1);assert.ok(!seen.has(p.recipes[0].id));seen.add(p.recipes[0].id);
  assert.equal(p.marketValidated,false);assert.equal(p.releaseApproved,false);
 }
 assert.equal(seen.size,72);
});
test('finite curated catalog is exhausted rather than silently recycling junk',()=>{
 const plan=loop.planCycle({at:new Date(Date.parse(EPOCH)+99999*21600000).toISOString()});
 assert.equal(plan.exhausted,true);assert.equal(plan.recipes.length,0);
 assert.equal(plan.nextAction,'catalog_refresh_required');
});
test('invalid clocks, batch sizes and pre-epoch timestamps fail closed',()=>{
 for(const at of ['yesterday','2026-10-13','2026-13-15T00:00:00Z','2026-02-30T00:00:00Z','2026-10-12T23:59:59Z'])
  assert.throws(()=>loop.planCycle({at}),/CYCLE_INVALID/);
 for(const batchSize of [0,3,-1,NaN,'2'])assert.throws(()=>loop.planCycle({at:EPOCH,batchSize}),/CYCLE_INVALID/);
});
test('two per cycle produces distinct candidates but never exceeds batch limit',()=>{
 const p=loop.planCycle({at:EPOCH,batchSize:2});
 assert.equal(p.recipes.length,2);assert.notEqual(p.recipes[0].id,p.recipes[1].id);
 assert.deepEqual(p.recipes,loop.planCycle({at:EPOCH,batchSize:2}).recipes);
});
test('operator cycle uses genuine Linux packaged acceptance and hash-verified Windows fixtures',t=>{
 assert.equal(typeof loop.runCycle,'function','autonomous manufacturing runner missing');
 const outputRoot=dir(t);
 const r=loop.runCycle({at:EPOCH,outputRoot,accept:platformAcceptance});
 assert.equal(r.planned,1);assert.equal(r.accepted,1);assert.equal(r.failed,0);
 assert.equal(r.verification,platformAcceptance?'injected-test-only':'executed-packaged-workflow');
 assert.equal(r.transmittedMessages,0);assert.equal(r.paymentsSent,0);
 assert.equal(r.realCustomers,null);assert.equal(r.collectedRevenue,null);
 assert.equal(r.releaseApproved,false);assert.equal(r.marketValidated,false);
 assert.equal(r.artifacts.length,1);
 const artifact=path.join(outputRoot,r.artifacts[0].artifact);
 assert.ok(fs.existsSync(path.join(artifact,'manifest.json')));
 assert.equal(r.artifacts[0].status,'accepted');
 assert.equal(fs.existsSync(path.join(outputRoot,'autonomy','cycle-0.json')),true);
});
test('same slot reruns verify and reuse existing artifacts without minting duplicate apps',t=>{
 const outputRoot=dir(t);
 const first=loop.runCycle({at:EPOCH,outputRoot,accept:platformAcceptance});
 const receipt=path.join(outputRoot,'autonomy','cycle-0.json');
 const original=fs.readFileSync(receipt),before=fs.statSync(receipt,{bigint:true});
 const saved=JSON.parse(original);
 assert.equal(first.executionKind,'initial-execution');
 assert.equal(saved.scheduledFor,new Date(EPOCH).toISOString());
 assert.ok(Number.isFinite(Date.parse(saved.executedAt)));
 const second=loop.runCycle({at:'2026-10-13T01:00:00Z',outputRoot,accept:platformAcceptance});
 assert.equal(first.artifacts[0].artifact,second.artifacts[0].artifact);
 assert.equal(second.reused,1);assert.equal(second.accepted,1);
 assert.equal(fs.readdirSync(outputRoot).filter(x=>x.startsWith('vendor-')).length<=1,true);
 assert.equal(fs.readdirSync(path.join(outputRoot,'autonomy')).length,1);
 assert.equal(second.executionKind,'independent-recheck');
 assert.equal(second.originalReceiptDigest,saved.digest);
 assert.deepEqual(fs.readFileSync(receipt),original,'recheck must not replace original cycle evidence');
 assert.equal(fs.statSync(receipt,{bigint:true}).mtimeNs,before.mtimeNs);
});
test('manufacturing failure is quarantined and the report cannot pretend it is accepted',t=>{
 const outputRoot=dir(t);
 const result=loop.runCycle({at:EPOCH,outputRoot,accept:()=>{throw new Error('Synthetic engine failure');}});
 assert.equal(result.planned,1);assert.equal(result.accepted,0);
 assert.equal(result.failed,1);assert.equal(result.artifacts[0].status,'quarantined');
 assert.equal(result.releaseApproved,false);
});
test('unfinished or corrupted accepted artifacts cannot be marked successful on a repeat',t=>{
 const outputRoot=dir(t),result=loop.runCycle({at:EPOCH,outputRoot,accept:platformAcceptance});
 fs.appendFileSync(path.join(outputRoot,result.artifacts[0].artifact,'manifest.json'),'\nFAKE');
 const replay=loop.runCycle({at:EPOCH,outputRoot,accept:platformAcceptance});
 assert.equal(replay.accepted,0);assert.equal(replay.failed,1);
 assert.equal(replay.artifacts[0].status,'quarantined');
});
test('a different cycle builds a separate version with isolated manifest identity',t=>{
 const outputRoot=dir(t),a=loop.runCycle({at:EPOCH,outputRoot,accept:platformAcceptance});
 const b=loop.runCycle({at:'2026-10-13T06:00:00Z',outputRoot,accept:platformAcceptance});
 assert.notEqual(a.artifacts[0].artifact,b.artifacts[0].artifact);
 assert.equal(a.accepted,1);assert.equal(b.accepted,1);
 assert.equal(fs.readdirSync(path.join(outputRoot,'autonomy')).length,2);
});
test('exhausted cycle avoids any paid or external side effect and emits no fake new product',t=>{
 const outputRoot=dir(t),time=new Date(Date.parse(EPOCH)+99999*21600000).toISOString();
 const result=loop.runCycle({at:time,outputRoot});
 assert.equal(result.planned,0);assert.equal(result.accepted,0);
 assert.equal(result.exhausted,true);assert.equal(result.transmittedMessages,0);
 assert.equal(result.nextAction,'catalog_refresh_required');
 assert.equal(result.collectedRevenue,null);
});
test('unsafe output locations are refused before any manufacturing can execute',()=>{
 assert.throws(()=>loop.runCycle({at:EPOCH,outputRoot:'relative-output'}),/OUTPUT_UNSAFE/);
 assert.throws(()=>loop.runCycle({at:EPOCH,outputRoot:path.resolve(__dirname,'../recipes.json')}),/OUTPUT_UNSAFE/);
});
