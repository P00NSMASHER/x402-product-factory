'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {evaluateEvidence}=require('./decision');
const buyers=n=>String(n).padStart(64,'0');
function event(kind,n,options={}){return {recipeId:'supplier-desk',kind,origin:'external',attested:true,buyerHash:buyers(n),cents:null,...options};}
test('empty or synthetic-only evidence cannot claim demand',()=>{
  const empty=evaluateEvidence('supplier-desk',[]);
  assert.equal(empty.stage,'research');assert.equal(empty.realCustomers,null);assert.equal(empty.collectedRevenue,null);
  const synthetic=Array.from({length:30},(_,i)=>event('pilot_paid',i,{cents:24900,origin:'synthetic'}));
  assert.deepEqual(evaluateEvidence('supplier-desk',synthetic),empty);
});
test('self-entered but unreviewed claims cannot promote demand',()=>{
  const rows=Array.from({length:12},(_,i)=>event('qualified_conversation',i,{attested:false}));
  assert.equal(evaluateEvidence('supplier-desk',rows).stage,'research');
});
test('10 distinct attested qualified conversations allow a pilot-review recommendation only',()=>{
  const rows=Array.from({length:10},(_,i)=>event('qualified_conversation',i));const x=evaluateEvidence('supplier-desk',rows);
  assert.equal(x.stage,'pilot_review');assert.equal(x.interviews,10);assert.equal(x.releaseApproved,false);
  assert.equal(x.nextAction,'seek_paid_pilots');
});
test('three distinct paid buyers without delivered outcomes cannot scale',()=>{
  const rows=Array.from({length:10},(_,i)=>event('qualified_conversation',i));
  rows.push(...Array.from({length:3},(_,i)=>event('pilot_paid',i,{cents:24900})));
  const x=evaluateEvidence('supplier-desk',rows);assert.equal(x.stage,'delivery_review');
  assert.equal(x.operatorsReportedGrossCents,74700);assert.equal(x.contributionCents,null);
});
test('repeat purchases, delivery, unit costs and positive contribution support human scale review',()=>{
  const rows=Array.from({length:10},(_,i)=>event('qualified_conversation',i));
  for(let i=0;i<3;i++){
    rows.push(event('pilot_paid',i,{cents:24900}));rows.push(event('outcome_delivered',i));
    rows.push(event('unit_cost',i,{cents:7200}));
  }
  for(let i=0;i<2;i++)rows.push(event('repeat_paid',i,{cents:24900}));
  const x=evaluateEvidence('supplier-desk',rows);
  assert.equal(x.stage,'scale_review');assert.equal(x.paidPilotBuyers,3);assert.equal(x.repeatBuyers,2);
  assert.equal(x.contributionCents,3*17700+2*24900);assert.equal(x.nextAction,'request_manual_scale_review');
  assert.equal(x.releaseApproved,false);assert.equal(x.autoDeploy,false);assert.equal(x.collectedRevenue,null);
});
test('refunds and missing cost evidence prevent scale recommendation',()=>{
  const rows=Array.from({length:10},(_,i)=>event('qualified_conversation',i));
  for(let i=0;i<3;i++)rows.push(event('pilot_paid',i,{cents:20000}),event('outcome_delivered',i),event('unit_cost',i,{cents:3000}));
  rows.push(event('repeat_paid',0,{cents:20000}),event('repeat_paid',1,{cents:20000}),event('refund',0,{cents:40000}));
  assert.notEqual(evaluateEvidence('supplier-desk',rows).stage,'scale_review');
  assert.equal(evaluateEvidence('supplier-desk',rows.filter(e=>e.kind!=='unit_cost')).contributionCents,null);
});
test('cannot count another recipe or duplicate buyer as independent traction',()=>{
  const list=Array.from({length:20},()=>event('qualified_conversation',1));
  list.push(...Array.from({length:20},(_,i)=>event('pilot_paid',i,{recipeId:'agency-intake',cents:10000})));
  const x=evaluateEvidence('supplier-desk',list);assert.equal(x.interviews,1);assert.equal(x.paidPilotBuyers,0);
});
test('invalid and invented evidence fields cannot make a decision',()=>{
  assert.throws(()=>evaluateEvidence('supplier-desk',[{kind:'paid',buyerHash:'bad',attested:true}]),/EVIDENCE_INVALID/);
  assert.throws(()=>evaluateEvidence('../bad',[]),/EVIDENCE_INVALID/);
});
