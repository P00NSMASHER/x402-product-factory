"use strict";

// Economic DESIGN frontier: all fee rates are historical spec-pinned
// assumptions. Never promote scenarios to actual margin or pricing changes.
const fs=require("node:fs");
const path=require("node:path");
const {loadSpecs}=require("../../scripts/generate-spec-artifacts");
const {micros,decimalMoney,feeOnlyScreen}=require("../product-quality-lab");

const OUT_DIR=path.join(__dirname,"..","generated");
const COST_CASES=Object.freeze(["0.000000","0.000500","0.001000"]);
function fail(message){
  const error=new Error("COST_FRONTIER_GATE: "+message);
  error.code="COST_FRONTIER_GATE";
  throw error;
}
function ceilingDivide(n,d){
  if(d<=0n||n<0n)fail("invalid hypothetical price bounds");
  return (n+d-1n)/d;
}
function fixedThree(n){
  if(n<0n||n%1000n!==0n)fail("price requires exact 0.001 USDC steps");
  return decimalMoney(n).slice(0,-3);
}
function calculate(spec){
  const e=spec?.economics;
  if(!e||!Number.isInteger(e.target_contribution_margin_pct)||
     e.target_contribution_margin_pct<=0||
     e.target_contribution_margin_pct>=100)fail("invalid target percentage");
  const price=micros(e.price_usdc,3);
  const settlement=micros(e.paid_settlement_cost_usd,6);
  const configuredSource=micros(e.configured_direct_source_fee_usd,6);
  if(price<=0n||e.incremental_hosting_cost_usd!==null){
    fail("cannot infer a price or known hosting cost");
  }
  feeOnlyScreen(spec);
  const cost=settlement+configuredSource;
  const marginCapacity=price*BigInt(100-e.target_contribution_margin_pct)/100n;
  const extraBudget=marginCapacity-cost;
  const minimumPrice=ceilingDivide(cost*100n,BigInt(100-e.target_contribution_margin_pct));
  const hypotheticalPriceCeilingRoundUp=ceilingDivide(minimumPrice,1000n)*1000n;
  const additionalScenarios=COST_CASES.map(extra=>{
    const extraMicro=micros(extra,6);
    return {
      hypothetical_additional_cost_usd:extra,
      hypothetical_margin_pct:Number((price-cost-extraMicro)*1000n/price)/10,
      meets_fee_only_target_if_this_were_total_extra_cost:
        (price-cost-extraMicro)*100n>=price*BigInt(e.target_contribution_margin_pct)
    };
  });
  return {
    product_number:spec.number,
    product_id:spec.id,
    registered_price_usdc:e.price_usdc,
    historical_paid_settlement_assumption_usd:e.paid_settlement_cost_usd,
    configured_direct_source_fee_usd:e.configured_direct_source_fee_usd,
    target_margin_pct:e.target_contribution_margin_pct,
    fee_only_margin_pct:e.post_allowance_margin_floor_pct,
    signed_incremental_cost_headroom_at_target_usd:decimalMoney(extraBudget),
    headroom_is_nonnegative:extraBudget>=0n,
    hypothetical_price_floor_at_target_on_three_decimal_usdc_grid:
      fixedThree(hypotheticalPriceCeilingRoundUp),
    hypothetical_extra_cost_scenarios:additionalScenarios,
    measured_actual_incremental_cost_per_purchase:null,
    measured_actual_contribution_margin_pct:null,
    historical_fee_assumption_verified_for_current_seller:false,
    commercial_price_change_authorized:false,
    product_025_unlock_evidence:false
  };
}
function build(specs=loadSpecs()){
  if(!Array.isArray(specs)||specs.length!==22)fail("exactly 22 eligible specs required");
  const sorted=[...specs].sort((a,b)=>a.number.localeCompare(b.number));
  const seen=new Set();
  const products=sorted.map((s,i)=>{
    const number=String(i+3).padStart(3,"0");
    if(s.number!==number||seen.has(s.id))fail("missing/duplicate/out-of-range eligible product");
    seen.add(s.id);
    return calculate(s);
  });
  const positive=products.filter(x=>x.headroom_is_nonnegative);
  if(positive.length!==1||positive[0].product_number!=="018"){
    fail("historical assumption no longer supports the documented screening baseline");
  }
  return {
    schema_version:1,
    report_type:"HYPOTHETICAL_COST_SENSITIVITY_NOT_VERIFIED_UNIT_ECONOMICS",
    product_count:22,
    positive_historical_target_headroom_count:positive.length,
    historical_assumed_settlement_fee_from_specs_only:true,
    verified_current_facilitator_fee_schedule:false,
    verified_independent_buyer_demand:false,
    production_or_pricing_authorizations:0,
    product_025_unlocked:false,
    products
  };
}
function render(report){
  const row=report.products.find(x=>x.product_number==="018");
  const lines=[
    "# Product Factory — cost sensitivity frontier",
    "",
    "All amounts below are **hypothetical arithmetic from 2026 specification-pinned fee assumptions**, not current facilitator quotes, real provider invoices, confirmed profit, or willingness-to-pay estimates.",
    "",
    "## Critical Product 018 constraint",
    "",
    "- Existing registered price: **$"+row.registered_price_usdc+" USDC**.",
    "- Historical paid settlement assumption: **$"+row.historical_paid_settlement_assumption_usd+" USD** per transaction.",
    "- To keep a 70% margin, **all additional actual incremental costs together** could total no more than **$"+row.signed_incremental_cost_headroom_at_target_usd+"** under those assumptions.",
    "- Actual hosting, network retries, source API fees, refunds, support and seller-specific facilitator pricing are **unverified**, so commercial viability remains HOLD.",
    "",
    "## Registered portfolio: estimated cost headroom",
    "",
    "| # | Product | Registered USDC | Historical fee-only margin | Cost headroom at target | Hypothetical minimum 0.001-grid price |",
    "|---|---|---:|---:|---:|---:|"
  ];
  for(const p of report.products){
    lines.push("| "+p.product_number+" | "+p.product_id+" | "+
      p.registered_price_usdc+" | "+p.fee_only_margin_pct.toFixed(1)+"% | "+
      p.signed_incremental_cost_headroom_at_target_usd+" | "+
      p.hypothetical_price_floor_at_target_on_three_decimal_usdc_grid+" |");
  }
  lines.push("",
    "**Important:** A negative headroom means the historical fee-only target is already missed before unknown real costs. The price floor is a *mathematical hypothetical*, never an approved or recommended price change.",
    "",
    "## Sensitivity illustration for Product 018",
    "",
    "| Hypothetical extra cost | Hypothetical margin | Mathematical 70% screen |",
    "|---:|---:|---|");
  for(const x of row.hypothetical_extra_cost_scenarios){
    lines.push("| $"+x.hypothetical_additional_cost_usd+" | "+
      x.hypothetical_margin_pct.toFixed(1)+"% | "+
      (x.meets_fee_only_target_if_this_were_total_extra_cost?"passes":"fails")+" |");
  }
  lines.push("",
    "No observed purchases, buyer effects, verified current provider charges or price changes were created. Preserve the Product 025+ freeze and human commercial/security review.","");
  return lines.join("\n");
}
function serialize(specs=loadSpecs()){
  const report=build(specs);
  return {
    "COST_FRONTIER.json":JSON.stringify(report,null,2)+"\n",
    "COST_FRONTIER.md":render(report)
  };
}
function execute(mode,artifacts=serialize()){
  if(!["check","write"].includes(mode))fail("expected --check or --write");
  if(mode==="write")fs.mkdirSync(OUT_DIR,{recursive:true});
  for(const [name,content] of Object.entries(artifacts)){
    const target=path.join(OUT_DIR,name);
    if(mode==="check"){
      if(!fs.existsSync(target)||fs.readFileSync(target,"utf8")!==content){
        fail("stale cost frontier artifact: "+name);
      }
    }else fs.writeFileSync(target,content,"utf8");
  }
  return {ok:true,mode,productCount:22,currentMarketCostClaims:0};
}
if(require.main===module){
  try{
    const args=process.argv.slice(2);
    if(args.length!==1||!["--check","--write"].includes(args[0]))fail("expected --check or --write");
    process.stdout.write(JSON.stringify(execute(args[0].slice(2)))+"\n");
  }catch(e){process.stderr.write(String(e.message)+"\n");process.exitCode=1;}
}
module.exports={COST_CASES,ceilingDivide,fixedThree,calculate,build,render,serialize,execute};
