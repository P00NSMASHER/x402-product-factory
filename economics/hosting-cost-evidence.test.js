"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const {PREFIX}=require("./supabase-usage-readiness");
const cost=require("./hosting-cost-evidence");
const {PROJECT,FUNCTION,INVOICE_SOURCE}=cost;
function usage(){return {schema_version:1,source:"function_edge_logs_aggregated",
  function_slug:FUNCTION,window_start:"2026-10-10T12:00:00Z",
  window_end:"2026-10-11T12:00:00Z",coverage:"observed_log_rows_not_invoice",
  rows:[
    {pathname:PREFIX+"/api/domain-rdap",method:"GET",status:402,
      invocations:4,mean_execution_ms:98,p95_execution_ms:120},
    {pathname:PREFIX+"/api/sec-filings",method:"GET",status:402,
      invocations:2,mean_execution_ms:90,p95_execution_ms:100},
    {pathname:PREFIX+"/api/sec-filings",method:"GET",status:200,
      invocations:1,mean_execution_ms:130,p95_execution_ms:130},
    {pathname:PREFIX+"/api/domain-rdap",method:"OPTIONS",status:204,
      invocations:3,mean_execution_ms:10,p95_execution_ms:10},
    {pathname:PREFIX+"/.well-known/x402",method:"GET",status:200,
      invocations:2,mean_execution_ms:70,p95_execution_ms:80},
    {pathname:PREFIX+"/an-unknown-path",method:"GET",status:404,
      invocations:1,mean_execution_ms:8,p95_execution_ms:8}
  ]};}
function invoice(){return {schema_version:1,source:INVOICE_SOURCE,
  project_ref:PROJECT,function_slug:FUNCTION,
  billing_period_start:"2026-10-01T00:00:00Z",
  billing_period_end:"2026-11-01T00:00:00Z",
  invoice_reference:"opaque_invoice_10001",
  organization_invocations_reported:100,
  organization_function_invocation_charge_usd:"2.000000",
  invoice_authenticity:"operator_supplied_not_verified"};}
function tmp(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"factory-hosting-cost-"));
  fs.chmodSync(dir,0o700);
  const u=path.join(dir,"usage.json"),b=path.join(dir,"invoice.json");
  fs.writeFileSync(u,JSON.stringify(usage()),{mode:0o600});
  fs.writeFileSync(b,JSON.stringify(invoice()),{mode:0o600});
  try {fn({dir,u,b});}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test("402/discovery count toward observed invocation exposure but not sales",()=>{
  const r=cost.analyzeHostingEvidence(usage());
  assert.equal(r.observed.function_invocations,13);
  assert.equal(r.observed.potentially_billable_non_options_invocations,10);
  assert.equal(r.observed.options_not_billed_under_published_rules,3);
  assert.equal(r.observed.paid_402_challenges,6);
  assert.equal(r.observed.paid_http_200_unverified,1);
  assert.equal(r.observed.public_discovery_http_200,2);
  assert.equal(r.proven_sales_count,null);
  assert.equal(r.invoice.supplied,false);
  assert.equal(r.invoice.actual_x402_function_charge_usd,null);
  assert.equal(r.actual_invoice_cost_per_confirmed_sale_usd,null);
  assert.equal(r.actual_net_margin_percent,null);
  assert.equal(r.unattended_product_launch_authorized,false);
  assert.equal(r.product_025_unlock_evidence,false);
});
test("five canonical tools are separate from numbered factory products",()=>{
  const r=cost.analyzeHostingEvidence(usage());
  assert.equal(r.canonical_supabase_routes.length,5);
  assert.equal(r.canonical_supabase_routes.reduce(
    (sum,x)=>sum+x.observed_non_options_invocations_not_sales,0),7);
  const d=r.canonical_supabase_routes.find(x=>x.tool_id==="domain-rdap");
  assert.equal(d.observed_non_options_invocations_not_sales,4);
  const s=r.canonical_supabase_routes.find(x=>x.tool_id==="sec-filings");
  assert.equal(s.observed_http_200_unverified,1);
  assert.equal(r.catalog_products_001_024_costs_inferred_from_this_function,false);
  assert.ok(r.canonical_supabase_routes.every(x=>
    x.actual_hosting_cost_per_confirmed_sale_usd===null));
});
test("operator invoice yields illustrative pro-rata but never verified hosting costs",()=>{
  const r=cost.analyzeHostingEvidence(usage(),{invoice:invoice()});
  assert.equal(r.invoice.supplied,true);
  assert.equal(r.invoice.provider_authenticity_verified,false);
  assert.equal(r.invoice.organization_charge_usd_reported,"2.000000");
  assert.equal(r.invoice.hypothetical_pro_rata_observed_function_share_usd,"0.200000");
  assert.equal(r.canonical_supabase_routes.find(x=>x.tool_id==="domain-rdap")
    .hypothetical_pro_rata_invoice_share_usd,"0.080000");
  assert.equal(r.canonical_supabase_routes.find(x=>x.tool_id==="sec-filings")
    .hypothetical_pro_rata_invoice_share_usd,"0.060000");
  assert.equal(r.invoice.actual_x402_function_charge_usd,null);
  assert.equal(r.actual_net_margin_percent,null);
  assert.equal(JSON.stringify(r).includes("opaque_invoice_10001"),false);
  assert.equal(JSON.stringify(r).includes("/an-unknown-path"),false);
});
test("zero invoice amount never establishes zero per-sale marginal cost",()=>{
  const i=invoice();i.organization_function_invocation_charge_usd="0.000000";
  const r=cost.analyzeHostingEvidence(usage(),{invoice:i});
  assert.equal(r.invoice.organization_charge_usd_reported,"0.000000");
  assert.equal(r.invoice.actual_x402_function_charge_usd,null);
  assert.equal(r.evidence_status,"blocked_for_real_unit_economics");
});
test("integer micro-dollar allocation uses floor and rejects invalid quantities",()=>{
  assert.equal(cost.allocateFloor(1n,1,3),0n);
  assert.equal(cost.allocateFloor(10n,2,3),6n);
  assert.equal(cost.allocateFloor(10n,3,3),10n);
  for(const a of [[-1n,1,2],[1n,3,2],[1n,1,0],[1,1,2],[2n,-1,2]]){
    assert.throws(()=>cost.allocateFloor(...a),/HOSTING_ALLOCATION_INPUT_INVALID/);
  }
});
test("invoice period and organization invocation denominator must match scope",()=>{
  const original=invoice();
  assert.equal(cost.validateInvoice(original,usage()).organizationInvocations,100);
  for(const mutation of [
    d=>{d.billing_period_end="2026-10-11T11:59:59Z";},
    d=>{d.billing_period_start="2026-10-11T12:00:01Z";},
    d=>{d.organization_invocations_reported=9;},
    d=>{d.invoice_authenticity="independently_verified";},
    d=>{d.project_ref="wrong-project";},
    d=>{d.source="provider_authenticated";},
    d=>{d.extra_key="fraudulent_release_approval";}
  ]){
    const bad=JSON.parse(JSON.stringify(original));mutation(bad);
    assert.throws(()=>cost.validateInvoice(bad,usage()),/^Error: HOSTING_/);
  }
});
test("invalid money format, precision and numeric coercion fail closed",()=>{
  for(const v of ["-1.00","0.0000001","1e-2","NaN",1.2,null," 0.20"]){
    const bad=invoice();bad.organization_function_invocation_charge_usd=v;
    assert.throws(()=>cost.validateInvoice(bad,usage()),
      /HOSTING_INVOICE_AMOUNT_INVALID/);
  }
});
test("plan metadata does not confer actual billing authority",()=>{
  for(const name of ["free","pro","team","enterprise","unknown"]){
    const c={schema_version:1,project_ref:PROJECT,function_slug:FUNCTION,
      organization_plan:name,
      plan_observation:"operator_observed_connected_supabase_metadata"};
    const r=cost.analyzeHostingEvidence(usage(),{context:c});
    assert.equal(r.organization_plan_reported,name);
    assert.equal(r.organization_plan_independently_reverified_by_this_program,false);
  }
  assert.throws(()=>cost.validateContext({organization_plan:"free"}),
    /HOSTING_CONTEXT_INVALID/);
});
test("private invoice file rejects public permissions and symlink aliases",()=>{
  tmp(({dir,b})=>{
    assert.deepEqual(cost.readPrivateInvoice(b),invoice());
    fs.chmodSync(b,0o644);
    assert.throws(()=>cost.readPrivateInvoice(b),/HOSTING_INVOICE_FILE_UNSAFE/);
    fs.chmodSync(b,0o600);
    const alias=path.join(dir,"alias.json");fs.symlinkSync(b,alias);
    assert.throws(()=>cost.readPrivateInvoice(alias),/HOSTING_INVOICE_FILE_UNAVAILABLE/);
    fs.unlinkSync(alias);
    assert.throws(()=>cost.readPrivateInvoice("invoice.json"),
      /HOSTING_INVOICE_ABSOLUTE_PATH_REQUIRED/);
    assert.throws(()=>cost.readPrivateInvoice(path.join(__dirname,"hosting-cost-evidence.js")),
      /HOSTING_INVOICE_IN_REPOSITORY/);
  });
});
test("read-only CLI with/without private invoice never leaks source paths or writes",()=>{
  tmp(({dir,u,b})=>{
    const script=path.join(__dirname,"hosting-cost-evidence.js");
    const original=[u,b].map(p=>fs.readFileSync(p,"utf8"));
    const one=spawnSync(process.execPath,[script,u],{encoding:"utf8"});
    assert.equal(one.status,0,one.stderr);
    assert.equal(JSON.parse(one.stdout).invoice.supplied,false);
    const two=spawnSync(process.execPath,[script,u,b],{encoding:"utf8"});
    assert.equal(two.status,0,two.stderr);
    const output=JSON.parse(two.stdout);
    assert.equal(output.invoice.organization_charge_usd_reported,"2.000000");
    assert.equal(output.product_025_unlock_evidence,false);
    assert.equal(output.invoice.actual_x402_function_charge_usd,null);
    assert.equal(two.stdout.includes(b),false);
    assert.equal(two.stdout.includes("opaque_invoice_10001"),false);
    assert.deepEqual([u,b].map(p=>fs.readFileSync(p,"utf8")),original);
    const invalid=spawnSync(process.execPath,[script,u,"missing.json"],{encoding:"utf8"});
    assert.notEqual(invalid.status,0);
    assert.equal(invalid.stdout,"");
    assert.equal(invalid.stderr.includes(dir),false);
  });
});
