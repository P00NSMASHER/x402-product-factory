"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {spawnSync}=require("node:child_process");
const path=require("node:path");
const registry=require("../product-registry.json");
const snapshot=require("./payai-base-rate-2026-10-10.json");
const economics=require("./live-fee-economics");

const NOW=Date.parse("2026-10-10T12:43:00.000Z");
const BASE=snapshot.provider_response_subset;
function clone(value){return JSON.parse(JSON.stringify(value));}
function validate(payload=BASE,opts={}) {
  return economics.validatePricing(payload,{nowMs:NOW,...opts});
}
function report(payload=BASE,opts={}) {
  return economics.buildReport(payload,{
    nowMs:NOW,rateObservation:"historical_pinned_snapshot",...opts
  });
}
function expectedFail(mutator,reason=/ECONOMICS_/) {
  const changed=clone(BASE);
  mutator(changed);
  assert.throws(()=>validate(changed),reason);
}

test("pinned October public PayAI Base EIP3009 rate is exact and documented",()=>{
  const parsed=validate();
  assert.equal(snapshot.schema_version,1);
  assert.equal(snapshot.source_url,economics.PRICING_URL);
  assert.equal(snapshot.snapshot_is_historical,true);
  assert.equal(snapshot.seller_wallet_entitlement_verified,false);
  assert.equal(snapshot.seller_wallet_specific_remaining_credits,null);
  assert.equal(parsed.provider_as_of,"2026-10-10T11:56:30.014Z");
  assert.equal(parsed.rate_id,"ddbd079f-72ce-467d-bde8-859151d83999");
  assert.equal(parsed.fee_usd,"0.002180");
  assert.equal(parsed.credits_per_settlement,"2.18");
  assert.equal(parsed.credit_usd,"0.001");
  assert.equal(parsed.network,"eip155:8453");
  assert.equal(parsed.scheme,"exact");
  assert.equal(parsed.transfer_method,"eip3009");
});

test("fee screening covers exactly 24 existing registered products, not staged sales",()=>{
  const r=report();
  assert.equal(r.summary.registered_products,24);
  assert.deepEqual(r.summary.below_fee_product_numbers,
    ["001","007","010","011","012","021","022"]);
  assert.equal(r.summary.prices_below_paid_fee,7);
  assert.deepEqual(r.summary.fee_only_target_possible_numbers,["002","018"]);
  assert.equal(r.summary.fee_only_target_possible_count,2);
  assert.equal(r.summary.fee_only_target_impossible_count,22);
  assert.equal(r.entries[23].number,"024");
  assert.equal(r.entries[23].registry_status,
    registry.products.find(p=>p.number==="024").status);
  assert.equal(r.product_025_unlocked,false);
  assert.equal(r.price_changes_applied,false);
  assert.equal(r.summary.actual_profitable_products_verified,0);
  assert.equal(r.summary.independent_external_buyers_verified,0);
  assert.ok(r.entries.every(e=>e.complete_unit_economics===false &&
    e.actual_profitability_verified===false &&
    e.live_product_availability_verified===false));
});

test("fee-only ceiling arithmetic and threshold use exact USDC micro-units",()=>{
  const r=report();
  const by=Object.fromEntries(r.entries.map(p=>[p.number,p]));
  assert.equal(by["001"].fee_only_contribution_ceiling_usd,"-0.001180");
  assert.equal(by["001"].fee_only_margin_ceiling_basis_points,-11800);
  assert.equal(by["007"].fee_only_contribution_ceiling_usd,"-0.000180");
  assert.equal(by["002"].fee_only_contribution_ceiling_usd,"0.017820");
  assert.equal(by["018"].fee_only_contribution_ceiling_usd,"0.007820");
  assert.equal(by["019"].fee_only_contribution_ceiling_usd,"0.004820");
  assert.equal(by["003"].fee_only_contribution_ceiling_usd,"0.002820");
  assert.equal(by["004"].fee_only_contribution_ceiling_usd,"0.000820");
  assert.equal(by["002"].target_margin_possible_before_other_costs,true);
  assert.equal(by["018"].target_margin_possible_before_other_costs,true);
  assert.equal(by["019"].target_margin_possible_before_other_costs,false);
  assert.equal(r.minimum_price_to_reach_fee_only_target_usdc,"0.007267");
  const floor=economics.micros(r.minimum_price_to_reach_fee_only_target_usdc);
  const fee=economics.micros(r.paid_facilitator_fee_usd);
  assert.ok((floor-fee)*100n>=floor*70n);
  assert.ok((floor-1n-fee)*100n < (floor-1n)*70n);
});

test("saved free-credit scenario is a maximum conditional ceiling, never balance",()=>{
  const r=report();
  assert.equal(r.free_allowance_model.default_lifetime_credits,1000);
  assert.equal(r.free_allowance_model.maximum_settlements_if_entire_default_allowance_unspent,458);
  assert.equal(r.free_allowance_model.specific_seller_wallet_entitlement_verified,false);
  assert.equal(r.free_allowance_model.specific_seller_wallet_remaining_credits,null);
  assert.equal(r.free_allowance_model.shared_allowance_can_exhaust_earlier,true);
  assert.equal(r.free_allowance_model.zero_facilitator_fee_scenario_only_when_allowance_verified,true);
  assert.deepEqual(r.cost_coverage,{
    facilitator_paid_fee:true,
    hosting:false,
    source_provider_variable_costs:false,
    failed_requests_retries_refunds:false,
    development_distribution_support:false
  });
});

test("fixed decimal parsing never uses floats or silently rounds unsupported precision",()=>{
  assert.equal(economics.micros("0.00218"),2180n);
  assert.equal(economics.micros("0.020"),20000n);
  assert.equal(economics.formatMicros(-180n),"-0.000180");
  assert.equal(economics.formatMicros(0n),"0.000000");
  assert.equal(economics.centiCredits("2.18"),218n);
  assert.equal(economics.centiCredits("2.1"),210n);
  for(const value of ["1e-3","-0.1","0.1234567","0x1","NaN",
    0.00218,undefined,null," 0.00218","00.2"]) {
    assert.throws(()=>economics.micros(value),/ECONOMICS_INVALID_USD_AMOUNT/);
  }
  for(const value of ["2.189","-2","1e2",2.18]) {
    assert.throws(()=>economics.centiCredits(value),/ECONOMICS_INVALID_CREDIT_RATE/);
  }
});

test("exact published Base EIP3009 selection ignores unrelated schemes and chains",()=>{
  const full=clone(BASE);
  full.rates.push({...full.rates[0],network:"eip155:42161",usd:"0.00999"});
  full.rates.push({...full.rates[0],transferMethod:"permit2",usd:"0.00205"});
  const rate=validate(full);
  assert.equal(rate.fee_usd,"0.002180");
  assert.equal(rate.rate_id,BASE.rates[0].rateId);
});

test("missing duplicate or unpublished Base EIP3009 pricing fails closed",()=>{
  expectedFail(d=>{d.rates=[];},/ECONOMICS_BASE_RATE/);
  expectedFail(d=>{d.rates.push(d.rates[0]);},/ECONOMICS_BASE_RATE/);
  expectedFail(d=>{d.rates[0].published=false;},/ECONOMICS_BASE_RATE/);
  expectedFail(d=>{d.rates[0].network="eip155:1";},/ECONOMICS_BASE_RATE/);
  expectedFail(d=>{d.rates[0].scheme="upto";},/ECONOMICS_BASE_RATE/);
  expectedFail(d=>{d.rates[0].transferMethod="permit2";},/ECONOMICS_BASE_RATE/);
});

test("disagreeing PayAI credit and USD prices, zero fee, unsupported dates fail",()=>{
  expectedFail(d=>{d.rates[0].usd="0.00219";},/ECONOMICS_RATE_CREDITS_USD_DISAGREE/);
  expectedFail(d=>{d.rates[0].usd="0";},/ECONOMICS_NONPOSITIVE_AMOUNT/);
  expectedFail(d=>{d.creditUsd="0";},/ECONOMICS_NONPOSITIVE_AMOUNT/);
  expectedFail(d=>{d.rates[0].credits="2.181";},/ECONOMICS_INVALID_CREDIT_RATE/);
  expectedFail(d=>{d.rates[0].rateId="not-an-id";},/ECONOMICS_INVALID_PROVIDER_RATE_ID/);
  expectedFail(d=>{d.rates[0].effectiveAt="2026-10-11T00:00:00Z";},/ECONOMICS_RATE_NOT_YET_EFFECTIVE/);
  expectedFail(d=>{d.asOf="last week";},/ECONOMICS_INVALID_PROVIDER_TIMESTAMP/);
});

test("fresh live snapshots reject staleness, future timestamp and unprocessed effective changes",()=>{
  assert.equal(validate(BASE,{requireFresh:true}).fee_usd,"0.002180");
  assert.throws(()=>validate(BASE,{requireFresh:true,nowMs:NOW+49*60*60*1000}),
    /ECONOMICS_PROVIDER_SNAPSHOT_STALE/);
  assert.throws(()=>validate(BASE,{requireFresh:true,
    nowMs:Date.parse("2026-10-10T11:00:00Z")}),
    /ECONOMICS_FUTURE_PROVIDER_TIMESTAMP/);
  const upcoming=clone(BASE);
  upcoming.upcoming.push({
    network:"eip155:8453",scheme:"exact",transferMethod:"eip3009",
    effectiveAt:"2026-10-10T12:00:00.000Z"
  });
  assert.throws(()=>validate(upcoming),/ECONOMICS_UNAPPLIED_EFFECTIVE_UPCOMING_RATE/);
  upcoming.upcoming[0].effectiveAt="2026-10-11T12:00:00.000Z";
  assert.equal(validate(upcoming).fee_usd,"0.002180");
});

test("registry duplication, missing products, synthetic Product 025 and price hacks fail",()=>{
  const mutators=[
    arr=>arr.pop(),
    arr=>arr.push({...arr[23],number:"025",id:"artificial"}),
    arr=>arr[4].id=arr[3].id,
    arr=>arr[4].path=arr[3].path,
    arr=>arr[4].number=arr[3].number,
    arr=>arr[4].price_usdc="0.0000000",
    arr=>arr[4].price_usdc="-1",
    arr=>arr[4].method="POST",
    arr=>arr[4].status=null
  ];
  for(const mutate of mutators){
    const products=clone(registry);
    mutate(products.products);
    assert.throws(()=>economics.validateRegistry(products),/ECONOMICS_/);
  }
});

test("fee change updates sensitivity only and does not alter product registry",()=>{
  const changed=clone(BASE);
  changed.rates[0].credits="3.00";
  changed.rates[0].usd="0.00300";
  const before=JSON.stringify(registry);
  const r=report(changed);
  assert.equal(r.paid_facilitator_fee_usd,"0.003000");
  assert.equal(r.summary.prices_below_paid_fee,7+0);
  assert.equal(r.summary.fee_only_target_possible_count,2);
  assert.equal(r.price_changes_applied,false);
  assert.equal(JSON.stringify(registry),before);
  assert.ok(r.entries.every(e=>e.registered_price_usdc===
    registry.products.find(p=>p.number===e.number).price_usdc));
});

test("public rate fetch uses unauthenticated GET and prohibits redirects",async()=>{
  const observed=[];
  const body=JSON.stringify(BASE);
  const pricing=await economics.fetchPricing({
    fetchImpl:async (url,opts)=>{
      observed.push({url,method:opts.method,headers:opts.headers,redirect:opts.redirect});
      return {ok:true,text:async()=>body};
    }
  });
  assert.deepEqual(pricing,BASE);
  assert.deepEqual(observed,[{
    url:economics.PRICING_URL,method:"GET",
    headers:{accept:"application/json"},redirect:"error"
  }]);
});

test("public rate failures, malformed JSON and enormous bodies fail closed",async()=>{
  for(const response of [
    {ok:false,text:async()=>"forbidden"},
    {ok:true,text:async()=>"{bad json"},
    {ok:true,text:async()=>"0".repeat(262145)}
  ]){
    await assert.rejects(economics.fetchPricing({
      fetchImpl:async()=>response
    }),/ECONOMICS_/);
  }
  await assert.rejects(economics.fetchPricing({timeoutMs:0}),/ECONOMICS_/);
});

test("CLI historical check is reproducible, labels limits and requires explicit mode",()=>{
  const file=path.join(__dirname,"live-fee-economics.js");
  const check=spawnSync(process.execPath,[file,"--check"],{encoding:"utf8"});
  assert.equal(check.status,0,check.stderr);
  const result=JSON.parse(check.stdout);
  assert.equal(result.ok,true);
  assert.equal(result.snapshot_historical,true);
  assert.equal(result.summary.registered_products,24);
  assert.equal(result.summary.prices_below_paid_fee,7);
  assert.equal(result.summary.fee_only_target_impossible_count,22);
  assert.equal(result.automatic_price_changes,false);
  const detailed=spawnSync(process.execPath,[file,"--snapshot"],{encoding:"utf8"});
  assert.equal(detailed.status,0,detailed.stderr);
  const r=JSON.parse(detailed.stdout);
  assert.equal(r.rate_observation,"historical_pinned_snapshot");
  assert.equal(r.cost_coverage.hosting,false);
  assert.equal(r.summary.actual_profitable_products_verified,0);
  const invalid=spawnSync(process.execPath,[file],{encoding:"utf8"});
  assert.notEqual(invalid.status,0);
  assert.equal(invalid.stdout,"");
  assert.ok(invalid.stderr.includes("ECONOMICS_USAGE"));
});
