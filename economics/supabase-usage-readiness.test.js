"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const {
  PREFIX,ROUTES,validateAggregates,classify,
  analyzeUsage,readPrivateAggregates,modelConditionalHostingOverage
}=require("./supabase-usage-readiness");

function sample(){
  return {
    schema_version:1,source:"function_edge_logs_aggregated",
    function_slug:"x402-data-tools",
    window_start:"2026-10-09T21:00:00Z",
    window_end:"2026-10-10T21:00:00Z",
    coverage:"observed_log_rows_not_invoice",
    rows:[
      {pathname:PREFIX+"/api/ofac-sdn-screen",method:"GET",status:402,
       invocations:5,mean_execution_ms:75.5,p95_execution_ms:120.4},
      {pathname:PREFIX+"/api/sec-filings",method:"GET",status:200,
       invocations:2,mean_execution_ms:110,p95_execution_ms:170},
      {pathname:PREFIX+"/api/domain-rdap",method:"OPTIONS",status:204,
       invocations:3,mean_execution_ms:30,p95_execution_ms:40},
      {pathname:PREFIX+"/.well-known/x402",method:"GET",status:200,
       invocations:2,mean_execution_ms:12,p95_execution_ms:20},
      {pathname:PREFIX+"/openapi.json",method:"GET",status:200,
       invocations:1,mean_execution_ms:null,p95_execution_ms:null},
      {pathname:PREFIX+"/.well-known/unknown",method:"GET",status:404,
       invocations:1,mean_execution_ms:150,p95_execution_ms:170},
      {pathname:PREFIX+"/api/treasury-average-rates",method:"GET",status:503,
       invocations:1,mean_execution_ms:93,p95_execution_ms:120},
      {pathname:PREFIX+"/api/us-address-geocode",method:"POST",status:405,
       invocations:1,mean_execution_ms:27,p95_execution_ms:34}
    ]
  };
}
function mutate(mutator){
  const x=sample();mutator(x);
  assert.throws(()=>validateAggregates(x),/^Error: USAGE_/);
}
async function withPrivateFile(callback){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"x402-safe-usage-"));
  const filename=path.join(dir,"aggregates.json");
  fs.writeFileSync(filename,JSON.stringify(sample()),{mode:0o600});
  try{await callback({dir,filename});}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test("synthetic sample is clearly partial and contains five canonical paid routes",()=>{
  const report=analyzeUsage(sample());
  assert.equal(report.report_type,"read_only_bounded_log_observation_not_invoice");
  assert.equal(report.totals.observed_invocations,16);
  assert.equal(report.totals.options,3);
  assert.equal(report.totals.non_options_potentially_billable,13);
  assert.equal(report.totals.paid_402_challenges,5);
  assert.equal(report.totals.paid_200_unverified,2);
  assert.equal(report.totals.paid_other,2);
  assert.equal(report.totals.discovery_200,3);
  assert.equal(report.totals.other,1);
  assert.equal(report.totals.http_5xx_all_routes,1);
  assert.equal(report.canonical_paid_routes.length,5);
  assert.deepEqual(Object.values(ROUTES).sort(),
    ["domain-rdap","ofac-sdn-screen","sec-filings",
     "treasury-average-rates","us-address-geocode"]);
  assert.equal(report.paid_routes_total_invocations,12);
  assert.deepEqual(report.canonical_paid_routes.find(x=>x.id==="domain-rdap"),{
    route:"/api/domain-rdap",id:"domain-rdap",invocations:3,
    unpaid_402_challenges:0,paid_200_unverified:0,other_responses:0,options:3
  });
});
test("HTTP 200 is never promoted to settled revenue or external buyers",()=>{
  const report=analyzeUsage(sample());
  assert.equal(report.totals.paid_200_unverified,2);
  assert.equal(report.paid_200_responses_are_verified_settlements,false);
  assert.equal(report.actual_billed_invocations,null);
  assert.equal(report.actual_hosting_charge_usd,null);
  assert.equal(report.incremental_hosting_cost_per_confirmed_sale_usd,null);
  assert.equal(report.variable_source_retry_refund_cost_usd,null);
  assert.equal(report.confirmed_external_buyers,null);
  assert.equal(report.confirmed_external_revenue_usd,null);
  assert.equal(report.confirmed_profit_usd,null);
  assert.equal(report.product_025_unlock_evidence,false);
  assert.equal(report.automatic_price_changes,false);
  assert.equal(report.provider_invocation_rules.status_codes_402_also_count_as_invocations,true);
  assert.equal(report.provider_invocation_rules.options_excluded_from_published_billing,true);
  assert.equal(report.provider_invocation_rules.actual_organization_quota_consumption_verified,false);
});
test("unknown paths never appear in output, even if source includes them",()=>{
  const data=sample();
  data.rows.find(x=>x.status===404).pathname=PREFIX+"/secret-internal-name";
  const report=analyzeUsage(data);
  assert.equal(report.totals.other,1);
  assert.equal(JSON.stringify(report).includes("secret-internal-name"),false);
  assert.ok(!Object.hasOwn(report,"p95_ms"));
  assert.ok(!Object.hasOwn(report,"avg_execution_ms"));
});
test("all five routes are reported when no log events exist",()=>{
  const data=sample();data.rows=[];
  const report=analyzeUsage(data);
  assert.equal(report.canonical_paid_routes.length,5);
  assert.ok(report.canonical_paid_routes.every(x=>x.invocations===0));
  assert.equal(report.totals.observed_invocations,0);
  assert.equal(report.confirmed_external_buyers,null);
  assert.equal(report.actual_hosting_charge_usd,null);
});
test("same route can have OPTIONS and GET; 402 remains separately classified",()=>{
  assert.equal(classify(PREFIX+"/api/domain-rdap","GET",402),"paid_402_challenges");
  assert.equal(classify(PREFIX+"/api/domain-rdap","GET",200),"paid_200_unverified");
  assert.equal(classify(PREFIX+"/api/domain-rdap","OPTIONS",204),"options");
  assert.equal(classify(PREFIX+"/api/domain-rdap","GET",500),"paid_other");
  assert.equal(classify(PREFIX+"/.well-known/x402","GET",200),"discovery_200");
  assert.equal(classify(PREFIX+"/.well-known/x402","GET",500),"other");
});
test("rejects wrong source, bad scope, unsupported coverage and excess window",()=>{
  mutate(x=>x.source="function_logs");
  mutate(x=>x.function_slug="someone-else");
  mutate(x=>x.coverage="official_invoice");
  mutate(x=>x.window_start="2026-10-08T20:59:59Z");
  mutate(x=>x.window_end=x.window_start);
  mutate(x=>x.window_end="not-a-time");
  mutate(x=>x.schema_version=2);
  mutate(x=>x.rows=Array(251).fill(x.rows[0]));
  mutate(x=>x.headers={"authorization":"injected"});
});
test("rejects raw PII, query strings, duplicate groups, invalid counts",()=>{
  mutate(x=>x.rows[0].request_headers={cookie:"secret"});
  mutate(x=>x.rows[0].pathname+="?email=person@example.com");
  mutate(x=>x.rows[0].pathname="https://example.invalid/foo");
  mutate(x=>x.rows[0].pathname="/functions/v1/other-function/path");
  mutate(x=>x.rows[0].pathname=PREFIX+"/../other");
  mutate(x=>x.rows[0].pathname=PREFIX+"/user@email");
  mutate(x=>x.rows[0].status=900);
  mutate(x=>x.rows[0].invocations=0);
  mutate(x=>x.rows[0].invocations=1.5);
  mutate(x=>x.rows.push({...x.rows[0]}));
  mutate(x=>x.rows[0].mean_execution_ms=Infinity);
  mutate(x=>x.rows[0].p95_execution_ms="88");
});
test("raw aggregate input is owner-only and outside repository",async()=>{
  await withPrivateFile(async({dir,filename})=>{
    assert.equal(readPrivateAggregates(filename).rows.length,8);
    fs.chmodSync(filename,0o644);
    assert.throws(()=>readPrivateAggregates(filename),/USAGE_INPUT_FILE_UNSAFE/);
    fs.chmodSync(filename,0o600);
    const link=path.join(dir,"link.json");
    fs.symlinkSync(filename,link);
    assert.throws(()=>readPrivateAggregates(link),/USAGE_INPUT_FILE_UNAVAILABLE/);
    fs.unlinkSync(link);
    fs.chmodSync(dir,0o755);
    assert.throws(()=>readPrivateAggregates(filename),/USAGE_INPUT_DIRECTORY_UNSAFE/);
    fs.chmodSync(dir,0o700);
    assert.throws(()=>readPrivateAggregates("relative.json"),/USAGE_ABSOLUTE_INPUT_REQUIRED/);
    assert.throws(()=>readPrivateAggregates(path.join(__dirname,"supabase-usage-readiness.js")),
      /USAGE_PRIVATE_INPUT_IN_REPO/);
  });
});
test("rejects linked files, nonjson input and missing private file",async()=>{
  await withPrivateFile(async({dir,filename})=>{
    const other=path.join(dir,"hardlink.json");
    fs.linkSync(filename,other);
    assert.throws(()=>readPrivateAggregates(filename),/USAGE_INPUT_FILE_UNSAFE/);
    fs.unlinkSync(other);
    fs.writeFileSync(filename,"{malformed");
    assert.throws(()=>readPrivateAggregates(filename),/USAGE_INPUT_INVALID_JSON/);
    assert.throws(()=>readPrivateAggregates(other),/USAGE_INPUT_FILE_UNAVAILABLE/);
  });
});
test("CLI only reads private aggregate data and does not leak raw input",async()=>{
  await withPrivateFile(async({filename})=>{
    const script=path.join(__dirname,"supabase-usage-readiness.js");
    const cmd=spawnSync(process.execPath,[script,filename],{encoding:"utf8"});
    assert.equal(cmd.status,0,cmd.stderr);
    const report=JSON.parse(cmd.stdout);
    assert.equal(report.totals.observed_invocations,16);
    assert.equal(report.product_025_unlock_evidence,false);
    assert.equal(cmd.stderr,"");
    assert.equal(cmd.stdout.includes(filename),false);
    const invalid=spawnSync(process.execPath,[script],{encoding:"utf8"});
    assert.notEqual(invalid.status,0);
    assert.equal(invalid.stdout,"");
    assert.match(invalid.stderr,/USAGE_ONE_PRIVATE_JSON_INPUT_REQUIRED/);
  });
});
test("observed request mix exposes missing hosting bills rather than invented per-sale charges",()=>{
  const report=analyzeUsage(sample());
  const readiness=report.hosting_cost_readiness;
  assert.equal(readiness.report_type,
    "observed_invocation_exposure_not_measured_hosting_cost");
  assert.equal(readiness.scope,
    "canonical_supabase_x402_data_tools_only_not_factory_products_003_to_024");
  assert.equal(readiness.observed_non_options_invocations,13);
  assert.equal(readiness.observed_402_challenges_still_consume_invocation_quota,true);
  assert.equal(readiness.application_http_200_is_not_verified_sale,true);
  assert.equal(readiness.organization_all_projects_billing_usage_verified,false);
  assert.equal(readiness.organization_plan_quota_and_spend_cap_verified,false);
  assert.equal(readiness.billing_cycle_invoice_and_package_charges_verified,false);
  assert.equal(readiness.actual_function_billed_invocations,null);
  assert.equal(readiness.actual_organization_overage_charge_usd,null);
  assert.equal(readiness.actual_incremental_hosting_cost_per_paid_sale_usd,null);
  assert.equal(readiness.actual_source_provider_cost_per_paid_sale_usd,null);
  assert.equal(readiness.actual_retry_refund_maintenance_cost_per_sale_usd,null);
  assert.equal(readiness.full_unit_economics_verified,false);
  assert.equal(readiness.actual_profit_usd,null);
  assert.equal(readiness.automatic_pricing_or_release_authorized,false);
  assert.equal(readiness.missing_evidence.length,5);
  assert.equal(report.provider_invocation_rules.over_quota_billing_packages_of_invocations,1000000);
  assert.equal(report.provider_invocation_rules.partial_package_rounds_up_when_paid_overage_applies,true);
  assert.equal(report.product_025_unlock_evidence,false);
});

test("404, discovery, and 402 count toward observed non-OPTIONS exposure without sales",()=>{
  const input=sample();
  const before=analyzeUsage(input);
  assert.equal(before.totals.non_options_potentially_billable,13);
  input.rows[0].status=404;
  const after=analyzeUsage(input);
  assert.equal(after.totals.paid_402_challenges,0);
  assert.equal(after.totals.non_options_potentially_billable,13);
  assert.equal(after.hosting_cost_readiness.observed_non_options_invocations,13);
  assert.equal(after.confirmed_external_buyers,null);
  assert.equal(after.confirmed_profit_usd,null);
  assert.equal(after.hosting_cost_readiness.actual_profit_usd,null);
});

test("published organization package model is only hypothetical, not invoice evidence",()=>{
  const report=modelConditionalHostingOverage({
    organization_prior_non_options_invocations:500000,
    added_non_options_invocations:13,
    organization_included_quota_invocations:500000
  });
  assert.equal(report.report_type,
    "hypothetical_organization_package_pricing_not_invoice");
  assert.equal(report.published_package_invocations,1000000);
  assert.equal(report.provider_package_price_usd,"2.00");
  assert.equal(report.over_quota_packages_before,0);
  assert.equal(report.over_quota_packages_after,1);
  assert.equal(report.conditional_incremental_packages,1);
  assert.equal(report.conditional_package_step_usd,"2.00");
  assert.equal(report.actual_hosting_cost_usd,null);
  assert.equal(report.actual_per_sale_hosting_cost_usd,null);
  assert.equal(report.actual_organization_invoice_verified,false);
  assert.equal(report.function_share_of_organization_bill_verified,false);
  assert.equal(report.independent_external_sales_verified,false);
  assert.equal(report.product_025_unlock_evidence,false);
});

test("package billing follows organization-wide whole-package ceilings at boundaries",()=>{
  const scenarios=[
    [0,13,500000,0,0,0,"0.00"],
    [499999,1,500000,0,0,0,"0.00"],
    [500000,1,500000,0,1,1,"2.00"],
    [1499999,1,500000,1,1,0,"0.00"],
    [1500000,1,500000,1,2,1,"2.00"],
    [500000,1000001,500000,0,2,2,"4.00"],
    [500000,0,500000,0,0,0,"0.00"]
  ];
  for(const [prior,added,quota,before,after,delta,price] of scenarios){
    const report=modelConditionalHostingOverage({
      organization_prior_non_options_invocations:prior,
      added_non_options_invocations:added,
      organization_included_quota_invocations:quota
    });
    assert.equal(report.over_quota_packages_before,before);
    assert.equal(report.over_quota_packages_after,after);
    assert.equal(report.conditional_incremental_packages,delta);
    assert.equal(report.conditional_package_step_usd,price);
    assert.equal(report.actual_hosting_cost_usd,null);
  }
});

test("host cost scenario rejects missing, negative, fractional, coerced and unsafe counts",()=>{
  const good={
    organization_prior_non_options_invocations:1,
    added_non_options_invocations:1,
    organization_included_quota_invocations:500000
  };
  for(const [field,value] of [
    ["organization_prior_non_options_invocations",-1],
    ["organization_prior_non_options_invocations","500000"],
    ["organization_prior_non_options_invocations",1.1],
    ["organization_prior_non_options_invocations",NaN],
    ["added_non_options_invocations",undefined],
    ["added_non_options_invocations",Number.MAX_SAFE_INTEGER],
    ["organization_included_quota_invocations",null],
    ["organization_included_quota_invocations",-12]
  ]){
    assert.throws(()=>modelConditionalHostingOverage({...good,[field]:value}),
      /USAGE_INVALID_ORGANIZATION_SCENARIO/);
  }
  assert.throws(()=>modelConditionalHostingOverage(),
    /USAGE_INVALID_ORGANIZATION_SCENARIO/);
});

test("CLI private usage report never treats package model as verified invoice",async()=>{
  await withPrivateFile(async({filename})=>{
    const script=path.join(__dirname,"supabase-usage-readiness.js");
    const run=spawnSync(process.execPath,[script,filename],{encoding:"utf8"});
    assert.equal(run.status,0,run.stderr);
    const report=JSON.parse(run.stdout);
    assert.equal(report.hosting_cost_readiness.observed_non_options_invocations,13);
    assert.equal(report.hosting_cost_readiness.actual_organization_overage_charge_usd,null);
    assert.equal(report.hosting_cost_readiness.actual_incremental_hosting_cost_per_paid_sale_usd,null);
    assert.equal(report.hosting_cost_readiness.full_unit_economics_verified,false);
    assert.equal(report.hosting_cost_readiness.automatic_pricing_or_release_authorized,false);
    assert.equal(report.confirmed_external_revenue_usd,null);
    assert.equal(report.product_025_unlock_evidence,false);
    assert.equal(run.stdout.includes(filename),false);
  });
});
test("hypothetical package inputs refuse invoice assertions and unknown fields",()=>{
  const caseData={
    organization_prior_non_options_invocations:500000,
    added_non_options_invocations:10,
    organization_included_quota_invocations:500000
  };
  const disallowed=[
    {actual_invoice_verified:true},
    {verified_external_buyers:12},
    {approved_revenue_usd:"50.00"},
    {organization_overage_plan:"paid"}
  ];
  for(const fields of disallowed) {
    assert.throws(()=>modelConditionalHostingOverage({...caseData,...fields}),
      /USAGE_INVALID_ORGANIZATION_SCENARIO/);
  }
  assert.throws(()=>modelConditionalHostingOverage({
    ...caseData,
    added_non_options_invocations:Number.MAX_SAFE_INTEGER
  }),/USAGE_INVALID_ORGANIZATION_SCENARIO/);
  assert.equal(modelConditionalHostingOverage(caseData)
    .actual_organization_invoice_verified,false);
  assert.equal(modelConditionalHostingOverage(caseData)
    .actual_hosting_cost_usd,null);
});

