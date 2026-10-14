'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {runCycle}=require('./loop');
const {planBackfill,runBackfill}=require('./backfill');
const EPOCH=Date.parse('2026-10-13T00:00:00Z'),SLOT=21600000;
const at=cycle=>new Date(EPOCH+cycle*SLOT).toISOString();
const dir=t=>{const p=fs.mkdtempSync(path.join(os.tmpdir(),'factory-missed-backfill-'));
 t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;};
test('read-only plan excludes current slot and is bounded to prior eight slots',t=>{
 const root=dir(t),p=planBackfill({at:at(5),outputRoot:root,maxBuilds:2});
 assert.equal(p.currentCycle,5);assert.equal(p.selectedCycle,0);
 assert.equal(p.earliestScannedCycle,0);assert.equal(p.latestScannedCycle,4);
 assert.equal(p.historyOutsideWindow,false);
 assert.equal(p.releaseApproved,false);assert.equal(p.paymentsSent,0);
 assert.equal(fs.existsSync(path.join(root,'autonomy')),false);
 const first=planBackfill({at:at(0),outputRoot:root});
 assert.equal(first.selectedCycle,null);assert.equal(first.latestScannedCycle,-1);
 const outside=planBackfill({at:at(10),outputRoot:root});
 assert.equal(outside.earliestScannedCycle,2);assert.equal(outside.historyOutsideWindow,true);
});
test('two oldest missed cycles are recovered each invocation, then replay is idempotent',t=>{
 if(process.platform==='win32')return t.skip('Linux packaged recovery required');
 const root=dir(t);
 const current=runCycle({at:at(4),outputRoot:root});
 assert.equal(current.accepted,1);
 const receipt=path.join(root,'autonomy','cycle-4.json');
 const before=fs.readFileSync(receipt,'utf8');
 const first=runBackfill({at:at(4),outputRoot:root,maxBuilds:2});
 assert.deepEqual(first.recoveredCycles,[0,1]);assert.equal(first.moreDue,true);
 assert.equal(first.nextEligibleCycle,2);assert.equal(first.verifiedRecovered,2);
 const second=runBackfill({at:at(4),outputRoot:root,maxBuilds:2});
 assert.deepEqual(second.recoveredCycles,[2,3]);assert.equal(second.moreDue,false);
 const third=runBackfill({at:at(4),outputRoot:root,maxBuilds:2});
 assert.deepEqual(third.recoveredCycles,[]);assert.equal(third.verification,'no-new-package');
 assert.equal(fs.readFileSync(receipt,'utf8'),before,'current cycle must not be rewritten');
 assert.equal(fs.readdirSync(path.join(root,'autonomy')).filter(v=>/^cycle-\d+\.json$/.test(v)).length,5);
 for(const r of [first,second,third]){
  assert.equal(r.marketValidated,false);assert.equal(r.releaseApproved,false);
  assert.equal(r.realCustomers,null);assert.equal(r.collectedRevenue,null);
  assert.equal(r.paymentsSent,0);assert.equal(r.transmittedMessages,0);
 }
});
test('a permanently quarantined older cycle stays blocked while later missed work progresses',t=>{
 if(process.platform==='win32')return t.skip('Linux packaged recovery required');
 const root=dir(t);
 const failure=runCycle({at:at(0),outputRoot:root,accept:()=>{throw Error('synthetic failure');}});
 assert.equal(failure.failed,1);
 const report=runBackfill({at:at(2),outputRoot:root,maxBuilds:2});
 assert.deepEqual(report.recoveredCycles,[1]);
 assert.deepEqual(report.blockedCyclesBeforeNext,[0]);
 assert.equal(report.nextAction,'manual_quarantine_review');
 assert.equal(report.moreDue,false);
});
test('corrupted older receipt blocks all catch-up without discarding evidence',t=>{
 if(process.platform==='win32')return t.skip('Linux packaged recovery required');
 const root=dir(t),a=runCycle({at:at(0),outputRoot:root});
 assert.equal(a.accepted,1);
 const proof=path.join(root,'verification',a.artifacts[0].artifact+'.json');
 fs.appendFileSync(proof,'\nCORRUPTED');
 assert.throws(()=>runBackfill({at:at(3),outputRoot:root}),/RECOVERY_RECEIPT_INVALID/);
 assert.equal(fs.existsSync(path.join(root,'autonomy','cycle-1.json')),false);
 assert.match(fs.readFileSync(proof,'utf8'),/CORRUPTED/);
});
test('invalid windows, build budgets and unsafe output locations cannot start recovery',t=>{
 const root=dir(t);
 for(const option of [{windowCycles:9},{windowCycles:0},{maxBuilds:0},{maxBuilds:4},
  {maxBuilds:2.5},{maxBuilds:'2'}])
  assert.throws(()=>planBackfill({at:at(2),outputRoot:root,...option}),/BACKFILL_CONFIG_INVALID/);
 assert.throws(()=>runBackfill({at:at(2),outputRoot:'relative'}),/BACKFILL_CONFIG_INVALID/);
 assert.throws(()=>planBackfill({at:'2026-10-12T23:59:59Z',outputRoot:root}),/CYCLE_INVALID/);
});
