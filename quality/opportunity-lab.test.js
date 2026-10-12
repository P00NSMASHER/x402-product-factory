"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {loadSpecs}=require("../scripts/generate-spec-artifacts");
const data=require("./opportunities.json");
const lab=require("./opportunity-lab");
const clone=x=>structuredClone(x);
const specs=loadSpecs();

test("three existing-product improvements are measurable unverified hypotheses",()=>{
  const q=lab.buildQueue(data,specs);
  assert.equal(q.total_hypotheses,3);
  assert.equal(q.observed_buyer_outcomes,0);
  assert.equal(q.product_025_unlock_evidence,false);
  assert.deepEqual(q.proposals.map(p=>p.product_number),["007","018","024"]);
  assert.ok(q.proposals.every(p=>
    p.observed_benefit===null&&p.verified_independent_buyers===null&&
    p.actual_full_unit_margin===null&&p.production_approved===false&&
    p.candidate_status==="HOLD_UNMEASURED_BENEFIT"
  ));
  assert.equal(q.proposals.find(x=>x.product_number==="007").fee_only_screen,"fee_negative");
  assert.equal(q.proposals.find(x=>x.product_number==="018").fee_only_screen,"passes_fee_only_screen");
});
test("duplicate, unregistered, or Product 025+ opportunity cannot enter queue",()=>{
  const duplicate=clone(data);
  duplicate.opportunities.push(clone(data.opportunities[0]));
  assert.throws(()=>lab.buildQueue(duplicate,specs),/duplicate improvement/);
  const unregistered=clone(data);
  unregistered.opportunities[0].product_id="brand-new-product-025";
  assert.throws(()=>lab.buildQueue(unregistered,specs),/unregistered or Product 025/);
});
test("experiment fields cannot self-certify market fit, margins or release",()=>{
  const changes=[
    x=>{x.opportunities[0].lifecycle_status="validated";},
    x=>{x.opportunities[0].comparator.measured_baseline_time_seconds=12;},
    x=>{x.opportunities[0].evidence.independent_buyer_interviews=4;},
    x=>{x.opportunities[0].evidence.verified_unit_profit="5.00";},
    x=>{x.opportunities[0].safety.auto_deploy=true;},
    x=>{x.opportunities[0].safety.unlocks_product_025=true;},
    x=>{x.opportunities[0].blind_evaluation.independent_reviewers_target=1;},
    x=>{x.opportunities[0].blind_evaluation.counterexamples=[];},
    x=>{x.opportunities[0].customer_job.persona="x";},
    x=>{x.opportunities[0].price_override="0.100";}
  ];
  for(const change of changes){
    const d=clone(data);change(d);
    assert.throws(()=>lab.buildQueue(d,specs),/QUALITY_OPPORTUNITY_GATE/);
  }
});
test("opportunity generated artifacts are deterministic and protected from drift",()=>{
  const artifacts=lab.serialize(data,specs);
  assert.deepEqual(artifacts,lab.serialize(clone(data),clone(specs)));
  assert.match(artifacts["OPPORTUNITY_QUEUE.md"],/HOLD_UNMEASURED_BENEFIT/);
  assert.match(artifacts["OPPORTUNITY_QUEUE.md"],/Product 025\+ remains frozen/);
  assert.doesNotThrow(()=>lab.execute("check",artifacts));
  assert.throws(()=>lab.execute("check",{
    ...artifacts,"OPPORTUNITY_QUEUE.json":artifacts["OPPORTUNITY_QUEUE.json"]+"tamper"
  }),/stale opportunity artifact/);
});
