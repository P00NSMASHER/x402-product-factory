"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const oracle=require("./018-decision-oracle");
const {assessCounterpartyReview}=require("../../products/pa-vendor-counterparty-review/decision");
const {assessHardenedCounterparty}=require("./018-hardened-decision");

test("source-audited oracle cases exercise Product 018 evidence-quality invariants",()=>{
  const r=oracle.buildReport();
  assert.ok(r.scenario_count>=35);
  assert.equal(r.candidate_synthetic_label_matches,r.scenario_count);
  assert.equal(r.candidate_false_proceed_synthetic_cases,0);
  assert.ok(r.raw_baseline_false_proceed_synthetic_cases>=3);
  assert.equal(r.current_live_product_modified,false);
  assert.equal(r.independent_real_world_ground_truth_available,false);
  assert.equal(r.buyer_willingness_to_pay_verified,false);
  assert.equal(r.release_status,"HOLD_OFFLINE_CANDIDATE_REQUIRES_INDEPENDENT_REVIEW");
});
test("real baseline is evaluated directly and never upgraded silently",()=>{
  const clean=structuredClone(oracle.BASE);
  assert.equal(assessCounterpartyReview(clean,{now:oracle.NOW}).decision,"proceed");
  const ambiguous=structuredClone(clean);
  ambiguous.registry.candidateCount=2;
  ambiguous.registry.strongCandidateCount=2;
  assert.equal(assessCounterpartyReview(ambiguous,{now:oracle.NOW}).decision,"proceed");
  const candidate=assessHardenedCounterparty(ambiguous,{now:oracle.NOW});
  assert.equal(candidate.decision,"human_review");
  assert.ok(candidate.reasonCodes.includes("PA_REGISTRY_STRONG_MATCH_INCONSISTENT"));
});
test("multiple ranked PA search results with exactly one strong match remain eligible",()=>{
  for(const count of [2,3]){
    const valid=structuredClone(oracle.BASE);
    valid.registry.candidateCount=count;
    valid.registry.strongCandidateCount=1;
    assert.equal(assessHardenedCounterparty(valid,{now:oracle.NOW}).decision,"proceed");
  }
});
test("label and timestamp manipulation cannot fake passing benchmark",()=>{
  const original=oracle.CASES[0].expected_decision;
  assert.equal(original,"proceed");
  const untrusted=structuredClone(oracle.BASE);
  untrusted.rdap.events.registration="2026-02-31";
  const candidate=assessHardenedCounterparty(untrusted,{now:oracle.NOW});
  assert.equal(candidate.decision,"human_review");
  assert.ok(candidate.reasonCodes.includes("DOMAIN_REGISTRATION_DATE_INVALID"));
});
test("deterministic quality snapshot fails on drift or tampering",()=>{
  const outputs=oracle.serialize();
  assert.deepEqual(outputs,oracle.serialize());
  assert.match(outputs["018_DECISION_ORACLE.md"],/independently labeled real-world evidence/);
  assert.doesNotThrow(()=>oracle.execute("check",outputs));
  assert.throws(()=>oracle.execute("check",{
    ...outputs,"018_DECISION_ORACLE.md":outputs["018_DECISION_ORACLE.md"]+"tampered"
  }),/stale decision-quality oracle snapshot/);
});
