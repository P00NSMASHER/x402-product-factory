"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const registry=require("../product-registry.json");
const costs=require("./phase1-five-product-costs.json");

function toMicros(value){
  const match=String(value).match(/^(-?)(\d+)\.(\d{3,6})$/);
  assert.ok(match,"expected fixed decimal amount: "+value);
  const sign=match[1]==="-"?-1n:1n;
  const whole=BigInt(match[2]);
  const fraction=(match[3]+"000000").slice(0,6);
  return sign*(whole*1000000n+BigInt(fraction));
}

test("phase 1 five-product economics stays bound to registry pricing",()=>{
  assert.equal(costs.schema_version,1);
  assert.equal(costs.products.length,5);
  assert.deepEqual(costs.products.map(p=>p.number),["003","004","005","006","007"]);

  const fee=toMicros(costs.settlement.usd_per_successful_settlement);
  assert.equal(fee,2310n);
  assert.equal(costs.settlement.credits_per_successful_settlement,"2.31");
  assert.equal(costs.settlement.free_allowance_terms.current_default_credits_per_receiving_wallet,1000);
  assert.equal(costs.settlement.free_allowance_terms.allowance_scope,"lifetime");
  assert.equal(costs.settlement.free_allowance_terms.current_base_eip3009_full_settlement_ceiling_if_entire_default_allowance_is_available,432);
  assert.equal(costs.settlement.free_allowance_terms.seller_wallet_specific_entitlement_verified,false);
  assert.equal(costs.settlement.free_allowance_terms.seller_wallet_remaining_free_credits,null);
  assert.equal(costs.settlement.free_allowance_terms.public_remaining_credit_endpoint_available,false);
  assert.match(costs.settlement.free_allowance_terms.public_exhaustion_signal,/403/);

  for(const measured of costs.products){
    const product=registry.products.find(p=>p.number===measured.number);
    assert.ok(product,"measured product must exist in registry: "+measured.number);
    assert.equal(measured.id,product.id);
    assert.equal(measured.price_usdc,product.price_usdc);
    assert.equal(toMicros(measured.configured_direct_source_fee_usd_per_sale),0n);
    assert.equal(measured.incremental_hosting_cost_usd_per_sale,null);
    assert.equal(measured.complete_unit_economics,false);

    const expected=
      toMicros(measured.price_usdc)-
      fee-
      toMicros(measured.configured_direct_source_fee_usd_per_sale);
    assert.equal(
      toMicros(measured.lower_bound_contribution_usd_after_settlement_and_configured_source_fees),
      expected,
      measured.id+" lower-bound contribution"
    );

    const requests=measured.normal_source_requests;
    assert.ok(Number.isInteger(requests.cold_min)&&requests.cold_min>0);
    assert.ok(Number.isInteger(requests.cold_max)&&requests.cold_max>=requests.cold_min);
    assert.ok(Number.isInteger(requests.warm_min)&&requests.warm_min>0);
    assert.ok(Number.isInteger(requests.warm_max)&&requests.warm_max>=requests.warm_min);
    assert.ok(requests.warm_min<=requests.cold_min);
    assert.ok(requests.warm_max<=requests.cold_max);
  }
});

test("known lower-bound economics remain fail-closed",()=>{
  const byNumber=Object.fromEntries(costs.products.map(p=>[p.number,p]));
  assert.equal(byNumber["003"].lower_bound_contribution_usd_after_settlement_and_configured_source_fees,"0.002690");
  assert.equal(byNumber["004"].lower_bound_contribution_usd_after_settlement_and_configured_source_fees,"0.000690");
  assert.equal(byNumber["005"].lower_bound_contribution_usd_after_settlement_and_configured_source_fees,"0.000690");
  assert.equal(byNumber["006"].lower_bound_contribution_usd_after_settlement_and_configured_source_fees,"0.002690");
  assert.equal(byNumber["007"].lower_bound_contribution_usd_after_settlement_and_configured_source_fees,"-0.000310");
  assert.equal(costs.hosting.factory_products_003_007.incremental_hosting_cost_usd_per_sale,null);
});
