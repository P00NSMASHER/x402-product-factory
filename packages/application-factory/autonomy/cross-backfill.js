'use strict';
// Build a bounded number of previously unbuilt historical SaaS slots.
// These are new late executions, NOT claims that the original scheduled runs succeeded.
const fs=require('node:fs'),path=require('node:path');
const {clock,readJournal,runCrossCycle,safeRoot}=require('./cross-cycle');
const {loadOpportunities}=require('./cross-family');
const EPOCH=Date.parse('2026-10-13T00:00:00Z'),SLOT=21600000;
const fail=code=>{throw Error(code);};
function verifyInputs({at,outputRoot,windowCycles,maxBuilds}){
 if(typeof outputRoot!=='string'||!path.isAbsolute(outputRoot)||
  !Number.isSafeInteger(windowCycles)||windowCycles<1||windowCycles>8||
  !Number.isSafeInteger(maxBuilds)||maxBuilds<1||maxBuilds>2)
   fail('CROSS_BACKFILL_CONFIG_INVALID');
 const cycle=clock(at);
 if(cycle>clock(new Date().toISOString()))fail('CROSS_BACKFILL_FUTURE_INVALID');
 return {root:safeRoot(outputRoot),currentCycle:cycle};
}
function planCrossBackfill({at=new Date().toISOString(),outputRoot,windowCycles=8,maxBuilds=2}={}){
 const {root,currentCycle}=verifyInputs({at,outputRoot,windowCycles,maxBuilds});
 const journal=readJournal(root,loadOpportunities());
 if(journal.some(v=>v.cycle>currentCycle))fail('CROSS_BACKFILL_FUTURE_RECEIPT');
 const oldest=Math.max(0,currentCycle-windowCycles),completed=new Set(journal.map(v=>v.cycle));
 const unbuilt=[];
 for(let slot=oldest;slot<currentCycle;slot++)if(!completed.has(slot))unbuilt.push(slot);
 const sourceCapacityRemaining=loadOpportunities().length-journal.length;
 return {
  kind:'cross-family-bounded-historical-plan',currentCycle,oldestInspectedCycle:oldest,
  windowCycles,maxBuilds,unbuiltHistoricalSlots:unbuilt.length,
  nextEligibleSlots:unbuilt.slice(0,Math.min(maxBuilds,Math.max(0,sourceCapacityRemaining))),
  sourceCapacityRemaining,
  historyOutsideWindowUnverified:oldest>0,notExhaustiveBeyondWindow:true,
  historicalRunsNotEstablished:true,independentBuyerEvidence:false,marketValidated:false,
  originalScheduleUnchanged:true,realCustomers:null,collectedRevenue:null,
  transmittedMessages:0,paymentsSent:0,publicDeploymentEnabled:false,releaseApproved:false
 };
}
function runCrossBackfill({at=new Date().toISOString(),outputRoot,windowCycles=8,maxBuilds=2}={}){
 const plan=planCrossBackfill({at,outputRoot,windowCycles,maxBuilds});
 const root=safeRoot(outputRoot),lock=path.join(root,'.cross-backfill.lock');
 let handle;
 try{handle=fs.openSync(lock,'wx',0o600);}
 catch(error){if(error?.code==='EEXIST')fail('CROSS_BACKFILL_BUSY');throw error;}
 try{
  const built=[],started=Date.now();
  for(const slot of plan.nextEligibleSlots){
   // The original historical cycle might never have run: manufacture NOW and
   // mark local execution time explicitly. All actual package tests still run.
   const result=runCrossCycle({
    at:new Date(EPOCH+slot*SLOT).toISOString(),outputRoot:root,historicalRepair:true});
   if(result.exhausted)break;
   if(result.cycle!==slot||result.failed!==0||result.accepted!==1||
      result.reused!==0||result.verifiedSlot?.recoveredLate!==true||
      result.verifiedSlot?.status!=='accepted'||result.releaseApproved!==false||
      result.transmittedMessages!==0||result.paymentsSent!==0||
      result.realCustomers!==null||result.collectedRevenue!==null)
     fail('CROSS_BACKFILL_NOT_VERIFIED');
   built.push({
    cycle:slot,family:result.selected.family,key:result.selected.key,
    sourceDigest:result.selected.sourceDigest,packageDigest:result.selected.packageDigest,
    executedAt:result.verifiedSlot.executedAt,lateBuilt:true});
  }
  const after=planCrossBackfill({at,outputRoot:root,windowCycles,maxBuilds});
  if(after.currentCycle!==plan.currentCycle||
     after.unbuiltHistoricalSlots!==plan.unbuiltHistoricalSlots-built.length)
   fail('CROSS_BACKFILL_INVARIANT_FAILED');
  return {
   kind:'cross-family-bounded-historical-build',
   currentCycle:plan.currentCycle,oldestInspectedCycle:plan.oldestInspectedCycle,
   windowCycles,maxBuilds,verifiedLateBuilds:built.length,lateBuiltSlots:built,
   remainingUnbuiltHistoricalSlots:after.unbuiltHistoricalSlots,
   moreDue:after.unbuiltHistoricalSlots>0&&after.sourceCapacityRemaining>0,
   sourceCapacityRemaining:after.sourceCapacityRemaining,
   historyOutsideWindowUnverified:plan.historyOutsideWindowUnverified,
   originalScheduledRunProof:false,lateExecutionEvidence:true,
   independentPackagedAcceptance:true,unverifiedBuyerDemand:true,
   externalContacts:0,transmittedMessages:0,paymentsSent:0,
   realCustomers:null,collectedRevenue:null,publicDeploymentEnabled:false,
   releaseApproved:false,executionElapsedMs:Date.now()-started
  };
 }finally{fs.closeSync(handle);fs.unlinkSync(lock);}
}
module.exports={planCrossBackfill,runCrossBackfill};
