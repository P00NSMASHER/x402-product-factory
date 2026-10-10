"use strict";

// Read-only: the candidate must equal independently observed live v6 source,
// except for one post-settlement telemetry block. CI cannot confirm today's
// live deployment. A fresh provider-sourced snapshot is separately required
// for any future release review; passing never deploys or authorizes release.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const baseline = require("./production-baseline-20261010.json");

const SOURCE = path.join(__dirname,"index.ts");
const ROOT = path.resolve(__dirname,"../..");
const PAYMENT_NAMES = ["NETWORK","USDC","PAY_TO","FACILITATOR","PRICE","AMOUNT"];
const START = "  // Observability is best-effort: logging must never break a paid response.";
const END = '\n  return json(\n    { ...result, paid: true },\n    200,';
const MAX_SOURCE_BYTES = 131072;
const MAX_METADATA_BYTES = 16384;
const MAX_OBSERVATION_AGE_MS = 15 * 60 * 1000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function drift(reason) {
  const error = new Error("PRODUCTION_BASELINE_DRIFT: "+reason);
  error.code = "PRODUCTION_BASELINE_DRIFT";
  throw error;
}
function hash(text) {
  return crypto.createHash("sha256").update(text,"utf8").digest("hex");
}
function extractCandidate(source) {
  if (typeof source !== "string") drift("source must be text");
  const constants = {};
  for (const name of PAYMENT_NAMES) {
    const pattern = new RegExp("\\bconst "+name+" = \"([^\"]+)\";");
    const match = source.match(pattern);
    if (!match) drift("missing constant "+name);
    constants[name] = match[1];
  }
  const match = source.match(/const ROUTES:\s*RouteDef\[\]\s*=\s*\[([\s\S]*?)\n\];/);
  if (!match) drift("cannot identify canonical route table");
  const text = match[1];
  const matches = [...text.matchAll(/^\s*path:\s*"([^"]+)"\s*,/gm)];
  const descriptions = {};
  for (let i=0;i<matches.length;i++) {
    const route = matches[i][1];
    if (Object.hasOwn(descriptions,route)) drift("duplicate route "+route);
    const start = matches[i].index;
    const end = matches[i+1]?.index ?? text.length;
    const block = text.slice(start,end);
    const description = block.match(/description:\s*\n\s*"([^"\n]+)"/);
    if (!description) drift("missing literal description for "+route);
    descriptions[route] = description[1];
  }
  return {payment_constants:constants,route_descriptions:descriptions};
}
function stripTelemetry(source) {
  if (typeof source !== "string" ||
      Buffer.byteLength(source,"utf8") > MAX_SOURCE_BYTES) {
    drift("source size or type invalid");
  }
  const start = source.indexOf(START);
  if (start < 0 || source.indexOf(START,start+START.length) >= 0) {
    drift("missing or duplicate canonical settlement telemetry marker");
  }
  const end = source.indexOf(END,start);
  if (end < 0 || source.indexOf(END,end+END.length) >= 0) {
    drift("paid success response anchor not unique");
  }
  const block = source.slice(start,end);
  const expected = [
    'event: "x402_settlement_succeeded"',
    "schema_version: 2",
    "listed_price_usdc: PRICE.slice(1)",
    "expected_amount_atomic_usdc: AMOUNT",
    'evidence_source: "facilitator_settle_response"',
    "onchain_verified: false",
    "external_buyer_verified: false",
    "eligible_for_revenue_scoreboard: false",
    "settled_at: new Date().toISOString()"
  ];
  for (const field of expected) {
    if (!block.includes(field)) drift("telemetry evidence contract drift");
  }
  if (block.includes("paymentPayload") || block.includes("url.searchParams") ||
      block.includes("payment-signature") || block.includes("x-payment")) {
    drift("unsafe telemetry input capture");
  }
  const before = source.slice(0,start);
  if (!before.includes("const settlement = await settleSamePayment(paymentPayload);") ||
      !before.includes("if (!settlement.ok)")) {
    drift("telemetry is not after settlement success");
  }
  // Preserve every pre-existing byte: code, routes, discovery, payment, fees,
  // source handlers, validation and response behavior, not just five strings.
  return { original:before+source.slice(end+1), telemetry:block };
}
function validateBaseline(source, reference=baseline) {
  if (!reference || reference.schema_version!==1 ||
      reference.project_ref!=="bvjtimsalbzkmulyinpg" ||
      reference.function_slug!=="x402-data-tools" ||
      reference.deployed_version!==6 ||
      reference.deployed_status!=="ACTIVE" ||
      reference.telemetry_only_delta_expected!==true ||
      reference.release_preflight_requires_fresh_live_snapshot!==true ||
      reference.deployment_authorized!==false ||
      !SHA256_PATTERN.test(reference.observed_live_source_sha256||"") ||
      !SHA256_PATTERN.test(reference.supabase_reported_bundle_sha256||"")) {
    drift("invalid pinned production manifest");
  }
  const candidate = extractCandidate(source);
  for (const name of PAYMENT_NAMES) {
    if (candidate.payment_constants[name]!==reference.payment_constants?.[name]) {
      drift("payment constant changed: "+name);
    }
  }
  const expected = Object.keys(reference.route_descriptions||{}).sort();
  const actual = Object.keys(candidate.route_descriptions).sort();
  if (expected.length!==5 || actual.join("|")!==expected.join("|")) {
    drift("live v6 route topology changed");
  }
  for (const route of expected) {
    if (candidate.route_descriptions[route]!==reference.route_descriptions[route]) {
      drift("live v6 discovery description changed: "+route);
    }
  }
  const { original,telemetry } = stripTelemetry(source);
  if (hash(original)!==reference.observed_live_source_sha256) {
    drift("complete source diverged from observed live v6");
  }
  return {
    ok:true,
    source_checked:"deploy/supabase-x402-data-tools/index.ts",
    pinned_live_version:reference.deployed_version,
    observed_date:reference.observed_date,
    route_count:actual.length,
    source_sha256:hash(source),
    pinned_live_source_sha256:hash(original),
    telemetry_bytes:Buffer.byteLength(telemetry,"utf8"),
    live_parity_scope:"exact_live_v6_source_except_settlement_telemetry",
    current_live_deployment_verified:false,
    deployment_authorized:false
  };
}
function readPrivateSnapshot(filename,limit) {
  if (typeof filename!=="string" || !path.isAbsolute(filename)) {
    drift("live snapshot absolute path required");
  }
  const resolved=path.resolve(filename);
  if (resolved===ROOT || resolved.startsWith(ROOT+path.sep)) {
    drift("live snapshot must be outside repository");
  }
  const dir=path.dirname(resolved);
  if (!fs.existsSync(dir)) drift("live snapshot directory missing");
  const dirInfo=fs.lstatSync(dir);
  if (!dirInfo.isDirectory() || dirInfo.isSymbolicLink() ||
      (dirInfo.mode&0o077)!==0 || fs.realpathSync(dir)!==dir) {
    drift("live snapshot directory not private");
  }
  let fd;
  try {
    fd=fs.openSync(resolved,fs.constants.O_RDONLY |
      (fs.constants.O_NOFOLLOW||0));
  } catch(e) {
    if (["ELOOP","ENOENT","EISDIR","EACCES","EPERM"].includes(e?.code)) {
      drift("live snapshot missing or disallowed filesystem object");
    }
    throw e;
  }
  try {
    const info=fs.fstatSync(fd);
    if (!info.isFile() || info.nlink!==1 || (info.mode&0o077)!==0 ||
        info.size>limit) drift("live snapshot file not private or too large");
    return fs.readFileSync(fd,"utf8");
  } finally { fs.closeSync(fd); }
}
function validateFreshProviderSnapshot(source,liveSource,provider,observedAt,{
  reference=baseline, nowMs=Date.now()
}={}) {
  const offline = validateBaseline(source,reference);
  const observed=Date.parse(observedAt);
  if (typeof observedAt!=="string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(observedAt) ||
      !Number.isFinite(observed) || !Number.isFinite(nowMs) ||
      observed>nowMs || nowMs-observed>MAX_OBSERVATION_AGE_MS) {
    drift("provided snapshot timestamp is missing, stale or in future");
  }
  if (typeof liveSource!=="string" ||
      hash(liveSource)!==reference.observed_live_source_sha256 ||
      stripTelemetry(source).original!==liveSource) {
    drift("new or altered live Supabase source");
  }
  if (!provider || typeof provider!=="object" || Array.isArray(provider) ||
      provider.slug!==reference.function_slug ||
      provider.status!==reference.deployed_status ||
      provider.version!==reference.deployed_version ||
      provider.ezbr_sha256!==reference.supabase_reported_bundle_sha256) {
    drift("live Supabase version or deployment bundle changed");
  }
  return {
    ...offline,
    snapshot_observed_at:observedAt,
    snapshot_freshness_seconds:Math.floor((nowMs-observed)/1000),
    supplied_live_source_verified:true,
    supplied_live_version_verified:true,
    provider_snapshot_independently_authenticated:false,
    current_live_deployment_verified:false,
    deployment_authorized:false
  };
}
function main(args=process.argv.slice(2)) {
  const source=fs.readFileSync(SOURCE,"utf8");
  if(args.length===0 || (args.length===1 && args[0]==="--check")) {
    process.stdout.write(JSON.stringify(validateBaseline(source),null,2)+"\n");
    return;
  }
  if(args.length===4 && args[0]==="--preflight") {
    const live=readPrivateSnapshot(args[1],MAX_SOURCE_BYTES);
    let provider;
    try {provider=JSON.parse(readPrivateSnapshot(args[2],MAX_METADATA_BYTES));}
    catch(e) {if(e?.code==="PRODUCTION_BASELINE_DRIFT")throw e; drift("invalid provider metadata JSON");}
    process.stdout.write(JSON.stringify(validateFreshProviderSnapshot(
      source,live,provider,args[3]
    ),null,2)+"\n");
    return;
  }
  drift("usage: --check OR --preflight PRIVATE_SOURCE PRIVATE_METADATA OBSERVED_AT_ISO");
}
if(require.main===module) {
  try {main();}
  catch(e){
    // Do not expose input paths, provider keys or private source on failures.
    process.stderr.write(e?.code==="PRODUCTION_BASELINE_DRIFT"?
      "PRODUCTION_BASELINE_DRIFT\n":"PRODUCTION_BASELINE_UNVERIFIED\n");
    process.exitCode=1;
  }
}
module.exports={
  MAX_OBSERVATION_AGE_MS,hash,extractCandidate,stripTelemetry,
  validateBaseline,readPrivateSnapshot,validateFreshProviderSnapshot,main
};
