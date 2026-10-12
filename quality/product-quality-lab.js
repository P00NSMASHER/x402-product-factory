"use strict";

// Read-only, deterministic product-improvement evidence ledger.
// Fee-only calculations are historical spec assumptions, NOT cash margin.
const fs=require("node:fs");
const path=require("node:path");
const {loadSpecs}=require("../scripts/generate-spec-artifacts");

const ROOT=path.resolve(__dirname,"..");
const OUT_JSON=path.join(__dirname,"generated","PRODUCT_QUALITY.json");
const OUT_MD=path.join(__dirname,"generated","PRODUCT_QUALITY.md");
const NUMBERS=Object.freeze(Array.from({length:22},(_,i)=>String(i+3).padStart(3,"0")));
const CATEGORIES=Object.freeze(["fee_negative","below_target_fee_only","passes_fee_only_screen"]);
const UNVERIFIED=Object.freeze({
  independent_external_buyer_count:null,
  settled_external_purchase_count:null,
  independently_measured_customer_time_saved:null,
  baseline_error_rate:null,
  measured_decision_accuracy:null,
  observed_source_failure_rate:null,
  actual_hosting_cost_per_sale_usd:null,
  actual_upstream_source_cost_per_sale_usd:null,
  actual_retry_refund_cost_per_sale_usd:null,
  actual_contribution_margin_pct:null
});

function fail(message){
  const error=new Error("QUALITY_GATE: "+message);
  error.code="QUALITY_GATE";
  throw error;
}
function micros(value,decimals){
  if(typeof value!=="string"||!new RegExp("^\\d+\\.\\d{"+decimals+"}$").test(value)){
    fail("invalid fixed-point money");
  }
  const [whole,part]=value.split(".");
  const n=BigInt(whole)*1000000n+BigInt(part.padEnd(6,"0"));
  if(n<0n||n>1000000000000000000n)fail("money amount out of bounds");
  return n;
}
function decimalMoney(n){
  const negative=n<0n;
  const m=negative?-n:n;
  return (negative?"-":"")+(m/1000000n).toString()+"."+(m%1000000n).toString().padStart(6,"0");
}
function feeOnlyScreen(spec){
  const eco=spec?.economics;
  if(!eco||!Number.isInteger(eco.target_contribution_margin_pct)||
      eco.target_contribution_margin_pct<0||eco.target_contribution_margin_pct>100){
    fail("invalid target margin for "+spec?.id);
  }
  const price=micros(eco.price_usdc,3);
  const settlement=micros(eco.paid_settlement_cost_usd,6);
  const source=micros(eco.configured_direct_source_fee_usd,6);
  if(price<=0n)fail("nonpositive product price");
  const hypotheticalNet=price-settlement-source;
  const target=BigInt(eco.target_contribution_margin_pct);
  const computedMargin=Number(hypotheticalNet*1000n/price)/10;
  const passes=hypotheticalNet*100n>=price*target;
  if(eco.post_allowance_margin_floor_pct!==computedMargin||
      eco.meets_target_before_unknown_costs!==passes){
    fail("spec fee-only arithmetic drift for "+spec.id);
  }
  if(eco.incremental_hosting_cost_usd!==null){
    fail("unsupported actual hosting-cost claim for "+spec.id);
  }
  const category=hypotheticalNet<0n?"fee_negative":
    passes?"passes_fee_only_screen":"below_target_fee_only";
  return {
    category,
    registered_price_usdc:eco.price_usdc,
    historically_assumed_paid_settlement_fee_usd:eco.paid_settlement_cost_usd,
    configured_direct_source_fee_usd:eco.configured_direct_source_fee_usd,
    hypothetical_contribution_before_unknown_costs_usd:decimalMoney(hypotheticalNet),
    hypothetical_margin_pct:computedMargin,
    target_fee_only_margin_pct:eco.target_contribution_margin_pct,
    full_unit_margin_pct:null,
    current_facilitator_rate_independently_verified:false
  };
}
function riskFlags(spec){
  const sourceIds=new Set(spec.sources.map(s=>s.id));
  const flags=[];
  if(spec.sources.length>=2)flags.push("multi_source_conflict_benchmark_needed");
  else flags.push("single_source_alternative_value_benchmark_needed");
  if(sourceIds.has("ofac_sdn"))flags.push("name_screening_is_not_sanctions_clearance");
  if(sourceIds.has("sec_edgar"))flags.push("production_sec_user_agent_and_source_review_needed");
  if(sourceIds.has("rdap"))flags.push("domain_metadata_is_not_ownership_proof");
  if(sourceIds.has("census_address"))flags.push("geocoder_mismatch_and_straight_line_limits_need_testing");
  return flags;
}
function improvementTrack(category){
  if(category==="fee_negative")return "repackage_or_retire_standalone_hypothesis";
  if(category==="below_target_fee_only")return "prove_incremental_buyer_value_and_full_cost_fit";
  return "run_buyer_workflow_benchmark_before_any_commercial_claim";
}
function reviewProduct(spec){
  if(!spec||typeof spec!=="object"||!NUMBERS.includes(spec.number)||
      typeof spec.id!=="string"||!Array.isArray(spec.sources)||spec.sources.length===0||
      typeof spec.buyer?.task!=="string"||!Array.isArray(spec.api?.outputs?.decisions)){
    fail("incomplete or out-of-scope product specification");
  }
  const purchase=spec.buyer.expected_purchase_frequency;
  if(purchase?.status!=="unmeasured"||purchase.value!==null||purchase.unit!==null){
    fail("cannot convert unverified purchase frequency into buyer evidence: "+spec.id);
  }
  const economics=feeOnlyScreen(spec);
  return {
    number:spec.number,
    id:spec.id,
    buyer_task_claimed_by_design:spec.buyer.task,
    decision_values:spec.api.outputs.decisions,
    authoritative_source_ids:spec.sources.map(s=>s.id),
    known_source_adapters:spec.sources.map(s=>s.adapter),
    source_count:spec.sources.length,
    specification_release_status:spec.launch.current_status,
    historical_fee_only_economics:economics,
    evidence_not_established:{...UNVERIFIED},
    needed_independent_reviews:[
      "named_buyer_and_real_purchase_trigger",
      "measured_comparator_workflow_or_free_alternative",
      "blind_ground_truth_and_false_proceed_replay",
      "actual_same_period_cost_invoice_and_refund_reconciliation",
      "externally_corroborated_demand_and_repeat_use",
      "human_privacy_integration_and_security_review"
    ],
    product_specific_risks:riskFlags(spec),
    next_design_experiment:improvementTrack(economics.category),
    value_quality_proven:false,
    production_or_pricing_change_authorized:false,
    product_025_unlock_evidence:false
  };
}
function buildReport(specs){
  if(!Array.isArray(specs)||specs.length!==NUMBERS.length){
    fail("must review exactly Products 003–024");
  }
  const sorted=[...specs].sort((a,b)=>a.number.localeCompare(b.number));
  const products=sorted.map((spec,index)=>{
    if(spec.number!==NUMBERS[index])fail("missing/duplicate/out-of-order eligible product "+NUMBERS[index]);
    return reviewProduct(spec);
  });
  const counts=Object.fromEntries(CATEGORIES.map(c=>[c,products.filter(p=>
    p.historical_fee_only_economics.category===c).length]));
  if(Object.values(counts).reduce((a,b)=>a+b,0)!==22)fail("economics classification incomplete");
  return {
    schema_version:1,
    report_type:"design_opportunity_review_not_market_validation",
    catalog_scope:"registered_specifications_003_through_024_only",
    generated_by:"quality/product-quality-lab.js",
    observed_customer_data_in_report:false,
    economic_assumptions_are_current_market_quotes:false,
    commercial_approvals_granted:0,
    independently_verified_external_demand_in_specifications:0,
    independent_real_world_buyer_demand_status:"unmeasured",
    no_synthetic_success_counts_as_sale:true,
    product_025_unlock_evidence:false,
    product_count:products.length,
    fee_only_category_counts:counts,
    products
  };
}
function renderMarkdown(report){
  const counts=report.fee_only_category_counts;
  const lines=[
    "# Product Quality Lab — design improvement backlog",
    "",
    "Generated from the **existing 22 specifications only**. This is NOT independently verified product-market fit, buyer demand, actual profitability, or launch approval.",
    "",
    "## Observable historical fee-only categories",
    "",
    "- Registered prices below the *spec-pinned* paid settlement/source-fee assumptions: **"+counts.fee_negative+"**.",
    "- Positive fee-only amount but below the spec's 70% margin target: **"+counts.below_target_fee_only+"**.",
    "- Mathematically pass the fee-only screen before unknown real costs: **"+counts.passes_fee_only_screen+"**.",
    "",
    "The historical settlement-fee assumptions may be stale. Actual hosting, source-provider billing, retries, refunds, latency, accuracy, buyer identity, repeat purchase, and willingness to pay are **unknown**, not zero.",
    "",
    "## First-order product improvement queue",
    "",
    "1. **Prove buyer utility:** For a multi-source workflow candidate, benchmark a real user's task against direct/free authoritative source lookups; capture time, error and decision-action outcomes using blinded cases.",
    "2. **Make outputs decision-ready:** Design explicit evidence provenance, reason codes, uncertainty, and reviewer next actions without upgrading an identity, name-match or metadata signal into a legal clearance.",
    "3. **Repair product economics:** For the six historically fee-negative standalone tools, test bundling/re-scoping as *hypotheses* rather than changing live price or asserting demand.",
    "4. **Keep review gates separate:** Run adversarial input/failure tests and independent buyer, source, privacy and full invoice review before proposing any commercial release.",
    "",
    "## Product-by-product experiments",
    "",
    "| # | Product | Registered USDC | Historical fee-only margin | Category | Next experiment |",
    "|---|---|---:|---:|---|---|"
  ];
  for(const p of report.products){
    const e=p.historical_fee_only_economics;
    lines.push("| "+p.number+" | "+p.id+" | "+e.registered_price_usdc+
      " | "+e.hypothetical_margin_pct.toFixed(1)+"% | "+
      e.category+" | "+p.next_design_experiment+" |");
  }
  lines.push("","## Hard boundaries","","- No real buyer counts are inferred from fixtures, HTTP 200, web visits, or operator-supplied claims.","- No automatic price adjustment, launch, refund, wallet, payment submission, or Product 025+ generation/unlock.","- None of the 22 products is marked commercially validated by this report.","");
  return lines.join("\n");
}
function serialize(specs=loadSpecs()){
  const report=buildReport(specs);
  return {
    "PRODUCT_QUALITY.json":JSON.stringify(report,null,2)+"\n",
    "PRODUCT_QUALITY.md":renderMarkdown(report)
  };
}
function execute(mode,artifacts=serialize()){
  if(!["check","write"].includes(mode))fail("expected --check or --write");
  const dir=path.dirname(OUT_JSON);
  if(mode==="write")fs.mkdirSync(dir,{recursive:true});
  for(const [filename,content] of Object.entries(artifacts)){
    const target=path.join(dir,filename);
    if(mode==="check"){
      if(!fs.existsSync(target)||fs.readFileSync(target,"utf8")!==content){
        fail("stale generated quality artifact: "+filename);
      }
    }else{
      fs.writeFileSync(target,content,"utf8");
    }
  }
  return {ok:true,mode,products:22,files:Object.keys(artifacts)};
}
if(require.main===module){
  try{
    const args=process.argv.slice(2);
    if(args.length!==1||!["--check","--write"].includes(args[0]))fail("use --check or --write");
    process.stdout.write(JSON.stringify(execute(args[0].slice(2)))+"\n");
  }catch(error){
    // Avoid leaking filenames outside this fixed repository catalog.
    process.stderr.write(String(error.message)+"\n");
    process.exitCode=1;
  }
}
module.exports={micros,decimalMoney,feeOnlyScreen,riskFlags,improvementTrack,reviewProduct,buildReport,renderMarkdown,serialize,execute,NUMBERS,UNVERIFIED};
