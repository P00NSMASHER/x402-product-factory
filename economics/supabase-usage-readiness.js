"use strict";

// Private aggregate-log analysis. A paid API 200 does NOT prove settlement,
// external demand, or profitability. No raw URLs, headers, IPs or wallet data.
const fs=require("node:fs");
const path=require("node:path");
const ROOT=path.resolve(__dirname,"..");
const PREFIX="/functions/v1/x402-data-tools";
const ROUTES=Object.freeze({
  "/api/sec-filings":"sec-filings",
  "/api/ofac-sdn-screen":"ofac-sdn-screen",
  "/api/us-address-geocode":"us-address-geocode",
  "/api/domain-rdap":"domain-rdap",
  "/api/treasury-average-rates":"treasury-average-rates"
});
const DISCOVERY=new Set([
  "/.well-known/x402","/.well-known/x402.json","/openapi.json",
  "/llms.txt","/skill.md","/health"
]);
const INPUT_KEYS=["schema_version","source","function_slug","window_start","window_end","coverage","rows"].sort().join(",");
const ROW_KEYS=["method","pathname","status","invocations","mean_execution_ms","p95_execution_ms"].sort().join(",");
function fail(code){const e=new Error(code);e.code=code;throw e;}
function object(x){return !!x&&typeof x==="object"&&!Array.isArray(x);}
function validTime(x){return typeof x==="string"&&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(x)&&
  Number.isFinite(Date.parse(x));}
function validateAggregates(input){
  if(!object(input)||Object.keys(input).sort().join(",")!==INPUT_KEYS||
    input.schema_version!==1||input.source!=="function_edge_logs_aggregated"||
    input.function_slug!=="x402-data-tools"||
    input.coverage!=="observed_log_rows_not_invoice"||
    !validTime(input.window_start)||!validTime(input.window_end)||
    Date.parse(input.window_end)<=Date.parse(input.window_start)||
    Date.parse(input.window_end)-Date.parse(input.window_start)>86400000||
    !Array.isArray(input.rows)||input.rows.length>250){
    fail("USAGE_INVALID_SNAPSHOT");
  }
  const seen=new Set();
  for(const r of input.rows){
    if(!object(r)||Object.keys(r).sort().join(",")!==ROW_KEYS||
      typeof r.pathname!=="string"||r.pathname.length>180||
      !r.pathname.startsWith(PREFIX+"/")||
      !/^\/[A-Za-z0-9_./-]+$/.test(r.pathname)||r.pathname.includes("..")||
      !/^[A-Z]{3,10}$/.test(r.method||"")||
      !Number.isInteger(r.status)||r.status<100||r.status>599||
      !Number.isSafeInteger(r.invocations)||r.invocations<1||
      r.invocations>100000000||
      (r.mean_execution_ms!==null&&(!Number.isFinite(r.mean_execution_ms)||
        r.mean_execution_ms<0||r.mean_execution_ms>600000))||
      (r.p95_execution_ms!==null&&(!Number.isFinite(r.p95_execution_ms)||
        r.p95_execution_ms<0||r.p95_execution_ms>600000))){
      fail("USAGE_INVALID_AGGREGATE_ROW");
    }
    const key=r.pathname+"|"+r.method+"|"+r.status;
    if(seen.has(key))fail("USAGE_DUPLICATE_AGGREGATE_GROUP");
    seen.add(key);
  }
  return input;
}
function classify(pathname,method,status){
  const route=pathname.slice(PREFIX.length);
  if(method==="OPTIONS")return "options";
  if(Object.hasOwn(ROUTES,route)){
    if(method==="GET"&&status===402)return "paid_402_challenges";
    if(method==="GET"&&status===200)return "paid_200_unverified";
    return "paid_other";
  }
  if(DISCOVERY.has(route)&&method==="GET"&&status===200)return "discovery_200";
  return "other";
}
function analyzeUsage(input){
  const snapshot=validateAggregates(input);
  const stats={
    observed_invocations:0,non_options_potentially_billable:0,options:0,
    paid_402_challenges:0,paid_200_unverified:0,paid_other:0,
    discovery_200:0,other:0,http_5xx_all_routes:0
  };
  const canonical=Object.entries(ROUTES).map(([route,id])=>({
    route,id,invocations:0,unpaid_402_challenges:0,
    paid_200_unverified:0,other_responses:0,options:0
  }));
  const byRoute=new Map(canonical.map(r=>[r.route,r]));
  for(const row of snapshot.rows){
    const count=row.invocations;
    const category=classify(row.pathname,row.method,row.status);
    stats.observed_invocations+=count;
    stats[category]+=count;
    if(category!=="options")stats.non_options_potentially_billable+=count;
    if(row.status>=500)stats.http_5xx_all_routes+=count;
    const r=byRoute.get(row.pathname.slice(PREFIX.length));
    if(r){
      r.invocations+=count;
      if(category==="options")r.options+=count;
      else if(category==="paid_402_challenges")r.unpaid_402_challenges+=count;
      else if(category==="paid_200_unverified")r.paid_200_unverified+=count;
      else r.other_responses+=count;
    }
  }
  if(stats.observed_invocations!==stats.options+stats.non_options_potentially_billable||
    stats.observed_invocations!==stats.options+stats.paid_402_challenges+
      stats.paid_200_unverified+stats.paid_other+stats.discovery_200+stats.other){
    fail("USAGE_CLASSIFICATION_INVARIANT");
  }
  return {
    schema_version:1,
    report_type:"read_only_bounded_log_observation_not_invoice",
    function_slug:snapshot.function_slug,
    observation_window:{start:snapshot.window_start,end:snapshot.window_end},
    log_coverage:"observed_function_edge_logs_not_guaranteed_complete",
    provider_invocation_rules:{
      status_codes_402_also_count_as_invocations:true,
      options_excluded_from_published_billing:true,
      published_over_quota_usd_per_million:"2.00",
      actual_organization_quota_consumption_verified:false
    },
    totals:stats,canonical_paid_routes:canonical,
    paid_routes_total_invocations:canonical.reduce((sum,r)=>sum+r.invocations,0),
    paid_200_responses_are_verified_settlements:false,
    actual_billed_invocations:null,
    actual_hosting_charge_usd:null,
    incremental_hosting_cost_per_confirmed_sale_usd:null,
    variable_source_retry_refund_cost_usd:null,
    confirmed_external_buyers:null,
    confirmed_external_revenue_usd:null,
    confirmed_profit_usd:null,
    product_025_unlock_evidence:false,
    automatic_price_changes:false
  };
}
function readPrivateAggregates(filename){
  if(typeof filename!=="string"||!path.isAbsolute(filename))fail("USAGE_ABSOLUTE_INPUT_REQUIRED");
  const name=path.resolve(filename);
  if(name===ROOT||name.startsWith(ROOT+path.sep))fail("USAGE_PRIVATE_INPUT_IN_REPO");
  const parent=path.dirname(name);
  if(!fs.existsSync(parent))fail("USAGE_INPUT_DIRECTORY_MISSING");
  const dir=fs.lstatSync(parent);
  if(!dir.isDirectory()||dir.isSymbolicLink()||
    (dir.mode&0o077)!==0||fs.realpathSync(parent)!==parent){
    fail("USAGE_INPUT_DIRECTORY_UNSAFE");
  }
  let fd;
  try{fd=fs.openSync(name,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));}
  catch{fail("USAGE_INPUT_FILE_UNAVAILABLE");}
  let body;
  try{
    const stat=fs.fstatSync(fd);
    if(!stat.isFile()||stat.nlink!==1||(stat.mode&0o077)!==0||
       stat.size>131072)fail("USAGE_INPUT_FILE_UNSAFE");
    body=fs.readFileSync(fd,"utf8");
  }finally{fs.closeSync(fd);}
  let value;
  try{value=JSON.parse(body);}catch{fail("USAGE_INPUT_INVALID_JSON");}
  return validateAggregates(value);
}
function main(args=process.argv.slice(2)){
  if(args.length!==1)fail("USAGE_ONE_PRIVATE_JSON_INPUT_REQUIRED");
  process.stdout.write(JSON.stringify(analyzeUsage(readPrivateAggregates(args[0])),null,2)+"\n");
}
if(require.main===module){
  try{main();}catch(error){
    const code=/^USAGE_[A-Z0-9_]+$/.test(error?.code||"")?
      error.code:"USAGE_UNVERIFIED";
    process.stderr.write(code+"\n");process.exitCode=1;
  }
}
module.exports={PREFIX,ROUTES,DISCOVERY,validateAggregates,
  classify,analyzeUsage,readPrivateAggregates,main};
