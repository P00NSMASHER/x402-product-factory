"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");
const {spawnSync}=require("node:child_process");
const reference=require("./production-baseline-20261010.json");
const {extractCandidate,validateBaseline,stripTelemetry,hash,
  readPrivateSnapshot,validateFreshProviderSnapshot}=require("./verify-production-baseline");

const SOURCE=fs.readFileSync(path.join(__dirname,"index.ts"),"utf8");
test("candidate preserves the last observed live v6 seller discovery and payment constants",()=>{
  const report=validateBaseline(SOURCE);
  assert.equal(report.ok,true);
  assert.equal(report.pinned_live_version,6);
  assert.equal(report.route_count,5);
  assert.equal(report.current_live_deployment_verified,false);
  assert.equal(report.live_parity_scope,
    "exact_live_v6_source_except_settlement_telemetry");
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


test("every pre-existing byte matches the pinned live v6 source SHA256",()=>{
  const {original,telemetry}=stripTelemetry(SOURCE);
  assert.equal(hash(original),reference.observed_live_source_sha256);
  assert.equal(telemetry.includes('event: "x402_settlement_succeeded"'),true);
  assert.equal(validateBaseline(SOURCE).source_sha256,hash(SOURCE));
  assert.equal(validateBaseline(SOURCE).current_live_deployment_verified,false);
  assert.equal(validateBaseline(SOURCE).deployment_authorized,false);
  assert.notEqual(reference.observed_live_source_sha256,
    reference.supabase_reported_bundle_sha256);
  assert.equal(hash(telemetry),reference.reviewed_settlement_telemetry_sha256);
  assert.equal(Buffer.byteLength(telemetry,"utf8"),reference.reviewed_settlement_telemetry_bytes);
});

test("exact source guard rejects unreviewed behavior changes beyond telemetry",()=>{
  const variants=[
    SOURCE.replace("maxTimeoutSeconds: 60","maxTimeoutSeconds: 600"),
    SOURCE.replace("const FUNCTION_NAME = \"x402-data-tools\";",
      "const FUNCTION_NAME = \"x402-data-tools-legacy\";"),
    SOURCE.replace("const BUILD_ID = \"supabase-x402-v5\";",
      "const BUILD_ID = \"supabase-x402-v6\";"),
    SOURCE.replace("function decodePayment(value: string)", "function decodePayment(value: any)"),
    SOURCE.replace("  if (!signature) return paymentRequired(route, base);",
      "  if (!signature) return json({paid:true});")
  ];
  for(const candidate of variants) {
    assert.notEqual(candidate,SOURCE,"mutation fixture must change a byte");
    assert.throws(()=>validateBaseline(candidate),/PRODUCTION_BASELINE_DRIFT/);
  }
});

test("missing duplicate or weakened telemetry evidence cannot pass the source gate",()=>{
  const stripped=stripTelemetry(SOURCE);
  const missing=stripped.original;
  assert.throws(()=>validateBaseline(missing),/PRODUCTION_BASELINE_DRIFT/);
  const duplicate=SOURCE.replace(stripped.telemetry,stripped.telemetry+stripped.telemetry);
  assert.throws(()=>validateBaseline(duplicate),/PRODUCTION_BASELINE_DRIFT/);
  const overclaim=SOURCE.replace("external_buyer_verified: false",
    "external_buyer_verified: true");
  assert.throws(()=>validateBaseline(overclaim),/PRODUCTION_BASELINE_DRIFT/);
  const unreviewed=SOURCE.replace(
    "const expectedNetwork = receipt.network === NETWORK;",
    "const expectedNetwork = receipt.network !== NETWORK;"
  );
  assert.throws(()=>validateBaseline(unreviewed),/PRODUCTION_BASELINE_DRIFT/);
  const leakage=SOURCE.replace('event: "x402_settlement_succeeded"',
    'event: "x402_settlement_succeeded", paymentPayload');
  assert.throws(()=>validateBaseline(leakage),/PRODUCTION_BASELINE_DRIFT/);
});

function privateFixtures(callback){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"x402-live-preflight-"));
  try{
    const source=path.join(dir,"live-index.ts");
    const metadata=path.join(dir,"live-metadata.json");
    const observed=stripTelemetry(SOURCE).original;
    const details={
      slug:reference.function_slug,
      version:reference.deployed_version,
      status:reference.deployed_status,
      ezbr_sha256:reference.supabase_reported_bundle_sha256
    };
    fs.writeFileSync(source,observed,{mode:0o600});
    fs.writeFileSync(metadata,JSON.stringify(details),{mode:0o600});
    callback({dir,source,metadata,observed,details});
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test("fresh provider-supplied v6 snapshot passes comparison without deployment authority",()=>{
  privateFixtures(({observed,details})=>{
    const now=Date.parse("2026-10-10T06:30:00.000Z");
    const result=validateFreshProviderSnapshot(SOURCE,observed,details,
      "2026-10-10T06:25:00.000Z",{nowMs:now});
    assert.equal(result.supplied_live_source_verified,true);
    assert.equal(result.supplied_live_version_verified,true);
    assert.equal(result.provider_snapshot_independently_authenticated,false);
    assert.equal(result.deployment_authorized,false);
    assert.equal(result.current_live_deployment_verified,false);
    assert.equal(result.snapshot_freshness_seconds,300);
  });
});
test("future or stale snapshots and provider revision changes fail closed",()=>{
  privateFixtures(({observed,details})=>{
    const now=Date.parse("2026-10-10T06:30:00.000Z");
    for(const when of [
      "2026-10-10T06:31:00.000Z",
      "2026-10-10T06:14:59.000Z",
      "2026-10-10",
      "invalid"
    ]){
      assert.throws(()=>validateFreshProviderSnapshot(SOURCE,observed,details,
        when,{nowMs:now}),/PRODUCTION_BASELINE_DRIFT/);
    }
    for(const changes of [
      {version:7},{status:"INACTIVE"},{slug:"other"},
      {ezbr_sha256:"f".repeat(64)}
    ]){
      assert.throws(()=>validateFreshProviderSnapshot(SOURCE,observed,{
        ...details,...changes
      },"2026-10-10T06:25:00.000Z",{nowMs:now}),/PRODUCTION_BASELINE_DRIFT/);
    }
    assert.throws(()=>validateFreshProviderSnapshot(SOURCE,
      observed.replace("const BUILD_ID","const BUILD_TAG"),details,
      "2026-10-10T06:25:00.000Z",{nowMs:now}),/PRODUCTION_BASELINE_DRIFT/);
  });
});
test("live snapshots stay outside repository and in owner-only files",()=>{
  privateFixtures(({source,metadata,dir})=>{
    assert.equal(readPrivateSnapshot(source,131072),
      stripTelemetry(SOURCE).original);
    assert.equal(JSON.parse(readPrivateSnapshot(metadata,16384)).version,6);
    fs.chmodSync(source,0o644);
    assert.throws(()=>readPrivateSnapshot(source,131072),/PRODUCTION_BASELINE_DRIFT/);
    fs.chmodSync(source,0o600);
    const link=path.join(dir,"source-link.ts");
    fs.symlinkSync(source,link);
    assert.throws(()=>readPrivateSnapshot(link,131072),/PRODUCTION_BASELINE_DRIFT/);
    fs.unlinkSync(link);
    assert.throws(()=>readPrivateSnapshot(path.join(__dirname,"index.ts"),131072),
      /PRODUCTION_BASELINE_DRIFT/);
  });
});
test("CLI --check is offline-only; CLI preflight requires supplied private files",()=>{
  privateFixtures(({source,metadata})=>{
    const script=path.join(__dirname,"verify-production-baseline.js");
    const offline=spawnSync(process.execPath,[script,"--check"],{encoding:"utf8"});
    assert.equal(offline.status,0,offline.stderr);
    const offlineResult=JSON.parse(offline.stdout);
    assert.equal(offlineResult.current_live_deployment_verified,false);
    assert.equal(offlineResult.deployment_authorized,false);
    const ok=spawnSync(process.execPath,[
      script,"--preflight",source,metadata,new Date().toISOString()
    ],{encoding:"utf8"});
    assert.equal(ok.status,0,ok.stderr);
    const preflightResult=JSON.parse(ok.stdout);
    assert.equal(preflightResult.supplied_live_source_verified,true);
    assert.equal(preflightResult.deployment_authorized,false);
    const changed=spawnSync(process.execPath,[
      script,"--preflight",source,metadata,"2020-01-01T00:00:00Z"
    ],{encoding:"utf8"});
    assert.notEqual(changed.status,0);
    assert.equal(changed.stdout,"");
    assert.ok(!changed.stderr.includes(source));
  });
});
