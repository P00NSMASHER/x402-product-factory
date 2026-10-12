"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {CASES,simulate,runAll}=require("./018-runtime-canary");

test("full AppDeploy Product 018 mocked canary covers all critical phases without real money",async()=>{
  const report=await runAll();
  assert.equal(report.report_type,"OFFLINE_MOCKED_PRODUCT_018_RUNTIME_SHADOW_CANARY");
  assert.ok(report.exact_mock_cases>=25);
  assert.ok(report.nonchargeable_source_failures_checked>=12);
  assert.ok(report.coherent_paid_behaviors_checked>=5);
  assert.equal(report.zero_real_payment_submissions,true);
  assert.equal(report.zero_real_upstream_calls,true);
  assert.equal(report.ready_for_production,false);
  assert.equal(report.product_025_unlocked,false);
  assert.equal(report.release_gate,"HOLD_PENDING_REAL_SOURCE_PAYMENT_AND_CUSTOMER_EVIDENCE");
  const byId=Object.fromEntries(report.cases.map(s=>[s.id,s]));
  assert.deepEqual(byId.clean_proceed.mock_facilitator_trace,["verify","settle"]);
  assert.deepEqual(byId.contradictory_strong_registry_count.mock_facilitator_trace,["verify"]);
  assert.deepEqual(byId.contradictory_strong_registry_count.mock_source_call_trace,["registry"]);
  assert.deepEqual(byId.no_signature_challenge.mock_facilitator_trace,[]);
  assert.equal(byId.unregistered_domain_completed_review.http_status,200);
  assert.equal(byId.ofac_candidate_completed_review.decision,"human_review");
  assert.equal(byId.registry_transport_private_error.source_failure_ids[0],"pa_registry");
  assert.equal(byId.settlement_terminal_payment.http_status,402);
});
test("each required-source contract failure fails closed before a mock settlement",async()=>{
  const scenarios=CASES.filter(s=>s.expected_status===502);
  assert.ok(scenarios.length>=12);
  for(const s of scenarios){
    const outcome=await simulate(s);
    assert.equal(outcome.http_status,502,s.id);
    assert.equal(outcome.mock_settlement_calls,0,s.id);
    assert.deepEqual(outcome.mock_facilitator_trace,["verify"],s.id);
  }
});
test("staging route exhibits no mock facilitator traffic on unpaid, invalid or OPTIONS",async()=>{
  for(const kind of ["no_signature_challenge","cors_preflight","malformed_payment_signature","invalid_query_before_verify"]){
    const s=CASES.find(v=>v.id===kind);
    assert.ok(s);
    const outcome=await simulate(s);
    assert.equal(outcome.verified_mock_payments,0);
    assert.equal(outcome.mock_settlement_calls,0);
    assert.deepEqual(outcome.source_adapter_calls,[0,0,0]);
  }
});
test("expected mock scenario definitions cannot silently authorize release",()=>{
  assert.ok(CASES.length>=25);
  assert.equal(CASES.some(c=>c.expected_status===502&&c.expected_settle>0),false);
  assert.equal(CASES.some(c=>c.expected_status===200&&c.expected_settle!==1),false);
  assert.equal(CASES.some(c=>c.expected_status===200&&c.expected_decision===null),false);
});
