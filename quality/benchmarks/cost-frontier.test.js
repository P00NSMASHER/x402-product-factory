"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {loadSpecs}=require("../../scripts/generate-spec-artifacts");
const frontier=require("./cost-frontier");
const clone=x=>structuredClone(x);

test("cost frontier includes 22 original products in canonical order",()=>{
  const report=frontier.build();
  assert.equal(report.product_count,22);
  assert.deepEqual(report.products.map(x=>x.product_number),
    Array.from({length:22},(_,i)=>String(i+3).padStart(3,"0")));
  assert.equal(report.positive_historical_target_headroom_count,1);
  assert.equal(report.production_or_pricing_authorizations,0);
  assert.equal(report.verified_independent_buyer_demand,false);
  assert.equal(report.verified_current_facilitator_fee_schedule,false);
  assert.deepEqual(frontier.build([...loadSpecs()].reverse()),report);
});
test("Product 018 has only 690 micros left under historical pinned 70-percent scenario",()=>{
  const r=frontier.build();
  const p=r.products.find(x=>x.product_number==="018");
  assert.equal(p.registered_price_usdc,"0.010");
  assert.equal(p.signed_incremental_cost_headroom_at_target_usd,"0.000690");
  assert.equal(p.hypothetical_price_floor_at_target_on_three_decimal_usdc_grid,"0.008");
  assert.deepEqual(p.hypothetical_extra_cost_scenarios.map(x=>x.hypothetical_margin_pct),
    [76.9,71.9,66.9]);
  assert.deepEqual(p.hypothetical_extra_cost_scenarios.map(x=>x.meets_fee_only_target_if_this_were_total_extra_cost),
    [true,true,false]);
  assert.equal(p.measured_actual_contribution_margin_pct,null);
  const p7=r.products.find(x=>x.product_number==="007");
  assert.equal(p7.signed_incremental_cost_headroom_at_target_usd,"-0.001710");
  assert.equal(p7.measured_actual_incremental_cost_per_purchase,null);
});
test("invalid economic evidence and unsupported specs must fail closed",()=>{
  const specs=loadSpecs();
  const mutations=[
    x=>{x.pop();},
    x=>{x[0].number="025";},
    x=>{x[0].economics.incremental_hosting_cost_usd="0.000000";},
    x=>{x[0].economics.post_allowance_margin_floor_pct=100;}
  ];
  for(const change of mutations){
    const s=clone(specs);change(s);
    assert.throws(()=>frontier.build(s));
  }
});
test("generated cost review must exactly match source specs",()=>{
  const content=frontier.serialize();
  assert.match(content["COST_FRONTIER.md"],/0\.000690/);
  assert.match(content["COST_FRONTIER.md"],/not current facilitator quotes/);
  assert.doesNotThrow(()=>frontier.execute("check",content));
  assert.throws(()=>frontier.execute("check",{
    ...content,"COST_FRONTIER.md":content["COST_FRONTIER.md"]+"tampered"
  }),/stale cost frontier artifact/);
});
