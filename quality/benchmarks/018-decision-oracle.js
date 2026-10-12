"use strict";

// Predeclared repository-authored synthetic oracle for Product 018. Expected labels are
// specified BEFORE executing baseline or candidate. No provider/network calls.
const fs=require("node:fs");
const path=require("node:path");
const {assessCounterpartyReview}=require("../../products/pa-vendor-counterparty-review/decision");
const {assessHardenedCounterparty,MANUAL_REASON}=require("./018-hardened-decision");

const OUTPUT_JSON=path.join(__dirname,"..","generated","018_DECISION_ORACLE.json");
const OUTPUT_MD=path.join(__dirname,"..","generated","018_DECISION_ORACLE.md");
const NOW="2026-10-02T12:00:00Z";
const BASE=Object.freeze({
  registry:{available:true,strongMatch:true,ambiguous:false,candidateCount:1,strongCandidateCount:1,identityComplete:true,matchScore:0,entity:{businessName:"Example LLC"}},
  ofac:{available:true,query:"Example LLC",minScore:90,totalCandidatesAboveThreshold:0,candidates:[]},
  rdap:{available:true,registered:true,nameAligned:true,domain:"example.com",
    events:{registration:"2020-01-01T00:00:00Z"}}
});
const clone=x=>JSON.parse(JSON.stringify(x));
function fail(msg){const e=new Error("DECISION_ORACLE_GATE: "+msg);e.code="DECISION_ORACLE_GATE";throw e;}
function makeScenario(id,mutate,label,expectedReason=null){
  return Object.freeze({id,mutate,expected_decision:label,expected_reason:expectedReason});
}
const CASES=Object.freeze([
 makeScenario("clean_consistent",()=>{},"proceed"),
 makeScenario("clean_registered_alias",x=>{x.rdap.events={registered:"2020-01-01T00:00:00Z"};},"proceed"),
 makeScenario("registry_unavailable",x=>{x.registry.available=false;},"human_review","PA_REGISTRY_UNAVAILABLE"),
 makeScenario("registry_missing",x=>{x.registry.candidateCount=0;x.registry.entity=null;x.registry.strongMatch=false;},"human_review","PA_ENTITY_NOT_FOUND"),
 makeScenario("registry_ambiguous",x=>{x.registry.ambiguous=true;},"human_review","PA_REGISTRY_MATCH_AMBIGUOUS"),
 makeScenario("registry_weak",x=>{x.registry.strongMatch=false;},"human_review","PA_REGISTRY_MATCH_UNCERTAIN"),
 makeScenario("registry_missing_name",x=>{x.registry.entity.businessName="";},"human_review","PA_REGISTRY_LEGAL_NAME_UNAVAILABLE"),
 makeScenario("registry_two_strong_candidates",x=>{x.registry.candidateCount=2;x.registry.strongCandidateCount=2;},"human_review",MANUAL_REASON.REGISTRY_STRENGTH),
 makeScenario("registry_two_ranked_one_strong_valid",x=>{x.registry.candidateCount=2;},"proceed"),
 makeScenario("registry_three_ranked_one_strong_valid",x=>{x.registry.candidateCount=3;},"proceed"),
 makeScenario("registry_ranked_overflow",x=>{x.registry.candidateCount=4;},"human_review",MANUAL_REASON.REGISTRY_CARDINALITY),
 makeScenario("registry_strong_count_missing",x=>{delete x.registry.strongCandidateCount;},"human_review",MANUAL_REASON.REGISTRY_STRENGTH),
 makeScenario("registry_unverified_identity_complete",x=>{x.registry.identityComplete=false;},"human_review",MANUAL_REASON.REGISTRY_STRENGTH),
 makeScenario("registry_zero_candidates_with_entity",x=>{x.registry.candidateCount=0;},"human_review",MANUAL_REASON.REGISTRY_CARDINALITY),
 makeScenario("registry_negative_count",x=>{x.registry.candidateCount=-1;},"human_review",MANUAL_REASON.REGISTRY_CARDINALITY),
 makeScenario("registry_fractional_count",x=>{x.registry.candidateCount=1.5;},"human_review",MANUAL_REASON.REGISTRY_CARDINALITY),
 makeScenario("ofac_unavailable",x=>{x.ofac.available=false;},"human_review","OFAC_EVIDENCE_UNAVAILABLE"),
 makeScenario("ofac_name_candidate",x=>{x.ofac.totalCandidatesAboveThreshold=1;x.ofac.candidates=[{score:95}];},"human_review","OFAC_CANDIDATE_REQUIRES_REVIEW"),
 makeScenario("ofac_total_positive_candidates_empty",x=>{x.ofac.totalCandidatesAboveThreshold=1;},"human_review",MANUAL_REASON.OFAC_COUNTS),
 makeScenario("ofac_negative_total",x=>{x.ofac.totalCandidatesAboveThreshold=-1;},"human_review",MANUAL_REASON.OFAC_COUNTS),
 makeScenario("ofac_positive_array_zero_total",x=>{x.ofac.candidates=[{score:96}];},"human_review",MANUAL_REASON.OFAC_COUNTS),
 makeScenario("ofac_count_missing",x=>{delete x.ofac.totalCandidatesAboveThreshold;},"human_review",MANUAL_REASON.OFAC_INCOMPLETE),
 makeScenario("ofac_candidates_missing",x=>{delete x.ofac.candidates;},"human_review",MANUAL_REASON.OFAC_INCOMPLETE),
 makeScenario("ofac_nan_total",x=>{x.ofac.totalCandidatesAboveThreshold="unknown";},"human_review",MANUAL_REASON.OFAC_INCOMPLETE),
 makeScenario("ofac_wrong_entity_screened",x=>{x.ofac.query="Unrelated LLC";},"human_review",MANUAL_REASON.OFAC_CONTEXT),
 makeScenario("ofac_wrong_threshold_screened",x=>{x.ofac.minScore=70;},"human_review",MANUAL_REASON.OFAC_CONTEXT),
 makeScenario("ofac_missing_screen_context",x=>{delete x.ofac.query;},"human_review",MANUAL_REASON.OFAC_CONTEXT),
 makeScenario("ofac_valid_truncated_three_of_four",x=>{x.ofac.totalCandidatesAboveThreshold=4;x.ofac.candidates=[{score:99},{score:98},{score:97}];},"human_review","OFAC_CANDIDATE_REQUIRES_REVIEW"),
 makeScenario("rdap_unavailable",x=>{x.rdap.available=false;},"human_review","RDAP_EVIDENCE_UNAVAILABLE"),
 makeScenario("domain_unregistered",x=>{x.rdap.registered=false;},"human_review","DOMAIN_UNREGISTERED"),
 makeScenario("domain_registration_unknown",x=>{delete x.rdap.registered;},"human_review","DOMAIN_REGISTRATION_STATUS_UNKNOWN"),
 makeScenario("domain_name_mismatch",x=>{x.rdap.nameAligned=false;},"human_review","DOMAIN_LEGAL_NAME_MISMATCH"),
 makeScenario("domain_date_missing",x=>{delete x.rdap.events.registration;},"human_review","DOMAIN_REGISTRATION_DATE_UNAVAILABLE"),
 makeScenario("domain_invalid_calendar",x=>{x.rdap.events.registration="2026-02-31";},"human_review",MANUAL_REASON.RDAP_DATE),
 makeScenario("domain_malformed_timestamp",x=>{x.rdap.events.registration="2026-01-01T99:99:99Z";},"human_review",MANUAL_REASON.RDAP_DATE),
 makeScenario("domain_future_registration",x=>{x.rdap.events.registration="2027-01-01";},"human_review",MANUAL_REASON.RDAP_DATE),
 makeScenario("domain_threshold_equal",x=>{x.rdap.events.registration="2026-07-04";},"proceed"),
 makeScenario("domain_threshold_just_below",x=>{x.rdap.events.registration="2026-07-05";},"human_review","DOMAIN_RECENT_REGISTRATION"),
 makeScenario("dual_ofac_and_recent_domain",x=>{
    x.ofac.totalCandidatesAboveThreshold=1;x.ofac.candidates=[{score:98}];
    x.rdap.events.registration="2026-07-05";
  },"human_review","OFAC_CANDIDATE_REQUIRES_REVIEW"),
 makeScenario("dual_ofac_bad_count_and_bad_date",x=>{
    x.ofac.totalCandidatesAboveThreshold=-1;
    x.rdap.events.registration="2026-02-31";
  },"human_review",MANUAL_REASON.OFAC_COUNTS)
]);
function evaluateCase(scenario){
  const evidence=clone(BASE);
  scenario.mutate(evidence);
  const opts={now:NOW,minScore:90,minDomainAgeDays:90};
  const baseline=assessCounterpartyReview(clone(evidence),opts);
  const candidate=assessHardenedCounterparty(clone(evidence),opts);
  const oracle=scenario.expected_decision;
  const reasonValid=scenario.expected_reason===null||
    candidate.reasonCodes.includes(scenario.expected_reason);
  return {
    id:scenario.id,
    predeclared_synthetic_expected_decision:oracle,
    expected_reason_code:scenario.expected_reason,
    baseline_decision:baseline.decision,
    candidate_decision:candidate.decision,
    baseline_matches_synthetic_gold:baseline.decision===oracle,
    candidate_matches_synthetic_gold:candidate.decision===oracle,
    candidate_reason_satisfies_oracle:reasonValid,
    baseline_false_proceed_on_synthetic_gold:baseline.decision==="proceed"&&oracle==="human_review",
    candidate_false_proceed_on_synthetic_gold:candidate.decision==="proceed"&&oracle==="human_review",
    candidate_contract_issue_codes:candidate.synthetic_contract_issue_codes
  };
}
function buildReport(){
  const names=new Set(CASES.map(s=>s.id));
  if(names.size!==CASES.length||CASES.length<25)fail("synthetic labels duplicate or insufficient");
  const results=CASES.map(evaluateCase);
  if(results.some(r=>!r.candidate_matches_synthetic_gold||!r.candidate_reason_satisfies_oracle)){
    fail("offline hardened candidate violates independently declared synthetic oracle");
  }
  const baselineFalse=results.filter(x=>x.baseline_false_proceed_on_synthetic_gold).length;
  const candidateFalse=results.filter(x=>x.candidate_false_proceed_on_synthetic_gold).length;
  if(candidateFalse!==0)fail("unsafe candidate proceed");
  return {
    schema_version:1,
    report_type:"SYNTHETIC_DECISION_ORACLE_NOT_INDEPENDENT_REAL_WORLD_GROUND_TRUTH",
    product_number:"018",
    scenario_count:results.length,
    baseline_synthetic_label_matches:results.filter(x=>x.baseline_matches_synthetic_gold).length,
    candidate_synthetic_label_matches:results.filter(x=>x.candidate_matches_synthetic_gold).length,
    raw_baseline_false_proceed_synthetic_cases:baselineFalse,
    candidate_false_proceed_synthetic_cases:candidateFalse,
    current_live_product_modified:false,
    legal_compliance_or_sanctions_clearance_established:false,
    independent_real_world_ground_truth_available:false,
    independent_reviewer_time_measured:false,
    buyer_willingness_to_pay_verified:false,
    product_025_unlocked:false,
    release_status:"HOLD_OFFLINE_CANDIDATE_REQUIRES_INDEPENDENT_REVIEW",
    cases:results
  };
}
function renderMarkdown(report){
  const lines=[
    "# Product 018 — evidence-contradiction oracle",
    "",
    "Offline QA only. All "+report.scenario_count+" gold labels were authored as **synthetic test expectations**; no independently labeled real-world evidence or actual buyer validation exists.",
    "",
    "- Baseline synthetic oracle matches: **"+report.baseline_synthetic_label_matches+"/"+report.scenario_count+"**.",
    "- Offline hardened candidate synthetic oracle matches: **"+report.candidate_synthetic_label_matches+"/"+report.scenario_count+"**.",
    "- Baseline synthetic incorrect \`proceed\`: **"+report.raw_baseline_false_proceed_synthetic_cases+"**.",
    "- Hardened candidate synthetic incorrect \`proceed\`: **"+report.candidate_false_proceed_synthetic_cases+"**.",
    "- Release: **"+report.release_status+"**; no production change.",
    "",
    "| Synthetic fixture | Oracle | Current staging decision | Offline proposed decision |",
    "|---|---|---|---|"
  ];
  for(const row of report.cases){
    lines.push("| "+row.id+" | "+row.predeclared_synthetic_expected_decision+
      " | "+row.baseline_decision+" | "+row.candidate_decision+" |");
  }
  lines.push("",
    "## Decision-design findings",
    "",
    "The audited Pennsylvania adapter can return several ranked candidates when exactly one is a strong match; these are valid matches, not cardinality errors. The offline candidate now checks strongCandidateCount/identityComplete rather than assuming candidateCount===1, and verifies OFAC screening name, requested threshold and bounded candidate tallies. It also checks invalid/future RDAP registration dates. A synthetic expected label is not independent legal or source-provider truth.",
    "",
    "The real staging decision implementation, source adapters, payment handlers, registered prices, wallets and production runtime are **unchanged**. Human source-contract, privacy/security, independent gold-label evaluation, costs and product-value reviews remain required before considering integration.","");
  return lines.join("\n");
}
function serialize(){
  const result=buildReport();
  return {
    "018_DECISION_ORACLE.json":JSON.stringify(result,null,2)+"\n",
    "018_DECISION_ORACLE.md":renderMarkdown(result)
  };
}
function execute(mode,artifacts=serialize()){
  if(!["check","write"].includes(mode))fail("expected --check or --write");
  const dir=path.dirname(OUTPUT_JSON);
  if(mode==="write")fs.mkdirSync(dir,{recursive:true});
  for(const [file,content] of Object.entries(artifacts)){
    const target=path.join(dir,file);
    if(mode==="check"){
      if(!fs.existsSync(target)||fs.readFileSync(target,"utf8")!==content){
        fail("stale decision-quality oracle snapshot: "+file);
      }
    }else fs.writeFileSync(target,content,"utf8");
  }
  return {ok:true,mode,syntheticCases:buildReport().scenario_count,liveChanges:false};
}
if(require.main===module){
  try{
    const args=process.argv.slice(2);
    if(args.length!==1||!["--check","--write"].includes(args[0]))fail("expected --check or --write");
    process.stdout.write(JSON.stringify(execute(args[0].slice(2)))+"\n");
  }catch(e){process.stderr.write(String(e.message)+"\n");process.exitCode=1;}
}
module.exports={BASE,CASES,NOW,evaluateCase,buildReport,renderMarkdown,serialize,execute};
