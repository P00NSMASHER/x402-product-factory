"use strict";

// Offline demonstration of a better human-actionable response for existing
// Product 018. Not wired into runtime, payment, source adapters, or release.
const fs=require("node:fs");
const path=require("node:path");
const FIXTURES=path.join(__dirname,"018-counterparty-brief-fixtures.json");
const OUTPUT=path.join(__dirname,"..","generated","018_REVIEWER_BRIEF_PROTOTYPE.md");
const CRITICAL_SOURCES=Object.freeze(["registry","ofac","domain"]);
const NEXT_ACTIONS=Object.freeze({
  CONTINUE_STANDARD_DUE_DILIGENCE:"Continue normal procurement due diligence; the configured automated checks are not a legal clearance.",
  ESCALATE_NAME_SCREENING:"Escalate possible OFAC name or alias candidates to a qualified human reviewer; do not interpret as sanctions clearance.",
  VERIFY_LEGAL_ENTITY:"Manually reconcile the Pennsylvania registry legal-entity match and unresolved identifiers.",
  VERIFY_DOMAIN_EVIDENCE:"Request independent domain-control evidence and review authoritative RDAP registration/name signals.",
  REVIEW_SOURCE_FAILURE:"Treat required upstream source failure as non-chargeable review; retry via the approved workflow before considering payment.",
  MANUAL_REVIEW_UNCLASSIFIED:"Escalate to manual review because the evidence/reason combination is incomplete or unfamiliar."
});
function fail(message){const e=new Error("COUNTERPARTY_BRIEF: "+message);e.code="COUNTERPARTY_BRIEF";throw e;}
function summarize(productResult){
  if(!productResult||typeof productResult!=="object"||Array.isArray(productResult)||
      !["proceed","human_review"].includes(productResult.decision)||
      !Array.isArray(productResult.reasonCodes)||productResult.reasonCodes.length>32||
      !productResult.reasonCodes.every(s=>typeof s==="string"&&/^[A-Z0-9_]{1,80}$/.test(s))||
      !Array.isArray(productResult.sourceFailures)||productResult.sourceFailures.length>32){
    fail("invalid or untrusted Product 018 decision response");
  }
  const codes=productResult.reasonCodes;
  const rawChecks=productResult.checks&&typeof productResult.checks==="object"?productResult.checks:{};
  const statuses=Object.fromEntries(CRITICAL_SOURCES.map(id=>[
    id,["pass","review"].includes(rawChecks[id]?.status)?rawChecks[id].status:"unknown"
  ]));
  const hasSourceFailure=productResult.sourceFailures.length>0||productResult.chargeable===false;
  const allPassing=CRITICAL_SOURCES.every(id=>statuses[id]==="pass");
  const safeProceed=productResult.decision==="proceed"&&codes.length===0&&
    !hasSourceFailure&&allPassing&&productResult.chargeable===true;
  const decision=safeProceed?"proceed":"human_review";
  let action="MANUAL_REVIEW_UNCLASSIFIED";
  if(hasSourceFailure)action="REVIEW_SOURCE_FAILURE";
  else if(codes.some(x=>x.startsWith("OFAC_")||x.includes("OFAC_NAME_CANDIDATE")))action="ESCALATE_NAME_SCREENING";
  else if(codes.some(x=>x.startsWith("PA_REGISTRY_")||x==="PA_ENTITY_NOT_FOUND"))action="VERIFY_LEGAL_ENTITY";
  else if(codes.some(x=>x.startsWith("DOMAIN_")||x.startsWith("RDAP_")))action="VERIFY_DOMAIN_EVIDENCE";
  else if(safeProceed)action="CONTINUE_STANDARD_DUE_DILIGENCE";
  // Never echo raw company names, addresses, upstream evidence, payment
  // headers, source failure detail strings or potentially sensitive objects.
  return {
    schema_version:1,
    prototype_only_not_deployed:true,
    raw_product_decision:productResult.decision,
    conservative_reviewer_decision:decision,
    next_action_code:action,
    next_action_text:NEXT_ACTIONS[action],
    source_check_statuses:statuses,
    reason_codes:[...codes],
    observed_source_failure_count:productResult.sourceFailures.length,
    needs_manual_clearance:true,
    qualifies_as_sanctions_clearance:false,
    establishes_domain_ownership:false,
    unverified_fraud_or_credit_assessment:null,
    product_025_unlock_evidence:false
  };
}
function buildFixtureReview(fixtures){
  if(!fixtures||fixtures.schema_version!==1||
      fixtures.fixture_type!=="synthetic_product_018_reviewer_triage_cases"||
      !Array.isArray(fixtures.cases)||fixtures.cases.length<8||
      fixtures.cases.length>200)fail("invalid controlled synthetic fixture catalog");
  const seen=new Set(),results=[];
  for(const row of fixtures.cases){
    if(!row||typeof row.id!=="string"||!/^[a-z][a-z0-9_]{3,70}$/.test(row.id)||
        seen.has(row.id)||!NEXT_ACTIONS[row.expected_next_action]||
        !["proceed","human_review"].includes(row.expected_review_decision)){
      fail("invalid or duplicate expected fixture");
    }
    seen.add(row.id);
    const brief=summarize(row.input);
    if(brief.conservative_reviewer_decision!==row.expected_review_decision||
       brief.next_action_code!==row.expected_next_action){
      fail("prototype golden outcome mismatch: "+row.id);
    }
    results.push({
      synthetic_case_id:row.id,
      raw_decision:brief.raw_product_decision,
      conservative_review_decision:brief.conservative_reviewer_decision,
      proposed_next_action:brief.next_action_code
    });
  }
  return {
    schema_version:1,
    prototype:"018_counterparty_reviewer_triage_not_runtime",
    synthetic_fixture_count:results.length,
    reviewer_action_codes_exercised:new Set(results.map(x=>x.proposed_next_action)).size,
    contradictory_proceed_downgraded_to_review:results.some(x=>
      x.raw_decision==="proceed"&&x.conservative_review_decision==="human_review"),
    actual_buyer_benefit_measured:false,
    real_customer_success_count:null,
    automatic_legal_clearance:false,
    production_changes:false,
    results
  };
}
function renderMarkdown(report){
  const rows=[
    "# Product 018 — offline reviewer-brief prototype",
    "",
    "This is a **synthetic prototype**; no new live API response, price, wallet or settlement behavior is deployed.",
    "It translates bounded reason codes and source-check statuses into explicit reviewer next actions. A contradictory \`proceed\` cannot bypass missing or adverse evidence. The current live product remains unchanged.",
    "",
    "- Synthetic golden cases: **"+report.synthetic_fixture_count+"**.",
    "- Action codes represented: **"+report.reviewer_action_codes_exercised+"**.",
    "- Contradictory proceed downgraded in prototype: **"+String(report.contradictory_proceed_downgraded_to_review)+"**.",
    "- Measured real buyer time saved, false proceed rate and willingness to pay: **unknown**.",
    "",
    "| Synthetic case | Original decision | Cautious review | Suggested next action |",
    "|---|---|---|---|"
  ];
  for(const item of report.results){
    rows.push("| "+item.synthetic_case_id+" | "+item.raw_decision+" | "+
      item.conservative_review_decision+" | "+item.proposed_next_action+" |");
  }
  rows.push("","## Gate before any production integration","","Run independent blind buyer workflow comparison, human/SEC/OFAC and security review, verify the source provenance and stop any false proceed. Do not interpret these fixtures as real performance or product-market fit.","");
  return rows.join("\n");
}
function serialize(fixtures=JSON.parse(fs.readFileSync(FIXTURES,"utf8"))){
  return renderMarkdown(buildFixtureReview(fixtures));
}
function execute(mode,markdown=serialize()){
  if(!["check","write"].includes(mode))fail("use --check or --write");
  if(mode==="check"){
    if(!fs.existsSync(OUTPUT)||fs.readFileSync(OUTPUT,"utf8")!==markdown)fail("stale 018 reviewer prototype report");
  }else{
    fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
    fs.writeFileSync(OUTPUT,markdown,"utf8");
  }
  return {ok:true,mode,productionChanges:false};
}
if(require.main===module){
  try{
    const arg=process.argv.slice(2);
    if(arg.length!==1||!["--check","--write"].includes(arg[0]))fail("use --check or --write");
    process.stdout.write(JSON.stringify(execute(arg[0].slice(2)))+"\n");
  }catch(e){process.stderr.write(String(e.message)+"\n");process.exitCode=1;}
}
module.exports={NEXT_ACTIONS,summarize,buildFixtureReview,renderMarkdown,serialize,execute};
