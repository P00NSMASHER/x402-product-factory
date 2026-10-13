'use strict';
const validId=v=>typeof v==='string'&&/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(v)&&v.length<=60;
const kinds=new Set(['qualified_conversation','pilot_paid','repeat_paid','outcome_delivered','refund','unit_cost']);
function evaluateEvidence(recipeId,all){
  if(!validId(recipeId)||!Array.isArray(all)||all.length>10000)throw new Error('EVIDENCE_INVALID');
  for(const e of all){
    if(!e||!validId(e.recipeId)||!kinds.has(e.kind)||!['external','synthetic'].includes(e.origin)||
       typeof e.attested!=='boolean'||typeof e.buyerHash!=='string'||!/^[0-9a-f]{64}$/.test(e.buyerHash)||
       !(e.cents===null||(Number.isSafeInteger(e.cents)&&e.cents>=0&&e.cents<=1e10))||
       (['pilot_paid','repeat_paid'].includes(e.kind)&&!(e.cents>0))||
       (['qualified_conversation','outcome_delivered'].includes(e.kind)&&e.cents!==null))throw new Error('EVIDENCE_INVALID');
  }
  const rows=all.filter(e=>e.recipeId===recipeId&&e.origin==='external'&&e.attested===true);
  const byKind=k=>rows.filter(e=>e.kind===k);
  const distinct=k=>new Set(byKind(k).map(e=>e.buyerHash));
  const interviews=distinct('qualified_conversation').size,pilot=distinct('pilot_paid'),
    repeats=distinct('repeat_paid'),delivered=distinct('outcome_delivered'),refunds=distinct('refund');
  const paid=[...byKind('pilot_paid'),...byKind('repeat_paid')];
  const gross=paid.reduce((sum,e)=>sum+e.cents,0);
  const refunded=byKind('refund').reduce((sum,e)=>sum+e.cents,0);
  const costs=byKind('unit_cost');const paidBuyers=new Set(paid.map(e=>e.buyerHash));
  const costBuyers=new Set(costs.map(e=>e.buyerHash));
  const contribution=paid.length&&[...paidBuyers].every(k=>costBuyers.has(k))?
    gross-refunded-costs.filter(e=>paidBuyers.has(e.buyerHash)).reduce((sum,e)=>sum+e.cents,0):null;
  let stage='research',nextAction='collect_qualified_interviews';
  if(interviews>=10){stage='pilot_review';nextAction='seek_paid_pilots';}
  if(interviews>=10&&pilot.size>=3){stage='delivery_review';nextAction='measure_delivered_outcomes';}
  if(interviews>=10&&pilot.size>=3&&[...pilot].every(k=>delivered.has(k))){stage='economics_review';nextAction='measure_repeat_economics';}
  if(stage==='economics_review'&&repeats.size>=2&&[...repeats].every(k=>pilot.has(k))&&refunds.size===0&&contribution!==null&&contribution>0){
    stage='scale_review';nextAction='request_manual_scale_review';
  }
  return {recipeId,stage,nextAction,interviews,paidPilotBuyers:pilot.size,repeatBuyers:repeats.size,
    deliveredBuyers:delivered.size,refundedBuyers:refunds.size,operatorsReportedGrossCents:gross,
    operatorsReportedRefundCents:refunded,contributionCents:contribution,
    evidenceLabel:'operator-attested local records; not independently audited',
    realCustomers:null,collectedRevenue:null,releaseApproved:false,autoDeploy:false,
    checkoutEnabled:false,outreachEnabled:false};
}
module.exports={evaluateEvidence};
