"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fixtures=require("../prototypes/018-counterparty-brief-fixtures.json");
const pilot=require("./018-masked-pilot");
const clone=x=>structuredClone(x);
test("synthetic packets hide golden labels and implementation identities",()=>{
  const r=pilot.buildPilot(fixtures);
  assert.equal(r.synthetic_cases,8);
  assert.equal(r.assignments,16);
  assert.equal(r.cases_in_proposed_full_experiment,40);
  assert.equal(r.reviewer_observations_collected,false);
  assert.equal(r.measured_reviewer_time_seconds,null);
  assert.equal(r.release_status,"HOLD_SYNTHETIC_PILOT_ONLY");
  const exported=JSON.stringify(r);
  for(const fixture of fixtures.cases){
    assert.equal(exported.includes(fixture.id),false);
  }
  assert.equal(exported.includes("expected_review_decision"),false);
  assert.equal(exported.includes("expected_next_action"),false);
  const planned=pilot.assignments(fixtures);
  assert.equal(planned.filter(x=>x.arm==="baseline").length,8);
  assert.equal(planned.filter(x=>x.arm==="candidate").length,8);
  for(let k=0;k<8;k++){
    const paired=planned.filter(x=>x.case_index===k);
    assert.deepEqual([...new Set(paired.map(x=>x.arm))].sort(),["baseline","candidate"]);
    assert.equal(new Set(paired.map(x=>x.reviewer_slot)).size,2);
  }
  for(const slot of pilot.REVIEWER_SLOTS){
    assert.equal(planned.filter(x=>x.reviewer_slot===slot&&x.arm==="baseline").length,4);
    assert.equal(planned.filter(x=>x.reviewer_slot===slot&&x.arm==="candidate").length,4);
  }
  assert.deepEqual(pilot.buildPilot(clone(fixtures)),r);
});
test("raw contradictory proceed decisions are downgraded in synthetic safety replay",()=>{
  const r=pilot.buildPilot(fixtures);
  assert.equal(r.pilot_automated_regression_only.baseline_raw_false_proceed_on_synthetic_gold,2);
  assert.equal(r.pilot_automated_regression_only.prototype_false_proceed_on_synthetic_gold,0);
  assert.equal(r.pilot_automated_regression_only.independently_heldout_ground_truth,false);
});
test("scores reject incomplete or self-attested inputs as commercial proof",()=>{
  const planned=pilot.assignments(fixtures);
  const observations=planned.map(a=>({
    assignment_id:a.assignment_id,
    reviewer_slot:a.reviewer_slot,
    selected_decision:a.row.expected_review_decision,
    selected_next_action:a.row.expected_next_action,
    elapsed_seconds:45
  }));
  const complete=pilot.scoreObservations(fixtures,observations);
  assert.equal(complete.complete,true);
  assert.equal(complete.arms.baseline.completed,8);
  assert.equal(complete.arms.candidate.completed,8);
  assert.equal(complete.arms.baseline.self_reported_median_task_seconds,45);
  assert.equal(complete.buyer_value_proven,false);
  assert.equal(complete.commercialization_authorized,false);
  assert.equal(complete.release_decision,"HOLD_REQUIRES_INDEPENDENT_BUYER_VALIDATION");
  const partial=pilot.scoreObservations(fixtures,observations.slice(0,3));
  assert.equal(partial.complete,false);
  assert.equal(partial.arms.baseline.self_reported_median_task_seconds,null);
  assert.equal(partial.arms.candidate.synthetic_gold_decision_matches,null);
});
test("replay scoring rejects duplicates, invented participants and PII",()=>{
  const planned=pilot.assignments(fixtures);
  const first={
    assignment_id:planned[0].assignment_id,
    reviewer_slot:planned[0].reviewer_slot,
    selected_decision:"human_review",
    selected_next_action:"MANUAL_REVIEW_UNCLASSIFIED",
    elapsed_seconds:20
  };
  for(const input of [
    [first,first],
    [{...first,reviewer_slot:"R3"}],
    [{...first,elapsed_seconds:0}],
    [{...first,elapsed_seconds:Infinity}],
    [{...first,selected_next_action:"LAUNCH"}],
    [{...first,reviewer_email:"private@example.com"}],
    [{...first,assignment_id:"RANDOM_UNKNOWN_CASE"}]
  ]){
    assert.throws(()=>pilot.scoreObservations(fixtures,input),/MASKED_PILOT_GATE/);
  }
});
test("controlled public artifacts are reproducible and detect tampering",()=>{
  const a=pilot.serialize(fixtures),b=pilot.serialize(clone(fixtures));
  assert.deepEqual(a,b);
  assert.match(a["018_MASKED_PILOT_PROTOCOL.md"],/HOLD/);
  assert.doesNotThrow(()=>pilot.execute("check",a));
  assert.throws(()=>pilot.execute("check",{
    ...a,"018_MASKED_PILOT_PACKET.json":a["018_MASKED_PILOT_PACKET.json"]+"tampered"
  }),/stale masked pilot artifact/);
});
