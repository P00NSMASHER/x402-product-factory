"use strict";

// Private aggregate-log analysis. A paid API 200 does NOT prove settlement,
// external demand, or profitability. No raw URLs, headers, IPs or wallet data.
const fs=require("node:fs");
const path=require("node:path");
const ROOT=path.resolve(__dirname,"..");
const PREFIX="/functions/v1/x402-data-tools";
const BILLING_PACKAGE_INVOCATIONS=1000000n;
const BILLING_PACKAGE_PRICE_MICROUSD=2000000n; // $2 / 1 million, package billed
const MAX_ORG_INVOCATIONS=Number.MAX_SAFE_INTEGER;
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
// Conditional Supabase invoice-package sensitivity at the *organization*
// grain. No Edge Function log can supply prior organization-wide billed usage,
// contractual quota, spend-cap status, invoice, or cost attribution. The
// inputs are hypothetical assumptions, never proof of actual charges.
function modelConditionalHostingOverage({
  organization_prior_non_options_invocations,
  added_non_options_invocations,
  organization_included_quota_invocations
}={}) {
  const vals=[
    organization_prior_non_options_invocations,
    added_non_options_invocations,
    organization_included_quota_invocations
  ];
  if(vals.some(x=>!Number.isSafeInteger(x)||x<0||x>MAX_ORG_INVOCATIONS) ||
     organization_prior_non_options_invocations+added_non_options_invocations>
       Number.MAX_SAFE_INTEGER) {
    fail("USAGE_INVALID_ORGANIZATION_SCENARIO");
  }
  const prior=BigInt(organization_prior_non_options_invocations);
  const after=prior+BigInt(added_non_options_invocations);
  const quota=BigInt(organization_included_quota_invocations);
  function packages(total) {
    const over=total>quota?total-quota:0n;
    return (over+BILLING_PACKAGE_INVOCATIONS-1n)/BILLING_PACKAGE_INVOCATIONS;
  }
  const beforePackages=packages(prior);
  const afterPackages=packages(after);
  const addedPackages=afterPackages-beforePackages;
  return {
    report_type:"hypothetical_organization_package_pricing_not_invoice",
    provider_package_price_usd:"2.00",
    published_package_invocations:Number(BILLING_PACKAGE_INVOCATIONS),
    organization_prior_invocations_assumed:organization_prior_non_options_invocations,
    additional_invocations_assumed:added_non_options_invocations,
    organization_quota_invocations_assumed:organization_included_quota_invocations,
    over_quota_packages_before:Number(beforePackages),
    over_quota_packages_after:Number(afterPackages),
    conditional_incremental_packages:Number(addedPackages),
    conditional_package_step_usd:(addedPackages*BILLING_PACKAGE_PRICE_MICROUSD/
      1000000n).toString()+".00",
    only_valid_for_hypothetical_paid_overage_enabled_plan:true,
    actual_organization_invoice_verified:false,
    function_share_of_organization_bill_verified:false,
    actual_hosting_cost_usd:null,
    actual_per_sale_hosting_cost_usd:null,
    independent_external_sales_verified:false,
    product_025_unlock_evidence:false
  };
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
      over_quota_billing_packages_of_invocations:1000000,
      partial_package_rounds_up_when_paid_overage_applies:true,
      actual_organization_quota_consumption_verified:false
    },
    hosting_cost_readiness:{
      report_type:"observed_invocation_exposure_not_measured_hosting_cost",
      scope:"canonical_supabase_x402_data_tools_only_not_factory_products_003_to_024",
      observed_non_options_invocations:stats.non_options_potentially_billable,
      observed_402_challenges_still_consume_invocation_quota:true,
      application_http_200_is_not_verified_sale:true,
      organization_all_projects_billing_usage_verified:false,
      billing_cycle_invoice_and_package_charges_verified:false,
      organization_plan_quota_and_spend_cap_verified:false,
      function_cost_allocation_policy_verified:false,
      confirmed_external_paid_sale_denominator_verified:false,
      actual_function_billed_invocations:null,
      actual_organization_overage_charge_usd:null,
      actual_incremental_hosting_cost_per_paid_sale_usd:null,
      actual_source_provider_cost_per_paid_sale_usd:null,
      actual_retry_refund_maintenance_cost_per_sale_usd:null,
      full_unit_economics_verified:false,
      actual_profit_usd:null,
      model_available:"modelConditionalHostingOverage",
      missing_evidence:[
        "organization_wide_all_projects_usage_for_complete_billing_cycle",
        "actual_plan_quota_spend_cap_and_invocation_invoice",
        "documented_function_cost_allocation_and_billing_attribution",
        "source_provider_invoices_and_retry_refund_operating_costs",
        "independently_corroborated_paid_sales_and_external_buyer_provenance"
      ],
      automatic_pricing_or_release_authorized:false
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
module.exports={
  PREFIX,ROUTES,DISCOVERY,BILLING_PACKAGE_INVOCATIONS,
  modelConditionalHostingOverage,validateAggregates,
  classify,analyzeUsage,readPrivateAggregates,main
};
