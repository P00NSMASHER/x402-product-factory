"use strict";

// Masked synthetic reviewer pilot, NOT a blinded real-buyer study.
// Gold labels never leave this private scoring module in the public packets.
const fs=require("node:fs");
const path=require("node:path");
const {summarize,NEXT_ACTIONS}=require("../prototypes/018-counterparty-brief");

const FIXTURES=path.join(__dirname,"..","prototypes","018-counterparty-brief-fixtures.json");
const OUT_DIR=path.join(__dirname,"..","generated");
const REVIEWER_SLOTS=Object.freeze(["R1","R2"]);
const DECISIONS=Object.freeze(["proceed","human_review"]);
const ACTIONS=Object.freeze(Object.keys(NEXT_ACTIONS));
const FIELDS=Object.freeze(["assignment_id","reviewer_slot","selected_decision","selected_next_action","elapsed_seconds"]);

function fail(message){
  const e=new Error("MASKED_PILOT_GATE: "+message);
  e.code="MASKED_PILOT_GATE";
  throw e;
}
function exactKeys(value,keys,label){
  if(!value||typeof value!=="object"||Array.isArray(value)||
    Object.keys(value).sort().join("|")!==[...keys].sort().join("|")){
    fail(label+" has missing/extra fields");
  }
}
function stableOrder(text){
  // Deterministic fixture shuffling only; NOT security-grade anonymity.
  let h=2166136261;
  for(const ch of text){
    h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;
  }
  return h;
}
function fixtureRows(fixtures){
  if(!fixtures||fixtures.schema_version!==1||
    fixtures.fixture_type!=="synthetic_product_018_reviewer_triage_cases"||
    !Array.isArray(fixtures.cases)||fixtures.cases.length!==8){
    fail("expected exactly eight controlled synthetic Product 018 cases");
  }
  const seen=new Set();
  return [...fixtures.cases].map(row=>{
    if(!row||typeof row.id!=="string"||seen.has(row.id)||
      !/^[a-z][a-z0-9_]{3,70}$/.test(row.id)||
      !DECISIONS.includes(row.expected_review_decision)||
      !ACTIONS.includes(row.expected_next_action)){
      fail("invalid or duplicate synthetic ground-truth case");
    }
    seen.add(row.id);
    const brief=summarize(row.input);
    if(brief.conservative_reviewer_decision!==row.expected_review_decision||
       brief.next_action_code!==row.expected_next_action){
      fail("fixture ground truth and safety prototype disagree");
    }
    return {row,brief};
  }).sort((a,b)=>
    stableOrder(a.row.id)-stableOrder(b.row.id)||a.row.id.localeCompare(b.row.id));
}
function presentation(item,arm){
  const output=item.brief;
  const statuses=output.source_check_statuses;
  const decision=arm==="baseline"?item.row.input.decision:
    output.conservative_reviewer_decision;
  const guidance=arm==="baseline"
    ?"Use the current workflow to interpret the reported decision, reason codes and source statuses."
    :output.next_action_text;
  return {
    reported_decision:decision,
    reason_codes:[...output.reason_codes],
    source_statuses:{registry:statuses.registry,ofac:statuses.ofac,domain:statuses.domain},
    source_failed:output.observed_source_failure_count>0||item.row.input.chargeable===false,
    reviewer_note:guidance,
    warning:"This record is a synthetic review signal, not sanctions clearance or an approval to contract."
  };
}
function assignments(fixtures){
  const rows=fixtureRows(fixtures),assignments=[];
  for(let i=0;i<rows.length;i++){
    for(let slot=0;slot<REVIEWER_SLOTS.length;slot++){
      // Each case is reviewed once in each arm, by distinct reviewer slots.
      // Each slot receives 4 baseline and 4 candidate presentations.
      const arm=(i+slot)%2===0?"baseline":"candidate";
      assignments.push({
        assignment_id:"P018_"+REVIEWER_SLOTS[slot]+"_"+String(i+1).padStart(3,"0"),
        reviewer_slot:REVIEWER_SLOTS[slot],
        arm,
        case_index:i,
        row:rows[i].row,
        brief:rows[i].brief,
        display:presentation(rows[i],arm)
      });
    }
  }
  if(assignments.length!==16)fail("incorrect pilot assignment count");
  return assignments;
}
function buildPilot(fixtures){
  const all=assignments(fixtures);
  const tasks=Object.fromEntries(REVIEWER_SLOTS.map(slot=>[
    slot,all.filter(x=>x.reviewer_slot===slot).map(x=>({
      assignment_id:x.assignment_id,
      task:"Read this synthetic vendor-screening summary. Choose a decision and the next reviewer action, then record independently timed task duration.",
      review_options:{decisions:DECISIONS,next_actions:ACTIONS},
      display:x.display
    }))
  ]));
  const safetyBaseline=all.filter(x=>x.arm==="baseline"&&
    x.row.input.decision==="proceed"&&x.row.expected_review_decision!=="proceed").length;
  const safetyCandidate=all.filter(x=>x.arm==="candidate"&&
    x.brief.conservative_reviewer_decision==="proceed"&&x.row.expected_review_decision!=="proceed").length;
  return {
    schema_version:1,
    report_type:"SYNTHETIC_MASKED_PILOT_PACKET_NOT_REAL_BLIND_STUDY",
    synthetic_cases:8,
    reviewer_slots:2,
    assignments:16,
    cases_in_proposed_full_experiment:40,
    masked_presentation_only_not_cryptographically_blinded:true,
    public_fixture_labels_withheld_from_packet:true,
    personally_identifying_reviewer_data_permitted:false,
    reviewer_observations_collected:false,
    measured_reviewer_time_seconds:null,
    verified_external_buyer_outcomes:null,
    pilot_automated_regression_only:{
      baseline_raw_false_proceed_on_synthetic_gold:safetyBaseline,
      prototype_false_proceed_on_synthetic_gold:safetyCandidate,
      independently_heldout_ground_truth:false
    },
    studies:tasks,
    release_status:"HOLD_SYNTHETIC_PILOT_ONLY",
    production_or_price_changes_authorized:false,
    product_025_unlock_evidence:false
  };
}
function median(numbers){
  if(!numbers.length)return null;
  const values=[...numbers].sort((a,b)=>a-b);
  const mid=Math.floor(values.length/2);
  return values.length%2?values[mid]:(values[mid-1]+values[mid])/2;
}
function scoreObservations(fixtures,observations){
  const map=new Map(assignments(fixtures).map(x=>[x.assignment_id,x]));
  if(!Array.isArray(observations)||observations.length>map.size){
    fail("observations must be an array no longer than the masked pilot");
  }
  const seen=new Set(),results=[];
  for(const obs of observations){
    exactKeys(obs,FIELDS,"reviewer response");
    const planned=map.get(obs.assignment_id);
    if(!planned||obs.reviewer_slot!==planned.reviewer_slot||
       seen.has(obs.assignment_id)||!DECISIONS.includes(obs.selected_decision)||
       !ACTIONS.includes(obs.selected_next_action)||
       !Number.isFinite(obs.elapsed_seconds)||
       obs.elapsed_seconds<1||obs.elapsed_seconds>3600){
      fail("invalid, duplicate, excessive, or unassigned reviewer response");
    }
    seen.add(obs.assignment_id);
    results.push({
      arm:planned.arm,
      correct_decision:obs.selected_decision===planned.row.expected_review_decision,
      correct_next_action:obs.selected_next_action===planned.row.expected_next_action,
      incorrect_proceed:obs.selected_decision==="proceed"&&
        planned.row.expected_review_decision==="human_review",
      duration:obs.elapsed_seconds
    });
  }
  const complete=results.length===map.size;
  const armMetrics=Object.fromEntries(["baseline","candidate"].map(arm=>{
    const matched=results.filter(x=>x.arm===arm);
    return [arm,{
      completed:matched.length,
      synthetic_gold_decision_matches:complete?matched.filter(x=>x.correct_decision).length:null,
      synthetic_gold_next_action_matches:complete?matched.filter(x=>x.correct_next_action).length:null,
      incorrect_proceed_on_synthetic_gold:complete?matched.filter(x=>x.incorrect_proceed).length:null,
      self_reported_median_task_seconds:complete?median(matched.map(x=>x.duration)):null
    }];
  }));
  return {
    schema_version:1,
    source:"UNVERIFIED_REVIEWER_SUBMISSION",
    count:results.length,
    required_count:map.size,
    complete,
    arms:armMetrics,
    actual_independent_reviewer_identity_verified:false,
    independently_heldout_real_world_gold_verified:false,
    sufficient_40_case_blind_trial:false,
    buyer_value_proven:false,
    commercialization_authorized:false,
    release_decision:"HOLD_REQUIRES_INDEPENDENT_BUYER_VALIDATION",
    product_025_unlock_evidence:false
  };
}
function protocol(){
  return [
    "# Product 018 — masked reviewer pilot protocol",
    "",
    "This is a **synthetic eight-case pilot**, not an independently blinded real-buyer efficacy study. The planned buyer experiment needs at least **40 properly sampled cases** and **two independently recruited reviewers**; neither requirement is met by these fixtures.",
    "",
    "## How to run a controlled pilot",
    "",
    "1. A coordinator privately distributes each slot's eight tasks from \`018_MASKED_PILOT_PACKET.json\`; do **not** distribute the original golden fixture file to reviewers.",
    "2. The task records are masked as to which arm is the original raw product and which is the prototype. Differences in presentation can still reveal the arm; masking is **not cryptographic blinding** or protection from repository readers.",
    "3. Reviewers choose a decision and action code from the packet and record their own task time in seconds. Record no customer names, account information, payment signatures, emails, or addresses in submissions.",
    "4. The coordinator stores reviewer responses **outside the Git repository** and may run \`node quality/benchmarks/018-masked-pilot.js --score /private/018-observations.json\` to obtain aggregate diagnostics. This command prints no raw observations or personally identifying information.",
    "5. Compare safely against the documented original/manual workflow using independent held-out ground truth. Do not equate a scorer's synthetic labels with externally validated accuracy, time savings, real demand, revenue, or profitability.",
    "",
    "## Current synthetic regression",
    "",
    "The deliberately contradictory baseline fixtures contain **2 raw proceed decisions** that their synthetic expected review labels mark as requiring review. The prototype flags both. This is regression coverage only; no real failure rate is estimated.",
    "",
    "## Mandatory gates",
    "",
    "- Any incorrect proceed requires escalation and blocks automatic advancement.",
    "- No measured reviewer-time or conversion gain is claimed without genuine private observations and independent provenance.",
    "- Product 018's historical $0.000690 per-call headroom is not an actual cost allowance; current hosting, source fees, refunds and settlement pricing must be independently verified.",
    "- Release remains HOLD with no price, payment, wallet or production changes and no Product 025+ unlock.",
    ""
  ].join("\n");
}
function serialize(fixtures=JSON.parse(fs.readFileSync(FIXTURES,"utf8"))){
  return {
    "018_MASKED_PILOT_PACKET.json":JSON.stringify(buildPilot(fixtures),null,2)+"\n",
    "018_MASKED_PILOT_PROTOCOL.md":protocol()
  };
}
function execute(mode,artifacts=serialize()){
  if(!["check","write"].includes(mode))fail("expected --check or --write");
  if(mode==="write")fs.mkdirSync(OUT_DIR,{recursive:true});
  for(const [name,content] of Object.entries(artifacts)){
    const target=path.join(OUT_DIR,name);
    if(mode==="check"){
      if(!fs.existsSync(target)||fs.readFileSync(target,"utf8")!==content){
        fail("stale masked pilot artifact: "+name);
      }
    }else fs.writeFileSync(target,content,"utf8");
  }
  return {ok:true,mode,syntheticCases:8,realBuyerMeasurements:0};
}
if(require.main===module){
  try{
    const args=process.argv.slice(2);
    if(args.length===1&&["--check","--write"].includes(args[0])){
      process.stdout.write(JSON.stringify(execute(args[0].slice(2)))+"\n");
    }else if(args.length===2&&args[0]==="--score"){
      const data=JSON.parse(fs.readFileSync(args[1],"utf8"));
      const report=scoreObservations(JSON.parse(fs.readFileSync(FIXTURES,"utf8")),data);
      process.stdout.write(JSON.stringify(report,null,2)+"\n");
    }else fail("use --check, --write, or --score /private/observations.json");
  }catch(e){process.stderr.write(String(e.message)+"\n");process.exitCode=1;}
}
module.exports={REVIEWER_SLOTS,ACTIONS,fixtureRows,presentation,assignments,buildPilot,
  median,scoreObservations,protocol,serialize,execute};
