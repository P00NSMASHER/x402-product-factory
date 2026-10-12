"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const doc=require("./018-private-cost-evidence.template.json");
const {loadSpecs}=require("../../scripts/generate-spec-artifacts");
const gate=require("./cost-evidence-gate");
const clone=x=>structuredClone(x);
test("empty evidence stays explicitly unknown and on hold",()=>{
  const result=gate.analyze(doc);
  assert.equal(result.input_status,"TEMPLATE_ONLY_ALL_REAL_COST_FIELDS_UNMEASURED");
  assert.equal(result.required_evidence_fields_missing.length,gate.EVIDENCE_FIELDS.length);
  assert.equal(result.operator_supplied_arithmetic_margin_pct,null);
  assert.equal(result.measured_settlements,null);
  assert.equal(result.commercialization_authorized,false);
  assert.equal(result.product_025_unlock_evidence,false);
  assert.equal(result.independently_verified_external_buyers,false);
  assert.doesNotThrow(()=>gate.execute("check",gate.serialize()));
});
function fakePrivatePacket(){
  const out=clone(doc);
  out.period_start="2026-09-01";out.period_end="2026-09-30";
  out.externally_settled_purchase_count=10;
  out.matched_settlement_trace_count=10;
  out.gross_before_refunds_usdc="0.100000";
  out.total_facilitator_and_chain_fees_usd="0.023100";
  out.total_source_api_fees_usd="0.001000";
  out.incremental_hosting_cost_usd="0.002000";
  out.total_retry_refund_support_cost_usd="0.001000";
  out.gross_refunds_usdc="0.000000";
  for(const k of gate.FIELDS.filter(x=>x.endsWith("_sha256")))out[k]="a".repeat(64);
  return out;
}
test("even a plausible private financial packet cannot self-certify proof or release",()=>{
  const report=gate.analyze(fakePrivatePacket());
  assert.equal(report.operator_supplied_arithmetic_margin_pct,72.9);
  assert.equal(report.meets_arithmetic_target,true);
  assert.equal(report.real_external_invoices_authenticated,false);
  assert.equal(report.independently_verified_external_buyers,false);
  assert.equal(report.commercialization_authorized,false);
  assert.equal(report.release_gate,"HOLD_PENDING_INDEPENDENT_INVOICE_AND_BUYER_AUDIT");
  assert.equal(report.product_025_unlock_evidence,false);
});
test("cost manipulation, extra PII and partially filled templates fail closed",()=>{
  const base=fakePrivatePacket();
  const mutations=[
    x=>{x.gross_before_refunds_usdc="0.110000";},
    x=>{x.gross_refunds_usdc="0.200000";},
    x=>{x.externally_settled_purchase_count=11;},
    x=>{x.matched_settlement_trace_count=9;},
    x=>{x.period_start="2026-02-30";},
    x=>{x.period_end="2026-08-01";},
    x=>{x.independent_hosting_invoice_sha256="bad";},
    x=>{x.total_facilitator_and_chain_fees_usd="-0.002310";},
    x=>{x.customer_email="pii@example.com";}
  ];
  for(const mutate of mutations){
    const x=clone(base);mutate(x);
    assert.throws(()=>gate.analyze(x),/COST_EVIDENCE_GATE|QUALITY_GATE/);
  }
  const partial=clone(doc);
  partial.period_start="2026-09-01";
  assert.throws(()=>gate.analyze(partial),/partially populated/);
  const badSpecs=clone(loadSpecs());
  badSpecs.find(x=>x.id==="pa-vendor-counterparty-review").economics.price_usdc="0.900";
  assert.throws(()=>gate.analyze(doc,badSpecs),/product registry/);
});
test("public cost-evidence status is deterministic and tamper-protected",()=>{
  const a=gate.serialize(doc,loadSpecs());
  assert.deepEqual(a,gate.serialize(clone(doc),clone(loadSpecs())));
  assert.match(a["COST_EVIDENCE_GATE.md"],/HOLD_UNVERIFIED/);
  assert.doesNotThrow(()=>gate.execute("check",a));
  assert.throws(()=>gate.execute("check",{
    ...a,"COST_EVIDENCE_GATE.md":a["COST_EVIDENCE_GATE.md"]+"forged"
  }),/stale cost-evidence status artifact/);
});
