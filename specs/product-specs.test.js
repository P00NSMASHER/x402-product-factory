"use strict";

const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const assert=require("node:assert/strict");
const registry=require("../product-registry.json");

const ROOT=path.resolve(__dirname,"..");
const SPEC_FILES=[
  "003-pa-vendor-identity-match.json",
  "004-pa-business-address-match.json",
  "005-pa-business-domain-match.json",
  "006-sec-filing-freshness.json",
  "007-domain-registration-age.json"
];

function toMicros(value){
  const match=String(value).match(/^(-?)(\d+)\.(\d{3,6})$/);
  assert.ok(match,"expected fixed decimal amount: "+value);
  const sign=match[1]==="-"?-1n:1n;
  const fraction=(match[3]+"000000").slice(0,6);
  return sign*(BigInt(match[2])*1000000n+BigInt(fraction));
}

function oneDecimalRatioPct(numerator,denominator){
  assert.notEqual(denominator,0n);
  const scaled=numerator*1000n/denominator;
  return Number(scaled)/10;
}

function loadSpecs(){
  return SPEC_FILES.map(file=>JSON.parse(fs.readFileSync(path.join(__dirname,file),"utf8")));
}

test("product specs 003-007 are registry-bound and structurally complete",()=>{
  const specs=loadSpecs();
  assert.equal(specs.length,5);
  assert.deepEqual(specs.map(spec=>spec.number),["003","004","005","006","007"]);

  for(const spec of specs){
    assert.equal(spec.schema_version,1);
    const product=registry.products.find(item=>item.number===spec.number);
    assert.ok(product,"registry entry missing for "+spec.number);

    assert.equal(spec.id,product.id);
    assert.equal(spec.api.method,product.method);
    assert.equal(spec.api.path,product.path);
    assert.equal(spec.economics.price_usdc,product.price_usdc);
    assert.equal(spec.launch.current_status,product.status);
    assert.equal(spec.launch.release_gate,product.release_gate);
    assert.deepEqual([...spec.api.outputs.decisions].sort(),[...product.decision_values].sort());

    assert.equal(spec.buyer.expected_purchase_frequency.status,"unmeasured");
    assert.equal(spec.buyer.expected_purchase_frequency.value,null);
    assert.equal(spec.buyer.expected_purchase_frequency.unit,null);
    assert.ok(spec.buyer.expected_purchase_frequency.measurement_plan.length>=10);

    assert.ok(Array.isArray(spec.api.inputs)&&spec.api.inputs.length>0);
    assert.ok(Array.isArray(spec.sources)&&spec.sources.length>0);
    assert.ok(Array.isArray(spec.decision.rules)&&spec.decision.rules.length>0);
    assert.ok(fs.existsSync(path.join(ROOT,spec.decision.implementation)),spec.id+" decision implementation missing");
    assert.ok(Array.isArray(spec.launch.criteria)&&spec.launch.criteria.length>0);

    for(const source of spec.sources){
      assert.equal(typeof source.authority,"string");
      assert.equal(typeof source.refresh_policy,"string");
      assert.equal(typeof source.cache_policy,"string");
      assert.ok(
        source.freshness_limit_seconds===null ||
        (Number.isInteger(source.freshness_limit_seconds)&&source.freshness_limit_seconds>=0)
      );
    }

    assert.equal(spec.failure_behavior.automatic_reject,false);
    assert.equal(spec.economics.configured_direct_source_fee_usd,"0.000000");
    assert.equal(spec.economics.incremental_hosting_cost_usd,null);
    assert.equal(spec.economics.target_contribution_margin_pct,70);
    assert.equal(spec.economics.meets_target_before_unknown_costs,false);

    const price=toMicros(spec.economics.price_usdc);
    const settlement=toMicros(spec.economics.paid_settlement_cost_usd);
    const source=toMicros(spec.economics.configured_direct_source_fee_usd);
    const expected=oneDecimalRatioPct(price-settlement-source,price);
    assert.equal(spec.economics.post_allowance_margin_floor_pct,expected,spec.id+" margin floor");
  }
});

test("commercially important edge conditions remain explicit",()=>{
  const byNumber=Object.fromEntries(loadSpecs().map(spec=>[spec.number,spec]));
  assert.equal(byNumber["003"].decision.parameters.censusMaxDistanceMiles,0.25);
  assert.equal(byNumber["004"].decision.parameters.censusMaxDistanceMiles,0.25);
  assert.equal(byNumber["006"].decision.parameters.maxAgeDays.default,30);
  assert.equal(byNumber["006"].decision.parameters.maxAgeDays.minimum,1);
  assert.equal(byNumber["006"].decision.parameters.maxAgeDays.maximum,365);
  assert.equal(byNumber["007"].decision.parameters.minAgeDays.default,90);
  assert.equal(byNumber["007"].decision.parameters.minAgeDays.maximum,3650);
  assert.ok(byNumber["007"].economics.post_allowance_margin_floor_pct<0);
});
