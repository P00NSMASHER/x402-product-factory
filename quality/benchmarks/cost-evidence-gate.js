"use strict";

// Private data intake and arithmetic ONLY. Neither hashes nor operator-supplied
// records authenticate external invoices or authorize commercialization.
const fs=require("node:fs");
const path=require("node:path");
const {loadSpecs}=require("../../scripts/generate-spec-artifacts");
const {micros,decimalMoney}=require("../product-quality-lab");
const TEMPLATE=path.join(__dirname,"018-private-cost-evidence.template.json");
const OUT_DIR=path.join(__dirname,"..","generated");
const FIELDS=[
 "schema_version","document_type","product_id","period_start","period_end",
 "externally_settled_purchase_count","gross_before_refunds_usdc",
 "total_facilitator_and_chain_fees_usd","total_source_api_fees_usd",
 "incremental_hosting_cost_usd","total_retry_refund_support_cost_usd",
 "gross_refunds_usdc","matched_settlement_trace_count",
 "independent_facilitator_receipt_sha256","independent_source_invoice_sha256",
 "independent_hosting_invoice_sha256","independent_buyer_reconciliation_sha256"
];
const EVIDENCE_FIELDS=FIELDS.slice(3);
function fail(message){const e=new Error("COST_EVIDENCE_GATE: "+message);e.code="COST_EVIDENCE_GATE";throw e;}
function allowedKeys(obj){
  if(!obj||typeof obj!=="object"||Array.isArray(obj)||
    Object.keys(obj).sort().join("|")!==[...FIELDS].sort().join("|")){
    fail("cost intake has unapproved or missing fields");
  }
}
function dateOnly(s){
  if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const n=Date.parse(s+"T00:00:00Z");
  return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===s;
}
function analyze(doc,specs=loadSpecs()){
  allowedKeys(doc);
  if(doc.schema_version!==1||
      doc.document_type!=="PRIVATE_COST_RECONCILIATION_INTAKE_NOT_VERIFIED_BY_REPOSITORY"||
      doc.product_id!=="pa-vendor-counterparty-review")fail("invalid cost evidence identity");
  const spec=specs.find(x=>x.id===doc.product_id);
  if(!spec||spec.number!=="018"||spec.economics.price_usdc!=="0.010"){
    fail("product registry/specification identity unexpectedly changed");
  }
  const missing=EVIDENCE_FIELDS.filter(name=>doc[name]===null);
  if(missing.length){
    if(EVIDENCE_FIELDS.some(name=>doc[name]!==null)){
      fail("partially populated private cost intake must not claim reconciled totals");
    }
    return {
      schema_version:1,
      product_id:doc.product_id,
      input_status:"TEMPLATE_ONLY_ALL_REAL_COST_FIELDS_UNMEASURED",
      required_evidence_fields_missing:missing,
      measured_settlements:null,
      observed_average_revenue_usdc:null,
      operator_supplied_arithmetic_margin_pct:null,
      real_external_invoices_authenticated:false,
      independently_verified_external_buyers:false,
      independent_financial_audit_complete:false,
      commercialization_authorized:false,
      release_gate:"HOLD_UNVERIFIED_OPERATING_COSTS_AND_BUYER_EVIDENCE",
      product_025_unlock_evidence:false
    };
  }
  if(!dateOnly(doc.period_start)||!dateOnly(doc.period_end)||
      doc.period_start>doc.period_end||
      !Number.isSafeInteger(doc.externally_settled_purchase_count)||
      doc.externally_settled_purchase_count<1||
      doc.externally_settled_purchase_count>100000000||
      doc.matched_settlement_trace_count!==doc.externally_settled_purchase_count){
    fail("invalid date coverage or incomplete settlement trace reconciliation");
  }
  const keys=[
    "gross_before_refunds_usdc","total_facilitator_and_chain_fees_usd",
    "total_source_api_fees_usd","incremental_hosting_cost_usd",
    "total_retry_refund_support_cost_usd","gross_refunds_usdc"
  ];
  const values={};
  for(const k of keys)values[k]=micros(doc[k],6);
  if(values.gross_before_refunds_usdc<=0n||
      values.gross_refunds_usdc>values.gross_before_refunds_usdc){
    fail("gross revenue must be positive and not exceeded by refunds");
  }
  const gross=values.gross_before_refunds_usdc;
  const expected=micros(spec.economics.price_usdc,3)*
    BigInt(doc.externally_settled_purchase_count);
  if(gross!==expected)fail("gross receipts do not reconcile to registered product price");
  for(const key of FIELDS.filter(k=>k.endsWith("_sha256"))){
    if(typeof doc[key]!=="string"||!/^[a-f0-9]{64}$/.test(doc[key])){
      fail("private external document reference must be a SHA-256 format digest");
    }
  }
  const fees=keys.slice(1).reduce((n,k)=>n+values[k],0n);
  const contrib=gross-fees;
  const computed=Number(contrib*1000n/gross)/10;
  return {
    schema_version:1,
    product_id:doc.product_id,
    input_status:"PRIVATE_OPERATOR_SUPPLIED_UNATTESTED_ARITHMETIC",
    required_evidence_fields_missing:[],
    measured_settlements:doc.externally_settled_purchase_count,
    gross_from_unverified_private_inputs_usdc:decimalMoney(gross),
    total_costs_from_unverified_private_inputs_usd:decimalMoney(fees),
    net_from_unverified_private_inputs_usd:decimalMoney(contrib),
    operator_supplied_arithmetic_margin_pct:computed,
    target_spec_margin_pct:spec.economics.target_contribution_margin_pct,
    meets_arithmetic_target:contrib*100n>=gross*BigInt(spec.economics.target_contribution_margin_pct),
    real_external_invoices_authenticated:false,
    independently_verified_external_buyers:false,
    independent_financial_audit_complete:false,
    commercialization_authorized:false,
    release_gate:"HOLD_PENDING_INDEPENDENT_INVOICE_AND_BUYER_AUDIT",
    product_025_unlock_evidence:false
  };
}
function renderMarkdown(report){
  return [
    "# Product 018 — private cost-evidence gate",
    "",
    "No real source provider invoice, facilitator receipt, hosting charge, retry/refund ledger, or independent customer proof has been connected to the Product Factory.",
    "",
    "- Current status: **"+report.release_gate+"**.",
    "- Required private evidence fields still missing: **"+report.required_evidence_fields_missing.length+"**.",
    "- Verified external buyers: **not established**.",
    "- Verified operating contribution margin: **unknown**.",
    "",
    "Populate the private template on an authorized local machine using true financial records and SHA-256 **references**, not pasted customer or transaction secrets. Then run:",
    "",
    "    node quality/benchmarks/cost-evidence-gate.js --assess /private/018-costs.json",
    "",
    "This only computes **unattested input arithmetic** and does not authenticate source invoices or turn a hold into an approval. Keep raw records outside the repository; independently verify the hashes and source documents.",
    "",
    "Passing the Product 018 historical fee-only scenario is not current fee verification. No price, wallet, payment, customer data, deployment or Product 025+ action is authorized.",
    ""
  ].join("\n");
}
function serialize(doc=JSON.parse(fs.readFileSync(TEMPLATE,"utf8")),specs=loadSpecs()){
  const report=analyze(doc,specs);
  if(report.input_status!=="TEMPLATE_ONLY_ALL_REAL_COST_FIELDS_UNMEASURED"){
    fail("checked-in generated status must never assert populated cost observations");
  }
  return {
    "COST_EVIDENCE_GATE.json":JSON.stringify(report,null,2)+"\n",
    "COST_EVIDENCE_GATE.md":renderMarkdown(report)
  };
}
function execute(mode,artifacts=serialize()){
  if(!["check","write"].includes(mode))fail("expected --check or --write");
  if(mode==="write")fs.mkdirSync(OUT_DIR,{recursive:true});
  for(const [name,content] of Object.entries(artifacts)){
    const p=path.join(OUT_DIR,name);
    if(mode==="check"){
      if(!fs.existsSync(p)||fs.readFileSync(p,"utf8")!==content){
        fail("stale cost-evidence status artifact: "+name);
      }
    }else fs.writeFileSync(p,content,"utf8");
  }
  return {ok:true,mode,externally_verified_cost_inputs:0};
}
if(require.main===module){
  try{
    const args=process.argv.slice(2);
    if(args.length===1&&["--check","--write"].includes(args[0])){
      process.stdout.write(JSON.stringify(execute(args[0].slice(2)))+"\n");
    }else if(args.length===2&&args[0]==="--assess"){
      const input=JSON.parse(fs.readFileSync(args[1],"utf8"));
      const report=analyze(input);
      process.stdout.write(JSON.stringify(report,null,2)+"\n");
    }else fail("use --check, --write, or --assess /private/costs.json");
  }catch(e){process.stderr.write(String(e.message)+"\n");process.exitCode=1;}
}
module.exports={FIELDS,EVIDENCE_FIELDS,allowedKeys,dateOnly,analyze,renderMarkdown,serialize,execute};
