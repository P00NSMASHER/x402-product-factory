"use strict";

// Read-only upstream release-chain audit. Verifies code/dependency and
// exact-head CI provenance; never treats a passing stack as launch approval.
const fs=require("node:fs");
const path=require("node:path");
const MANIFEST=path.join(__dirname,"release-chain.json");
const REPOSITORY="P00NSMASHER/x402-product-factory";
const IDS=Object.freeze([2,5,6,7,8,9,11,13,14,16,17,19,20,21]);
const CI="Factory product CI";
const PUBLIC="Factory 018 public source compatibility";
const CI_PATH=Object.freeze({
  [CI]:".github/workflows/factory-pa-vendor-gate-ci.yml",
  [PUBLIC]:".github/workflows/factory-018-live-source-smoke.yml"
});
const EVIDENCE_KEYS=Object.freeze([
  "independent_external_buyer_validation",
  "independently_heldout_product_018_decision_accuracy",
  "actual_reconciled_facilitator_settlement",
  "actual_upstream_hosting_refund_unit_economics",
  "independent_security_privacy_review",
  "human_production_release_approval",
  "product_025_unlock"
]);
const NODE_KEYS=Object.freeze([
  "number","head_ref","base_ref","pinned_head_sha","required_workflows"
]);
function fail(msg){
  const error=new Error("RELEASE_CHAIN_GATE: "+msg);
  error.code="RELEASE_CHAIN_GATE";
  throw error;
}
function exactFields(obj,fields,label){
  if(!obj||typeof obj!=="object"||Array.isArray(obj)||
     Object.keys(obj).sort().join("|")!==[...fields].sort().join("|")){
    fail(label+" has undeclared/missing fields");
  }
}
function validateManifest(doc){
  exactFields(doc,["schema_version","repository","default_branch",
    "evaluation_scope","invariant","chain","external_release_evidence"],"manifest");
  if(doc.schema_version!==1||doc.repository!==REPOSITORY||
     doc.default_branch!=="main"||
     doc.evaluation_scope!=="UPSTREAM_DRAFT_PR_STACK_ONLY"||
     doc.invariant!=="NO_AUTOMATED_MERGE_DEPLOY_OR_COMMERCIAL_RELEASE"||
     !Array.isArray(doc.chain)||doc.chain.length!==IDS.length){
    fail("invalid or incomplete upstream stack specification");
  }
  const found=new Set();
  for(let i=0;i<doc.chain.length;i++){
    const c=doc.chain[i],expected=IDS[i];
    exactFields(c,NODE_KEYS,"PR node");
    if(c.number!==expected||found.has(c.number)||
       !/^[0-9a-f]{40}$/.test(c.pinned_head_sha)||
       !/^factory\/[a-z0-9-]{5,100}$/.test(c.head_ref)||
       found.has(c.head_ref)||
       c.base_ref!==(i===0?"main":doc.chain[i-1].head_ref)){
      fail("wrong PR order, parent branch, pin, or duplicate node");
    }
    found.add(c.number);found.add(c.head_ref);
    const workflows=[13,14].includes(c.number)?[CI,PUBLIC]:[CI];
    if(!Array.isArray(c.required_workflows)||
       c.required_workflows.join("|")!==workflows.join("|")){
      fail("missing or substituted required exact-head workflow");
    }
  }
  exactFields(doc.external_release_evidence,EVIDENCE_KEYS,"external evidence");
  for(const k of EVIDENCE_KEYS){
    if(k==="product_025_unlock"){
      if(doc.external_release_evidence[k]!==false)fail("Product 025+ freeze bypass");
    }else if(doc.external_release_evidence[k]!==null){
      fail("unverifiable external approval cannot be asserted in repo manifest");
    }
  }
  return doc;
}
function finding(code,number){
  return {code,pr_number:number};
}
function latestExactHeadRun(runs,node,name){
  if(!Array.isArray(runs))return null;
  const matching=runs.filter(r=>
    r&&r.name===name&&
    r.head_sha===node.pinned_head_sha&&
    r.head_branch===node.head_ref&&
    r.event==="pull_request"&&
    r.path===CI_PATH[name]&&
    Number.isSafeInteger(r.id)&&r.id>0
  );
  matching.sort((a,b)=>b.id-a.id);
  return matching[0]||null;
}
function evaluate(doc,snapshot,{observedAt="2026-10-12T17:00:00.000Z"}={}){
  validateManifest(doc);
  if(!snapshot||typeof snapshot!=="object"||!snapshot.pulls||
     !snapshot.runs||!snapshot.comparisons||
     typeof observedAt!=="string"||
     !Number.isFinite(Date.parse(observedAt))){
    fail("missing or untrusted read-only audit inputs");
  }
  const findings=[],prs=[],checks=[];
  for(let i=0;i<doc.chain.length;i++){
    const node=doc.chain[i];
    const pr=snapshot.pulls[String(node.number)];
    const parent=i===0?null:doc.chain[i-1];
    const status={
      pr_number:node.number,
      expected_base_ref:node.base_ref,
      head_pin_matches:false,
      base_ref_matches:false,
      parent_head_sha_matches:parent===null?null:false,
      ancestry_verified:parent===null?null:false,
      ci_exact_head_verified:false,
      checked_required_workflows:[...node.required_workflows],
      draft_unmerged:false,
      mergeability:"UNDETERMINED"
    };
    if(!pr||pr.number!==node.number){
      findings.push(finding("PR_READ_FAILED_OR_MISSING",node.number));
    }else{
      status.head_pin_matches=pr.head?.sha===node.pinned_head_sha&&
        pr.head?.ref===node.head_ref;
      if(!status.head_pin_matches)findings.push(finding("HEAD_PIN_DRIFT",node.number));
      status.base_ref_matches=pr.base?.ref===node.base_ref;
      if(!status.base_ref_matches)findings.push(finding("BASE_REF_DRIFT",node.number));
      status.draft_unmerged=pr.state==="open"&&pr.draft===true&&
        pr.merged!==true&&pr.merged_at==null;
      if(!status.draft_unmerged)findings.push(finding("PR_STATE_CHANGED",node.number));
      if(pr.mergeable===false){
        status.mergeability="CONFLICT_REPORTED";
        findings.push(finding("MERGE_CONFLICT_REVIEW",node.number));
      }else if(pr.mergeable===true){
        status.mergeability="MERGEABLE_AS_REPORTED";
      }else{
        findings.push(finding("MERGEABILITY_UNDETERMINED",node.number));
      }
      if(parent){
        status.parent_head_sha_matches=pr.base?.sha===parent.pinned_head_sha;
        if(!status.parent_head_sha_matches){
          findings.push(finding("PARENT_REF_SHA_DRIFT",node.number));
        }
      }
    }
    if(parent){
      const compare=snapshot.comparisons[String(node.number)];
      status.ancestry_verified=compare?.status==="ahead"&&
        compare.behind_by===0&&
        Number.isSafeInteger(compare.ahead_by)&&compare.ahead_by>=1;
      if(!status.ancestry_verified){
        findings.push(finding("STACK_ANCESTRY_BROKEN",node.number));
      }
    }
    const exactRuns=snapshot.runs[String(node.number)];
    const checkRows=[];
    for(const workflow of node.required_workflows){
      const run=latestExactHeadRun(exactRuns,node,workflow);
      const ok=run?.status==="completed"&&run?.conclusion==="success";
      checkRows.push({workflow,
        exact_head_success:ok,
        confirmed_run_id:ok?run.id:null
      });
      if(!ok){
        findings.push(finding(
          run?"EXACT_HEAD_WORKFLOW_NOT_GREEN":"EXACT_HEAD_WORKFLOW_MISSING",
          node.number
        ));
      }
    }
    status.ci_exact_head_verified=checkRows.every(c=>c.exact_head_success);
    prs.push(status);
    checks.push({pr_number:node.number,checks:checkRows});
  }
  const duplicates=new Set(findings.map(f=>f.code+"|"+f.pr_number));
  if(duplicates.size!==findings.length)fail("duplicate release-chain finding");
  return {
    schema_version:1,
    report_type:"READ_ONLY_UPSTREAM_STACK_INTEGRITY_NOT_RELEASE_APPROVAL",
    repository:REPOSITORY,
    observed_at_utc:new Date(observedAt).toISOString(),
    upstream_draft_pr_count:doc.chain.length,
    upstream_workflow_requirements_checked:checks.reduce(
      (n,x)=>n+x.checks.length,0
    ),
    stack_integrity_verified:findings.length===0,
    findings,
    pull_requests:prs,
    exact_head_workflow_checks:checks,
    all_external_commercial_release_evidence_still_unverified:true,
    verified_external_buyers:null,
    actual_payment_settlement_reconciliation:null,
    full_unit_economics:null,
    independent_security_privacy_signoff:null,
    human_production_approval:null,
    source_drift_schedule_active_on_default_branch:false,
    production_release_authorized:false,
    merges_or_deployments_performed:0,
    product_025_unlocked:false,
    release_status:findings.length
      ?"BLOCK_REVIEW_RELEASE_CHAIN_INTEGRITY"
      :"HOLD_MANUAL_RELEASE_AND_INDEPENDENT_EVIDENCE"
  };
}
function markdown(report){
  const lines=[
    "# Product Factory — upstream stacked PR integrity",
    "",
    "- Upstream draft PRs: **"+report.upstream_draft_pr_count+"**.",
    "- Exact-head required workflow checks: **"+
      report.upstream_workflow_requirements_checked+"**.",
    "- Dependency/CI verification: **"+
      (report.stack_integrity_verified?"PASS_READ_ONLY_STRUCTURE":"BLOCK_INTEGRITY_REVIEW")+"**.",
    "- **Production authorization: NONE.** All linked PRs remain drafts;",
    "  manual security/privacy, independent buyer, actual payment and full unit",
    "  economics approvals remain unverified.",
    "- GitHub scheduled source monitoring in draft PR #14 **is not active**",
    "  on the default branch.",
    "",
    "| PR | SHA pin | Base | Exact-head CI | Ancestry | Mergeability |",
    "|---:|---|---|---|---|---|"
  ];
  for(const row of report.pull_requests){
    lines.push("| #"+row.pr_number+" | "+
      (row.head_pin_matches?"match":"DRIFT")+" | "+
      (row.base_ref_matches?"match":"DRIFT")+" | "+
      (row.ci_exact_head_verified?"passed":"HOLD")+" | "+
      (row.ancestry_verified===null?"root":row.ancestry_verified?"ahead":"DRIFT")+" | "+
      row.mergeability+" |");
  }
  if(report.findings.length){
    lines.push("","## Hold reasons","");
    for(const f of report.findings){
      lines.push("- PR #"+f.pr_number+": \`"+f.code+"\`");
    }
  }
  lines.push("","**"+report.release_status+"**","",
    "This report is GitHub metadata and QA provenance only. It cannot",
    "validate legal/sanctions decisions, data freshness, real buyer demand,",
    "paid transaction settlement, operating profitability or production safety.",
    "It cannot merge or deploy anything. Product 025+ stays frozen.","");
  return lines.join("\n");
}
async function fetchGithubJson(apiPath,{fetchImpl=fetch,token}={}){
  if(typeof token!=="string"||token.length<15){
    fail("GitHub read-only audit token unavailable");
  }
  if(!/^\/repos\/P00NSMASHER\/x402-product-factory\/(pulls\/\d+|actions\/runs\?head_sha=[a-f0-9]{40}&per_page=50|compare\/[a-f0-9]{40}\.\.\.[a-f0-9]{40})$/.test(apiPath)){
    fail("unapproved GitHub API read path");
  }
  const url="https://api.github.com"+apiPath;
  let r;
  try{
    r=await fetchImpl(url,{
      method:"GET",redirect:"error",
      headers:{
        "authorization":"Bearer "+token,
        "accept":"application/vnd.github+json",
        "x-github-api-version":"2022-11-28",
        "user-agent":"x402-factory-draft-stack-audit"
      },
      signal:AbortSignal.timeout(12000)
    });
  }catch{fail("read-only GitHub API check failed");}
  if(!r||r.ok!==true)fail("GitHub read-only metadata unavailable");
  const length=r.headers?.get?.("content-length");
  if(length&&Number(length)>2000000)fail("unbounded GitHub response");
  let data;
  try{
    const body=await r.text();
    if(body.length>2000000)fail("unbounded GitHub response");
    data=JSON.parse(body);
  }catch{fail("invalid GitHub metadata response");}
  return data;
}
async function collectLive(doc,{fetchImpl=fetch,token}={}){
  validateManifest(doc);
  const base="/repos/"+REPOSITORY;
  const pulls={},runs={},comparisons={};
  // Bounded sequential batches avoid flooding the GitHub API.
  for(let i=0;i<doc.chain.length;i+=3){
    const group=doc.chain.slice(i,i+3);
    const rows=await Promise.all(group.map(async n=>{
      const [pr,history]=await Promise.all([
        fetchGithubJson(base+"/pulls/"+n.number,{fetchImpl,token}),
        fetchGithubJson(base+"/actions/runs?head_sha="+n.pinned_head_sha+
          "&per_page=50",{fetchImpl,token})
      ]);
      return {n,pr,history};
    }));
    for(const {n,pr,history} of rows){
      pulls[n.number]=pr;
      runs[n.number]=history.workflow_runs;
    }
  }
  for(let i=1;i<doc.chain.length;i+=3){
    const group=doc.chain.slice(i,i+3);
    const values=await Promise.all(group.map(n=>{
      const prev=doc.chain[doc.chain.indexOf(n)-1];
      return fetchGithubJson(base+"/compare/"+prev.pinned_head_sha+
        "..."+n.pinned_head_sha,{fetchImpl,token});
    }));
    group.forEach((n,j)=>{
      comparisons[n.number]={
        status:values[j].status,
        ahead_by:values[j].ahead_by,
        behind_by:values[j].behind_by
      };
    });
  }
  return {pulls,runs,comparisons};
}
async function auditLive(doc,{
  fetchImpl=fetch,token=process.env.GITHUB_TOKEN,
  observedAt=new Date().toISOString()
}={}){
  const snapshot=await collectLive(doc,{fetchImpl,token});
  return evaluate(doc,snapshot,{observedAt});
}
if(require.main===module){
  (async()=>{
    if(process.argv.length!==3||process.argv[2]!=="--audit-live"){
      fail("use --audit-live for read-only GitHub pull/CI/ancestry checks");
    }
    const doc=JSON.parse(fs.readFileSync(MANIFEST,"utf8"));
    const report=await auditLive(doc);
    const body=markdown(report);
    if(process.env.GITHUB_STEP_SUMMARY){
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,body,"utf8");
    }
    process.stdout.write(JSON.stringify({
      schema_version:report.schema_version,
      stack_integrity_verified:report.stack_integrity_verified,
      checked_prs:report.upstream_draft_pr_count,
      checked_workflows:report.upstream_workflow_requirements_checked,
      findings:report.findings,
      release_status:report.release_status,
      production_release_authorized:false,
      product_025_unlocked:false
    },null,2)+"\n");
    if(!report.stack_integrity_verified)process.exitCode=2;
  })().catch(error=>{
    // Never log request metadata, credentials, PR bodies or GitHub tokens.
    process.stderr.write(
      error?.code==="RELEASE_CHAIN_GATE"
        ?"RELEASE_CHAIN_READONLY_HOLD\n"
        :"RELEASE_CHAIN_UNAVAILABLE\n"
    );
    process.exitCode=2;
  });
}
module.exports={
  IDS,CI,PUBLIC,CI_PATH,EVIDENCE_KEYS,NODE_KEYS,
  validateManifest,latestExactHeadRun,evaluate,markdown,
  fetchGithubJson,collectLive,auditLive
};
