"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {loadSpecs}=require("../scripts/generate-spec-artifacts");
const lab=require("./product-quality-lab");

const specs=loadSpecs();
const clone=x=>structuredClone(x);
test("all 22 existing products receive evidence-constrained deterministic reviews",()=>{
  const r=lab.buildReport(specs);
  assert.equal(r.product_count,22);
  assert.deepEqual(r.fee_only_category_counts,{
    fee_negative:6,below_target_fee_only:15,passes_fee_only_screen:1
  });
  assert.equal(r.product_025_unlock_evidence,false);
  assert.equal(r.commercial_approvals_granted,0);
  assert.equal(r.independent_real_world_buyer_demand_status,"unmeasured");
  assert.equal(r.products[0].number,"003");
  assert.equal(r.products[21].number,"024");
  assert.ok(r.products.every(p=>
    p.evidence_not_established.actual_contribution_margin_pct===null&&
    p.evidence_not_established.independent_external_buyer_count===null&&
    p.production_or_pricing_change_authorized===false&&
    p.value_quality_proven===false
  ));
  assert.deepEqual(lab.buildReport([...specs].reverse()),r);
});
test("precision-safe fee screens do not confuse theoretical coverage with commercial validation",()=>{
  const p7=lab.reviewProduct(specs.find(p=>p.number==="007"));
  assert.equal(p7.historical_fee_only_economics.category,"fee_negative");
  assert.equal(p7.historical_fee_only_economics.hypothetical_margin_pct,-15.5);
  assert.equal(p7.next_design_experiment,"repackage_or_retire_standalone_hypothesis");
  const p18=lab.reviewProduct(specs.find(p=>p.number==="018"));
  assert.equal(p18.historical_fee_only_economics.hypothetical_margin_pct,76.9);
  assert.equal(p18.historical_fee_only_economics.category,"passes_fee_only_screen");
  assert.equal(p18.evidence_not_established.actual_contribution_margin_pct,null);
  assert.equal(p18.production_or_pricing_change_authorized,false);
  assert.equal(p18.product_025_unlock_evidence,false);
  assert.equal(lab.micros("0.010",3),10000n);
  assert.equal(lab.micros("0.002310",6),2310n);
  assert.equal(lab.decimalMoney(-310n),"-0.000310");
});
test("product drift and invented financial evidence fail closed",()=>{
  const mutations=[
    [s=>{s.push({...s[0],number:"025"});},/exactly Products 003/],
    [s=>{s[0].number="025";},/missing\/duplicate/],
    [s=>{s[0].economics.price_usdc="0.999";},/arithmetic drift/],
    [s=>{s[0].economics.incremental_hosting_cost_usd="0.000000";},/hosting-cost/],
    [s=>{s[0].buyer.expected_purchase_frequency.status="measured";},/purchase frequency/]
  ];
  for(const [mutation,pattern] of mutations){
    const x=clone(specs);mutation(x);
    assert.throws(()=>lab.buildReport(x),pattern);
  }
  for(const v of ["NaN","1e-3","-1.000","0.0031",0.003]){
    assert.throws(()=>lab.micros(v,3),/QUALITY_GATE/);
  }
});
test("generated markdown is deterministic, complete and does not claim verified profits",()=>{
  const a=lab.serialize(specs);
  const b=lab.serialize([...specs].reverse());
  assert.deepEqual(a,b);
  assert.match(a["PRODUCT_QUALITY.md"],/## Product-by-product experiments/);
  assert.match(a["PRODUCT_QUALITY.md"],/023 \| pa-local-vendor-policy-gate/);
  assert.match(a["PRODUCT_QUALITY.md"],/unknown.*not zero/);
  assert.doesNotMatch(a["PRODUCT_QUALITY.md"],/real verified revenue: [0-9]/);
  assert.doesNotThrow(()=>lab.execute("check",a));
});
test("output check refuses stale or missing snapshots",()=>{
  const artifact=lab.serialize(specs);
  assert.throws(()=>lab.execute("check",{
    ...artifact,"PRODUCT_QUALITY.md":artifact["PRODUCT_QUALITY.md"]+"tampered"
  }),/stale generated quality artifact/);
  assert.equal(lab.OUTSIDE_ENVIRONMENT_UNSUPPORTED,undefined);
});
