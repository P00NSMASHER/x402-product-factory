"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fixtures=require("./018-counterparty-brief-fixtures.json");
const brief=require("./018-counterparty-brief");
const clone=x=>structuredClone(x);
test("synthetic reviewer brief fixture set is deterministic and conservative",()=>{
  const r=brief.buildFixtureReview(fixtures);
  assert.equal(r.synthetic_fixture_count,8);
  assert.equal(r.reviewer_action_codes_exercised,6);
  assert.equal(r.contradictory_proceed_downgraded_to_review,true);
  assert.equal(r.actual_buyer_benefit_measured,false);
  assert.equal(r.real_customer_success_count,null);
  assert.equal(r.automatic_legal_clearance,false);
  assert.deepEqual(brief.buildFixtureReview(clone(fixtures)),r);
  assert.doesNotThrow(()=>brief.execute("check",brief.serialize(fixtures)));
});
test("inconsistent proceed cannot become automatic approval",()=>{
  for(const mutation of [
    x=>{x.reasonCodes=["OFAC_CANDIDATE_REQUIRES_REVIEW"];},
    x=>{x.checks.ofac.status="review";},
    x=>{delete x.checks.ofac;},
    x=>{x.sourceFailures=[{source:"synthetic",detail:"FAILED"}];},
    x=>{x.chargeable=false;}
  ]){
    const x=clone(fixtures.cases[0].input);mutation(x);
    const r=brief.summarize(x);
    assert.equal(r.conservative_reviewer_decision,"human_review");
    assert.equal(r.needs_manual_clearance,true);
    assert.equal(r.qualifies_as_sanctions_clearance,false);
  }
});
test("reviewer brief does not leak raw evidence, headers or identifiers",()=>{
  const x=clone(fixtures.cases[0].input);
  x.evidence={private_account:"TOP_SECRET_DO_NOT_LOG"};
  x.matchedEntity={businessName:"PRIVATE_SYNTHETIC_CUSTOMER_NAME"};
  x.headers={"payment-signature":"PAYMENT_TOKEN_DO_NOT_ECHO"};
  x.sourceFailures=[];
  const serialized=JSON.stringify(brief.summarize(x));
  for(const needle of ["TOP_SECRET_DO_NOT_LOG","PRIVATE_SYNTHETIC_CUSTOMER_NAME","PAYMENT_TOKEN_DO_NOT_ECHO"]){
    assert.equal(serialized.includes(needle),false);
  }
});
test("unknown or malignant reason codes fail closed without upconverting identity to clearance",()=>{
  const x=clone(fixtures.cases[0].input);
  x.reasonCodes=["UNKNOWN_REVIEW_REQUIRES_HUMAN"];
  const r=brief.summarize(x);
  assert.equal(r.conservative_reviewer_decision,"human_review");
  assert.equal(r.next_action_code,"MANUAL_REVIEW_UNCLASSIFIED");
  assert.throws(()=>brief.summarize({...x,reasonCodes:["<script>alert(1)</script>"]}),/invalid or untrusted/);
  assert.throws(()=>brief.buildFixtureReview({...fixtures,cases:[fixtures.cases[0],fixtures.cases[0],...fixtures.cases.slice(2)]}),/duplicate expected fixture/);
});
