"use strict";

// Improvement proposals are experiment DESIGN, never evidence of sales or
// authorization to change prices, issue payments, deploy, or add Product 025+.
const fs=require("node:fs");
const path=require("node:path");
const {loadSpecs}=require("../scripts/generate-spec-artifacts");
const {feeOnlyScreen}=require("./product-quality-lab");

const INPUT=path.join(__dirname,"opportunities.json");
const OUT_JSON=path.join(__dirname,"generated","OPPORTUNITY_QUEUE.json");
const OUT_MD=path.join(__dirname,"generated","OPPORTUNITY_QUEUE.md");
const OPPORTUNITY_KEYS=["product_id","lifecycle_status","customer_job","comparator","improvement","blind_evaluation","evidence","safety"];
const JOB_KEYS=["persona","trigger","success_action","consequence_of_failure"];
const COMPARATOR_KEYS=["method","measured_baseline_time_seconds","measured_baseline_error_rate"];
const IMPROVEMENT_KEYS=["proposed_change","expected_benefit","primary_metric","target_direction","hypothesis_target_percent","change_scope"];
const EVAL_KEYS=["synthetic_case_count","independent_reviewers_target","counterexamples","acceptance_rule"];
const EVIDENCE_KEYS=["independent_buyer_interviews","settled_repeat_external_buys","measured_baseline","verified_unit_profit","blind_test_false_proceed_rate"];
const SAFETY_KEYS=["auto_deploy","requires_manual_release_review","customer_data_in_repo","unlocks_product_025"];
function fail(message){const e=new Error("QUALITY_OPPORTUNITY_GATE: "+message);e.code="QUALITY_OPPORTUNITY_GATE";throw e;}
function exact(value,keys,label){
  if(!value||typeof value!=="object"||Array.isArray(value)||
      Object.keys(value).sort().join("|")!==[...keys].sort().join("|")){
    fail(label+" must contain exactly its documented fields");
  }
}
function prose(value,label,min=15){
  if(typeof value!=="string"||value.trim().length<min||value.length>850||
      /<script|sk-[A-Za-z0-9]|-----BEGIN PRIVATE KEY-----/i.test(value)){
    fail(label+" must be safe, substantive text");
  }
}
function validateProposal(proposal,specById){
  exact(proposal,OPPORTUNITY_KEYS,"proposal");
  if(typeof proposal.product_id!=="string"||!specById.has(proposal.product_id)){
    fail("unregistered or Product 025+ improvement target");
  }
  const spec=specById.get(proposal.product_id);
  if(Number(spec.number)<3||Number(spec.number)>24)fail("only existing 003–024 products are in scope");
  if(proposal.lifecycle_status!=="hypothesis")fail("candidate cannot self-certify commercial validation");
  exact(proposal.customer_job,JOB_KEYS,"customer_job");
  for(const key of JOB_KEYS)prose(proposal.customer_job[key],"customer_job."+key);
  exact(proposal.comparator,COMPARATOR_KEYS,"comparator");
  prose(proposal.comparator.method,"comparator.method");
  for(const key of COMPARATOR_KEYS.slice(1)){
    if(proposal.comparator[key]!==null)fail("unmeasured comparator cannot claim actual improvement");
  }
  exact(proposal.improvement,IMPROVEMENT_KEYS,"improvement");
  for(const key of ["proposed_change","expected_benefit"])prose(proposal.improvement[key],"improvement."+key);
  if(typeof proposal.improvement.primary_metric!=="string"||
      !/^[a-z][a-z0-9_]{6,80}$/.test(proposal.improvement.primary_metric)){
    fail("must declare a specific machine-readable benchmark metric");
  }
  if(!["increase","decrease"].includes(proposal.improvement.target_direction)||
     !Number.isInteger(proposal.improvement.hypothesis_target_percent)||
     proposal.improvement.hypothesis_target_percent<1||
     proposal.improvement.hypothesis_target_percent>90||
     proposal.improvement.change_scope!=="proposed_not_live"){
    fail("improvement must be a bounded, explicitly hypothetical target");
  }
  exact(proposal.blind_evaluation,EVAL_KEYS,"blind_evaluation");
  const ev=proposal.blind_evaluation;
  if(!Number.isInteger(ev.synthetic_case_count)||ev.synthetic_case_count<20||
     ev.synthetic_case_count>500||
     !Number.isInteger(ev.independent_reviewers_target)||
     ev.independent_reviewers_target<2||ev.independent_reviewers_target>20||
     !Array.isArray(ev.counterexamples)||ev.counterexamples.length<3||
     ev.counterexamples.length>12||new Set(ev.counterexamples).size!==ev.counterexamples.length||
     ev.counterexamples.some(x=>typeof x!=="string"||!/^[a-z][a-z0-9_]{3,64}$/.test(x))){
    fail("blind tests need meaningful synthetic negative/control fixtures and independent reviewers");
  }
  prose(ev.acceptance_rule,"blind_evaluation.acceptance_rule",35);
  exact(proposal.evidence,EVIDENCE_KEYS,"evidence");
  for(const key of EVIDENCE_KEYS){
    if(proposal.evidence[key]!==null)fail("unverified evidence cannot be promoted via repository claims");
  }
  exact(proposal.safety,SAFETY_KEYS,"safety");
  if(proposal.safety.auto_deploy!==false||
     proposal.safety.requires_manual_release_review!==true||
     proposal.safety.customer_data_in_repo!==false||
     proposal.safety.unlocks_product_025!==false){
    fail("candidate proposal cannot bypass human release or Product 025+ freeze");
  }
  return {
    product_number:spec.number,
    product_id:spec.id,
    buyer_persona_hypothesis:proposal.customer_job.persona,
    baseline_method_hypothesis:proposal.comparator.method,
    proposed_change:proposal.improvement.proposed_change,
    benefit_hypothesis:proposal.improvement.expected_benefit,
    metric:proposal.improvement.primary_metric,
    hypothetical_target_pct:proposal.improvement.hypothesis_target_percent,
    target_direction:proposal.improvement.target_direction,
    blinded_synthetic_cases_planned:ev.synthetic_case_count,
    blind_independent_reviewers_planned:ev.independent_reviewers_target,
    negative_controls_planned:ev.counterexamples,
    fee_only_screen:feeOnlyScreen(spec).category,
    observed_benefit:null,
    verified_independent_buyers:null,
    actual_full_unit_margin:null,
    candidate_status:"HOLD_UNMEASURED_BENEFIT",
    production_approved:false,
    price_changes_approved:false,
    product_025_unlock_evidence:false
  };
}
function buildQueue(document,specs=loadSpecs()){
  exact(document,["schema_version","report_type","opportunities"],"opportunity document");
  if(document.schema_version!==1||
    document.report_type!=="unverified_product_improvement_hypotheses"||
    !Array.isArray(document.opportunities)||document.opportunities.length<1||
    document.opportunities.length>22)fail("invalid proposal document");
  const byId=new Map(specs.map(p=>[p.id,p]));
  if(byId.size!==22||specs.length!==22)fail("expected exactly 22 existing registered specifications");
  const seen=new Set(),queue=[];
  for(const item of document.opportunities){
    const reviewed=validateProposal(item,byId);
    if(seen.has(reviewed.product_id))fail("duplicate improvement proposal for "+reviewed.product_id);
    seen.add(reviewed.product_id);
    queue.push(reviewed);
  }
  queue.sort((a,b)=>a.product_number.localeCompare(b.product_number));
  return {
    schema_version:1,
    report_type:"design_hypotheses_not_product_market_fit",
    total_hypotheses:queue.length,
    observed_buyer_outcomes:0,
    independently_verified_demand:"unmeasured",
    automatic_release_authorizations:0,
    product_025_unlock_evidence:false,
    proposals:queue
  };
}
function renderMarkdown(queue){
  const lines=[
    "# Product Quality Lab — blinded customer-value experiment queue",
    "",
    "These are **hypotheses**, not proven market opportunities. Every proposed change is offline and requires objective comparisons with accessible source workflows, independent reviewers and full unit cost evidence.",
    "",
    "| Product | Design change | Primary metric | Hypothesis target | Synthetic cases | Status |",
    "|---|---|---|---:|---:|---|"
  ];
  for(const p of queue.proposals){
    lines.push("| "+p.product_number+" "+p.product_id+" | "+p.proposed_change.replace(/\|/g,"/")+
    " | "+p.metric+" | "+p.target_direction+" "+p.hypothetical_target_pct+
    "% | "+p.blinded_synthetic_cases_planned+" | "+p.candidate_status+" |");
  }
  lines.push("","## Independent evidence still required","","- Real buyer interviews and repeat purchase evidence, with permission and private retention.",
    "- Blind comparison against direct authoritative-source workflows, including contradictory and missing-source cases.",
    "- Measured latency, false positive/false proceed and buyer task completion, plus actual provider/hosting/settlement/refund costs.",
    "- Human security/privacy/integration and commercial review before any change to production.",
    "","No automatically published, priced, purchased, refunded, or newly numbered products. Product 025+ remains frozen.","");
  return lines.join("\n");
}
function serialize(document=JSON.parse(fs.readFileSync(INPUT,"utf8")),specs=loadSpecs()){
  const report=buildQueue(document,specs);
  return {
    "OPPORTUNITY_QUEUE.json":JSON.stringify(report,null,2)+"\n",
    "OPPORTUNITY_QUEUE.md":renderMarkdown(report)
  };
}
function execute(mode,artifacts=serialize()){
  if(!["check","write"].includes(mode))fail("use --check or --write");
  const dir=path.dirname(OUT_JSON);
  if(mode==="write")fs.mkdirSync(dir,{recursive:true});
  for(const [name,text] of Object.entries(artifacts)){
    const target=path.join(dir,name);
    if(mode==="check"){
      if(!fs.existsSync(target)||fs.readFileSync(target,"utf8")!==text)fail("stale opportunity artifact: "+name);
    }else fs.writeFileSync(target,text,"utf8");
  }
  return {ok:true,mode,opportunityCount:Object.keys(artifacts).length===2?"from validated document":null};
}
if(require.main===module){
  try{
    const args=process.argv.slice(2);
    if(args.length!==1||!["--check","--write"].includes(args[0]))fail("use --check or --write");
    process.stdout.write(JSON.stringify(execute(args[0].slice(2)))+"\n");
  }catch(error){process.stderr.write(String(error.message)+"\n");process.exitCode=1;}
}
module.exports={validateProposal,buildQueue,renderMarkdown,serialize,execute};
