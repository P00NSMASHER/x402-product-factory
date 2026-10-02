"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {assessTreasuryRateSpread}=require("./decision");

function evidence(leftRate,rightRate){
  return {
    available:true,
    recordDate:"2026-09-30",
    left:{found:true,ambiguous:false,selected:{recordDate:"2026-09-30",securityDescription:"Treasury Bills",averageInterestRatePercent:leftRate}},
    right:{found:true,ambiguous:false,selected:{recordDate:"2026-09-30",securityDescription:"Treasury Notes",averageInterestRatePercent:rightRate}}
  };
}

test("left category above tolerance returns left_higher",()=>{
  const r=assessTreasuryRateSpread(evidence(4.123,3.456),{toleranceBps:2});
  assert.equal(r.decision,"left_higher");
  assert.equal(r.spreadBps,66.7);
});

test("right category above tolerance returns right_higher",()=>{
  const r=assessTreasuryRateSpread(evidence(3.456,4.123),{toleranceBps:2});
  assert.equal(r.decision,"right_higher");
  assert.equal(r.spreadBps,-66.7);
});

test("spread at tolerance is within_tolerance",()=>{
  const r=assessTreasuryRateSpread(evidence(3.50,3.48),{toleranceBps:2});
  assert.equal(r.decision,"within_tolerance");
  assert.equal(r.spreadBps,2);
});

test("ambiguous category requires human review",()=>{
  const e=evidence(4,3);
  e.left.ambiguous=true;
  e.left.selected=null;
  const r=assessTreasuryRateSpread(e,{toleranceBps:2});
  assert.equal(r.decision,"human_review");
  assert.ok(r.reasonCodes.includes("LEFT_SECURITY_AMBIGUOUS"));
});

test("record-date mismatch requires human review",()=>{
  const e=evidence(4,3);
  e.right.selected.recordDate="2026-08-31";
  const r=assessTreasuryRateSpread(e,{toleranceBps:2});
  assert.equal(r.decision,"human_review");
  assert.ok(r.reasonCodes.includes("RECORD_DATE_MISMATCH"));
});
