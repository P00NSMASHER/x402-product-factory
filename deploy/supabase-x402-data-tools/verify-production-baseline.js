"use strict";

// Offline guard against regressing the last independently inspected deployed
// Supabase seller's agent-discovery copy or x402 payment constants.
// This is a pinned snapshot: it cannot prove the live provider has not
// deployed another version since the manifest was captured.
const fs=require("node:fs");
const path=require("node:path");
const baseline=require("./production-baseline-20261010.json");

const SOURCE=path.join(__dirname,"index.ts");
const PAYMENT_NAMES=[
  "NETWORK","USDC","PAY_TO","FACILITATOR","PRICE","AMOUNT"
];

function drift(reason) {
  const error=new Error("PRODUCTION_BASELINE_DRIFT: "+reason);
  error.code="PRODUCTION_BASELINE_DRIFT";
  throw error;
}
function extractCandidate(source) {
  if(typeof source!=="string")drift("source must be text");
  const constants={};
  for(const name of PAYMENT_NAMES) {
    const pattern=new RegExp("\\bconst "+name+" = \"([^\"]+)\";");
    const match=source.match(pattern);
    if(!match)drift("missing constant "+name);
    constants[name]=match[1];
  }
  const match=source.match(/const ROUTES:\s*RouteDef\[\]\s*=\s*\[([\s\S]*?)\n\];/);
  if(!match)drift("cannot identify canonical route table");
  const text=match[1];
  const matches=[...text.matchAll(/^\s*path:\s*"([^"]+)"\s*,/gm)];
  const descriptions={};
  for(let i=0;i<matches.length;i++) {
    const route=matches[i][1];
    if(Object.hasOwn(descriptions,route))drift("duplicate route "+route);
    const start=matches[i].index;
    const end=matches[i+1]?.index??text.length;
    const block=text.slice(start,end);
    const description=block.match(/description:\s*\n\s*"([^"\n]+)"/);
    if(!description)drift("missing literal description for "+route);
    descriptions[route]=description[1];
  }
  return {payment_constants:constants,route_descriptions:descriptions};
}
function validateBaseline(source, reference=baseline) {
  if(!reference || reference.schema_version!==1 ||
      reference.function_slug!=="x402-data-tools" ||
      !Number.isSafeInteger(reference.deployed_version) ||
      !/^[a-f0-9]{64}$/.test(reference.supabase_reported_bundle_sha256||"")) {
    drift("invalid pinned production manifest");
  }
  const candidate=extractCandidate(source);
  for(const name of PAYMENT_NAMES) {
    if(candidate.payment_constants[name]!==reference.payment_constants?.[name]) {
      drift("payment constant changed: "+name);
    }
  }
  const expected=Object.keys(reference.route_descriptions||{}).sort();
  const actual=Object.keys(candidate.route_descriptions).sort();
  if(expected.length!==5 || actual.join("|")!==expected.join("|")) {
    drift("live v6 route topology changed");
  }
  for(const route of expected) {
    if(candidate.route_descriptions[route]!==reference.route_descriptions[route]) {
      drift("live v6 discovery description changed: "+route);
    }
  }
  return {
    ok:true,
    source_checked:"deploy/supabase-x402-data-tools/index.ts",
    pinned_live_version:reference.deployed_version,
    observed_date:reference.observed_date,
    route_count:actual.length,
    live_parity_scope:"payment_constants_and_agent_discovery_descriptions",
    current_live_deployment_verified:false
  };
}
function main() {
  const status=validateBaseline(fs.readFileSync(SOURCE,"utf8"));
  process.stdout.write(JSON.stringify(status,null,2)+"\n");
}
if(require.main===module)main();
module.exports={extractCandidate,validateBaseline};
