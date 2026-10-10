"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const reference=require("./production-baseline-20261010.json");
const {extractCandidate,validateBaseline}=require("./verify-production-baseline");

const SOURCE=fs.readFileSync(path.join(__dirname,"index.ts"),"utf8");
test("candidate preserves the last observed live v6 seller discovery and payment constants",()=>{
  const report=validateBaseline(SOURCE);
  assert.equal(report.ok,true);
  assert.equal(report.pinned_live_version,6);
  assert.equal(report.route_count,5);
  assert.equal(report.current_live_deployment_verified,false);
  assert.equal(report.live_parity_scope,
    "payment_constants_and_agent_discovery_descriptions");
  const observed=extractCandidate(SOURCE);
  assert.deepEqual(observed.payment_constants,reference.payment_constants);
  assert.deepEqual(observed.route_descriptions,reference.route_descriptions);
});
test("five canonical agent descriptions match live source exactly",()=>{
  for(const [route,description] of Object.entries(reference.route_descriptions)) {
    assert.ok(SOURCE.includes('path: "'+route+'"'),route);
    assert.ok(SOURCE.includes(JSON.stringify(description)+","),route);
  }
  assert.equal(Object.keys(reference.route_descriptions).length,5);
});
test("changing the x402 payment rail, recipient or price always fails",()=>{
  const mutations=[
    [reference.payment_constants.NETWORK,'eip155:1'],
    [reference.payment_constants.USDC,
      '0x0000000000000000000000000000000000000000'],
    [reference.payment_constants.PAY_TO,
      '0x0000000000000000000000000000000000000000'],
    [reference.payment_constants.FACILITATOR,'https://example.invalid'],
    ['const PRICE = "'+reference.payment_constants.PRICE+'";','const PRICE = "$0.01";'],
    ['const AMOUNT = "'+reference.payment_constants.AMOUNT+'";','const AMOUNT = "10000";']
  ];
  for(const [before,after] of mutations) {
    assert.ok(SOURCE.includes(before),before);
    assert.throws(()=>validateBaseline(SOURCE.replace(before,after)),
      /PRODUCTION_BASELINE_DRIFT/);
  }
});
test("agent discovery regressions and missing routes are caught",()=>{
  const routes=Object.entries(reference.route_descriptions);
  for(const [route,description] of routes) {
    const changed=SOURCE.replace(JSON.stringify(description)+",",
      JSON.stringify("Generic API with no buyer task description")+",");
    assert.throws(()=>validateBaseline(changed),
      /PRODUCTION_BASELINE_DRIFT/,route);
    const missing=SOURCE.replace('path: "'+route+'"',
      'path: "/api/unknown-'+route.slice(5)+'"');
    assert.throws(()=>validateBaseline(missing),
      /PRODUCTION_BASELINE_DRIFT/,route);
  }
});
test("fixture rejects duplicate route metadata and unsupported manifest versions",()=>{
  const duplicates=SOURCE.replace('path: "/api/domain-rdap"',
    'path: "/api/sec-filings"');
  assert.throws(()=>validateBaseline(duplicates),/PRODUCTION_BASELINE_DRIFT/);
  assert.throws(()=>validateBaseline(SOURCE,{...reference,schema_version:99}),
    /PRODUCTION_BASELINE_DRIFT/);
});
test("baseline manifest distinguishes bundle digest from source parity",()=>{
  assert.match(reference.supabase_reported_bundle_sha256,/^[a-f0-9]{64}$/);
  assert.equal(reference.deployed_version,6);
  assert.equal(reference.deployed_status,"ACTIVE");
  assert.equal(reference.payment_constants.NETWORK,"eip155:8453");
  assert.ok(!Object.hasOwn(reference,"source_sha256"),
    "Supabase's reported bundle hash must not be presented as a source hash");
});
