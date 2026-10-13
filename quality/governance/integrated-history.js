"use strict";

// Read-only integration proof for independent PR #18 source-history recovery,
// transplanted into the PR #21-based staging candidate. Exact Git blob bytes
// are verified locally. Real GitHub PR state and exact CI are checked via the
// existing allowlisted metadata reader. No merges, payments, source requests.
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {fetchGithubJson,latestExactHeadRun,CI,PUBLIC}=require("./release-chain");

const ROOT=path.resolve(__dirname,"../..");
const MANIFEST=path.join(__dirname,"integrated-history.json");
const REQUIRED_PATHS=Object.freeze([
  "quality/benchmarks/018-baseline-continuity.js",
  "quality/benchmarks/018-baseline-continuity.test.js",
  "quality/benchmarks/018-live-source-probe.js",
  "quality/benchmarks/018-live-source-probe.test.js"
]);
const WORKFLOW=".github/workflows/factory-018-live-source-smoke.yml";
function fail(message){
  const e=new Error("INTEGRATED_HISTORY_GATE: "+message);
  e.code="INTEGRATED_HISTORY_GATE";
  throw e;
}
function exact(object,fields,label){
  if(!object||typeof object!=="object"||Array.isArray(object)||
     Object.keys(object).sort().join("|")!==[...fields].sort().join("|")){
    fail(label+" includes unreviewed or missing fields");
  }
}
function validateManifest(m){
  exact(m,[
    "schema_version","report_type","repository","integration_target",
    "source_history_branch","critical_files","schedule_default_branch_active",
    "verified_external_customers","authenticated_real_payment",
    "price_wallet_production_changes_authorized","product_025_unlocked"
  ],"manifest");
  if(m.schema_version!==1||
     m.report_type!=="PINNED_SIDE_BRANCH_SOURCE_HISTORY_INTEGRATION"||
     m.repository!=="P00NSMASHER/x402-product-factory"||
     m.schedule_default_branch_active!==false||
     m.verified_external_customers!==null||
     m.authenticated_real_payment!==null||
     m.price_wallet_production_changes_authorized!==false||
     m.product_025_unlocked!==false){
    fail("unsafe side-branch integration metadata");
  }
  exact(m.integration_target,["pr_number","head_branch","reviewed_head_sha"],"integration target");
  const target=m.integration_target;
  if(target.pr_number!==21||
     target.head_branch!=="factory/ofac-refresh-failclosed-20261012"||
     target.reviewed_head_sha!=="0d9a9796cad369dfc3add73cd94ed91c88242ceb"){
    fail("unexpected source-safety integration target pin");
  }
  exact(m.source_history_branch,[
    "pr_number","head_branch","base_branch","base_sha","reviewed_head_sha",
    "required_workflows"
  ],"source history branch");
  const origin=m.source_history_branch;
  if(origin.pr_number!==18||
     origin.head_branch!=="factory/018-source-history-continuity-20261012"||
     origin.base_branch!=="factory/018-public-source-drift-watch-20261012"||
     origin.base_sha!=="fc7079ac215d699479162e868550f172798ecd24"||
     origin.reviewed_head_sha!=="1a5059fa584a30ad6fd410c96cfeda5851394010"||
     !Array.isArray(origin.required_workflows)||
     origin.required_workflows.join("|")!==[CI,PUBLIC].join("|")){
    fail("independent history source branch changed");
  }
  if(!Array.isArray(m.critical_files)||
     m.critical_files.length!==REQUIRED_PATHS.length){
    fail("incomplete exact-file ancestry proof");
  }
  for(let i=0;i<REQUIRED_PATHS.length;i++){
    const item=m.critical_files[i];
    exact(item,["path","expected_git_blob_sha"],"pinned source file");
    if(item.path!==REQUIRED_PATHS[i]||
       !/^[a-f0-9]{40}$/.test(item.expected_git_blob_sha)){
      fail("unexpected source-history file pin");
    }
  }
  return m;
}
function gitBlobSha(contents){
  const bytes=Buffer.isBuffer(contents)?contents:Buffer.from(contents);
  return crypto.createHash("sha1")
    .update(Buffer.from("blob "+bytes.length+"\0","utf8"))
    .update(bytes).digest("hex");
}
function checkLocal(m,{readFile=fs.readFileSync}={}){
  validateManifest(m);
  const equal=[];
  for(const item of m.critical_files){
    let actual;
    try{
      actual=gitBlobSha(readFile(path.join(ROOT,item.path)));
    }catch{
      fail("source-history module missing or unreadable");
    }
    if(actual!==item.expected_git_blob_sha){
      fail("source-history implementation differs from independently reviewed PR #18");
    }
    equal.push({path:item.path,git_blob_sha_matches:true});
  }
  let workflow;
  try{workflow=String(readFile(path.join(ROOT,WORKFLOW)))}catch{
    fail("source history monitoring workflow unavailable");
  }
  // The PR #20 integration reconciled CI and workflow text intentionally.
  // Ensure the actual fail-closed recovery controls remain wired, rather
  // than incorrectly requiring byte-for-byte workflow text equivalence.
  for(const required of [
    "018-baseline-continuity.js --restore",
    "018-baseline-continuity.js --verify",
    "018-baseline-continuity.test.js",
    "factory-018-redacted-source-observation",
    "history.json",
    "if: always()",
    "actions: read"
  ]){
    if(!workflow.includes(required)){
      fail("integrated history monitor is missing a required safeguard");
    }
  }
  return {
    schema_version:1,
    scope:"PINNED_SOURCE_HISTORY_REVIEWED_BLOB_EQUIVALENCE",
    reviewed_pr_number:18,
    target_pr_number:21,
    identical_critical_source_files:equal.length,
    reviewed_file_blobs:equal,
    integrated_history_recovery_wired:true,
    live_pr18_head_ci_independently_verified:false,
    production_release_authorized:false,
    source_monitor_schedule_activated:false,
    product_025_unlocked:false,
    review_status:"HOLD_PENDING_GITHUB_PR_AND_CI_PROVENANCE"
  };
}
function checkRemote(m,{pr,runs}){
  validateManifest(m);
  const source=m.source_history_branch;
  if(!pr||pr.number!==18||
     pr.head?.sha!==source.reviewed_head_sha||
     pr.head?.ref!==source.head_branch||
     pr.base?.ref!==source.base_branch||
     pr.base?.sha!==source.base_sha||
     pr.state!=="open"||pr.draft!==true||
     pr.merged===true||pr.merged_at!=null||
     pr.mergeable!==true){
    fail("side-branch source PR head or review state changed");
  }
  for(const name of source.required_workflows){
    const exactRun=latestExactHeadRun(runs,{
      head_ref:source.head_branch,
      pinned_head_sha:source.reviewed_head_sha
    },name);
    if(exactRun?.status!=="completed"||exactRun.conclusion!=="success"){
      fail("reviewed source-history exact-head workflow is not green");
    }
  }
  return {
    reviewed_pr_number:18,
    reviewed_head_matches:true,
    reviewed_base_matches:true,
    exact_head_workflows_passed:source.required_workflows.length,
    source_history_copy_independently_verified:true,
    merged_into_default_branch:false,
    commercial_release_authorized:false
  };
}
async function checkLive(m,{
  token=process.env.GITHUB_TOKEN,fetchImpl=fetch
}={}){
  checkLocal(m);
  const scope="/repos/"+m.repository;
  const sha=m.source_history_branch.reviewed_head_sha;
  const [pr,result]=await Promise.all([
    fetchGithubJson(scope+"/pulls/18",{token,fetchImpl}),
    fetchGithubJson(scope+"/actions/runs?head_sha="+sha+
      "&per_page=50",{token,fetchImpl})
  ]);
  return checkRemote(m,{pr,runs:result?.workflow_runs});
}
if(require.main===module){
  (async()=>{
    const mode=process.argv[2];
    if(process.argv.length!==3||!["--check","--audit-live"].includes(mode)){
      fail("expected --check or --audit-live");
    }
    const m=JSON.parse(fs.readFileSync(MANIFEST,"utf8"));
    const staticProof=checkLocal(m);
    let remoteProof=null;
    if(mode==="--audit-live")remoteProof=await checkLive(m);
    process.stdout.write(JSON.stringify({
      ok:true,
      exact_blobs_matched:staticProof.identical_critical_source_files,
      integrated_history_controls_present:true,
      upstream_source_pr18_live_checks_passed:remoteProof!==null,
      external_payment_or_buyer_data_accessed:false,
      production_authorization:false,
      product_025_unlocked:false,
      result:"HOLD_MANUAL_SECURITY_FINANCIAL_AND_BUYER_REVIEW"
    },null,2)+"\n");
  })().catch(error=>{
    // No PR bodies, tokens, signed OFAC URLs or user data in audit output.
    process.stderr.write(error?.code==="INTEGRATED_HISTORY_GATE"
      ?"INTEGRATED_HISTORY_HOLD\n":"INTEGRATED_HISTORY_UNAVAILABLE\n");
    process.exitCode=2;
  });
}
module.exports={ROOT,MANIFEST,REQUIRED_PATHS,WORKFLOW,
  validateManifest,gitBlobSha,checkLocal,checkRemote,checkLive};
