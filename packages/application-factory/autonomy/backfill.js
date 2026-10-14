'use strict';
// Bounded recovery of missed *prior* UTC slots using existing verified packaged acceptance.
// Does not alter schedules, current-cycle receipts, quarantine, release gates or external systems.
const path=require('node:path');
const {planCycle,INTERVAL}=require('./loop');
const {planRecovery,runRecovery}=require('./supervisor');
const EPOCH=Date.parse('2026-10-13T00:00:00Z');
const fail=code=>{throw Error(code);};

function review({at=new Date().toISOString(),outputRoot,windowCycles=8,maxBuilds=2,blueprintDirectory}={}){
 if(!Number.isSafeInteger(windowCycles)||windowCycles<1||windowCycles>8||
    !Number.isSafeInteger(maxBuilds)||maxBuilds<1||maxBuilds>3||
    typeof outputRoot!=='string'||!path.isAbsolute(outputRoot))fail('BACKFILL_CONFIG_INVALID');
 const extra=blueprintDirectory?{blueprintDirectory}:{};
 const current=planCycle({at,...extra}),prior=current.cycle>0?
  new Date(EPOCH+(current.cycle-1)*INTERVAL).toISOString():null;
 const width=Math.min(windowCycles,current.cycle);
 // Also validate private state integrity on the initial cycle; do not fabricate past work.
 const selection=planRecovery({at:prior||at,outputRoot,windowCycles:width||1,...extra});
 return {currentCycle:current.cycle,prior,windowCycles:width,maxBuilds,extra,selection};
}
function planBackfill(input={}){
 const r=review(input),s=r.selection;
 return {kind:'autonomous-missed-cycle-plan',currentCycle:r.currentCycle,
  earliestScannedCycle:Math.max(0,r.currentCycle-r.windowCycles),
  latestScannedCycle:r.currentCycle-1,
  historyOutsideWindow:r.currentCycle>r.windowCycles,
  selectedCycle:r.prior?s.selectedCycle:null,
  skippedCompleted:r.prior?s.skippedCompleted:0,
  blockedCycles:r.prior?s.blockedCycles:[],
  missingIdeas:r.prior?s.missingIdeas:0,
  maxBuilds:r.maxBuilds,mode:'synthetic-candidate-only',
  transmittedMessages:0,paymentsSent:0,realCustomers:null,collectedRevenue:null,
  marketValidated:false,releaseApproved:false};
}
function runBackfill(input={}){
 const first=review(input),recoveredCycles=[];
 // Current slot is deliberately excluded; caller must validate/build it independently.
 for(let i=0;i<first.maxBuilds&&first.prior;i++){
  const before=planBackfill(input),chosen=before.selectedCycle;
  if(chosen===null)break;
  const r=runRecovery({at:first.prior,outputRoot:input.outputRoot,
    windowCycles:first.windowCycles,...first.extra});
  if(r.selectedCycle!==chosen||r.accepted!==1||r.failed!==0||
     r.verification!=='executed-packaged-workflow'||!r.report||
     r.report.releaseApproved!==false||r.report.marketValidated!==false||
     r.report.realCustomers!==null||r.report.collectedRevenue!==null||
     r.report.paymentsSent!==0||r.report.transmittedMessages!==0)fail('BACKFILL_ACCEPTANCE_FAILED');
  const proved=planRecovery({at:new Date(EPOCH+chosen*INTERVAL).toISOString(),
    outputRoot:input.outputRoot,windowCycles:1,...first.extra});
  if(proved.skippedCompleted!==1||proved.selectedCycle!==null)fail('BACKFILL_VERIFY_FAILED');
  recoveredCycles.push(chosen);
 }
 const remaining=planBackfill(input);
 const moreDue=remaining.selectedCycle!==null;
 return {kind:'autonomous-missed-cycle-run',currentCycle:first.currentCycle,
  recoveredCycles,verifiedRecovered:recoveredCycles.length,
  moreDue,earliestScannedCycle:remaining.earliestScannedCycle,
  latestScannedCycle:remaining.latestScannedCycle,
  historyOutsideWindow:remaining.historyOutsideWindow,
  nextEligibleCycle:remaining.selectedCycle,
  blockedCyclesBeforeNext:remaining.blockedCycles,
  missingIdeasBeforeNext:remaining.missingIdeas,
  nextAction:moreDue?'continue_bounded_backfill_next_run':
   remaining.blockedCycles.length?'manual_quarantine_review':
   remaining.missingIdeas?'research_required':'no_due_work_in_bounded_window',
  verification:recoveredCycles.length?'executed-packaged-workflow':'no-new-package',
  mode:'synthetic-candidate-only',marketValidated:false,releaseApproved:false,
  realCustomers:null,collectedRevenue:null,paymentsSent:0,transmittedMessages:0};
}
module.exports={planBackfill,runBackfill};
