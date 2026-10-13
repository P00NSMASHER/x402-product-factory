"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const doc=require("./release-chain.json");
const chain=require("./release-chain");
const clone=x=>structuredClone(x);
function snapshot(){
  const pulls={},runs={},comparisons={};
  for(let i=0;i<doc.chain.length;i++){
    const item=doc.chain[i];
    pulls[item.number]={
      number:item.number,state:"open",draft:true,merged:false,merged_at:null,
      mergeable:true,mergeable_state:"clean",
      head:{ref:item.head_ref,sha:item.pinned_head_sha},
      base:{ref:item.base_ref,sha:i?doc.chain[i-1].pinned_head_sha:"exampleMainSha"}
    };
    runs[item.number]=item.required_workflows.map((name,k)=>({
      id:200000+i*10+k,name,event:"pull_request",status:"completed",
      conclusion:"success",head_sha:item.pinned_head_sha,
      head_branch:item.head_ref,path:chain.CI_PATH[name]
    }));
    if(i)comparisons[item.number]={status:"ahead",ahead_by:2,behind_by:0};
  }
  return {pulls,runs,comparisons};
}
test("all fourteen integrated-chain PRs have pinned ancestry and exact-head workflow evidence",()=>{
  assert.equal(chain.validateManifest(doc),doc);
  assert.deepEqual(doc.chain.map(p=>p.number),chain.IDS);
  const result=chain.evaluate(doc,snapshot());
  assert.equal(result.stack_integrity_verified,true);
  assert.equal(result.upstream_draft_pr_count,14);
  assert.equal(result.upstream_workflow_requirements_checked,16);
  assert.deepEqual(result.findings,[]);
  assert.equal(result.release_status,"HOLD_MANUAL_RELEASE_AND_INDEPENDENT_EVIDENCE");
  assert.equal(result.production_release_authorized,false);
  assert.equal(result.source_drift_schedule_active_on_default_branch,false);
  assert.equal(result.product_025_unlocked,false);
  assert.equal(result.verified_external_buyers,null);
  assert.equal(result.actual_payment_settlement_reconciliation,null);
  assert.equal(result.human_production_approval,null);
  assert.match(chain.markdown(result),/Production authorization: NONE/);
});
test("upstream PR drift, bad mergeability or changed state blocks release",()=>{
  const changes=[
    [s=>{s.pulls[2].merged=true;}, "PR_STATE_CHANGED"],
    [s=>{s.pulls[2].draft=false;}, "PR_STATE_CHANGED"],
    [s=>{s.pulls[2].mergeable=false;}, "MERGE_CONFLICT_REVIEW"],
    [s=>{s.pulls[14].mergeable=null;}, "MERGEABILITY_UNDETERMINED"],
    [s=>{s.pulls[14].head.sha="a".repeat(40);}, "HEAD_PIN_DRIFT"],
    [s=>{s.pulls[14].base.ref="main";}, "BASE_REF_DRIFT"],
    [s=>{s.pulls[14].base.sha="a".repeat(40);}, "PARENT_REF_SHA_DRIFT"],
    [s=>{s.comparisons[14].status="diverged";}, "STACK_ANCESTRY_BROKEN"],
    [s=>{delete s.pulls[8];}, "PR_READ_FAILED_OR_MISSING"]
  ];
  for(const [change,expected] of changes){
    const s=snapshot();change(s);
    const report=chain.evaluate(doc,s);
    assert.equal(report.stack_integrity_verified,false,expected);
    assert.equal(report.release_status,"BLOCK_REVIEW_RELEASE_CHAIN_INTEGRITY");
    assert.ok(report.findings.some(x=>x.code===expected),expected);
    assert.equal(report.production_release_authorized,false);
  }
});
test("stale, spoofed or failed exact-head check cannot be accepted",()=>{
  const cases=[
    [s=>{s.runs[13]=s.runs[13].filter(r=>r.name!==chain.PUBLIC);},
      "EXACT_HEAD_WORKFLOW_MISSING"],
    [s=>{s.runs[14].find(r=>r.name===chain.PUBLIC).head_sha="b".repeat(40);},
      "EXACT_HEAD_WORKFLOW_MISSING"],
    [s=>{s.runs[14].find(r=>r.name===chain.CI).head_branch="forked-branch";},
      "EXACT_HEAD_WORKFLOW_MISSING"],
    [s=>{s.runs[14].find(r=>r.name===chain.CI).event="push";},
      "EXACT_HEAD_WORKFLOW_MISSING"],
    [s=>{s.runs[14].find(r=>r.name===chain.CI).path="wrong-workflow.yml";},
      "EXACT_HEAD_WORKFLOW_MISSING"],
    [s=>{s.runs[14].find(r=>r.name===chain.CI).status="in_progress";},
      "EXACT_HEAD_WORKFLOW_NOT_GREEN"],
    [s=>{s.runs[14].find(r=>r.name===chain.CI).conclusion="failure";},
      "EXACT_HEAD_WORKFLOW_NOT_GREEN"],
    [s=>{
      const green=s.runs[14].find(r=>r.name===chain.CI);
      s.runs[14].push({...green,id:green.id+900,status:"completed",conclusion:"failure"});
    },"EXACT_HEAD_WORKFLOW_NOT_GREEN"]
  ];
  for(const [mutation,code] of cases){
    const s=snapshot();mutation(s);
    const report=chain.evaluate(doc,s);
    assert.ok(report.findings.some(x=>x.code===code),code);
    assert.equal(report.production_release_authorized,false);
    assert.equal(report.stack_integrity_verified,false);
  }
});
test("manifest cannot self-declare buyer/payment approval or unlock Product 025",()=>{
  const mutation=[
    x=>{x.repository="untrusted/org";},
    x=>{x.default_branch="unsafe";},
    x=>{x.chain[4].base_ref="main";},
    x=>{x.chain[3].pinned_head_sha="not-a-sha";},
    x=>{x.chain[7].required_workflows=[chain.CI];},
    x=>{x.chain.push({...x.chain[8],number:25});},
    x=>{x.external_release_evidence.product_025_unlock=true;},
    x=>{x.external_release_evidence.actual_reconciled_facilitator_settlement=1;},
    x=>{x.external_release_evidence.human_production_release_approval=true;},
    x=>{x.unauthorized_auto_merge=true;}
  ];
  for(const mut of mutation){
    const d=clone(doc);mut(d);
    assert.throws(()=>chain.validateManifest(d),/RELEASE_CHAIN_GATE/);
  }
});
test("report never echoes body, arbitrary GitHub text, bearer tokens or PIIs",()=>{
  const s=snapshot();
  s.pulls[2].body="PRIVATE_SOURCE_TOKEN_DO_NOT_ECHO";
  s.pulls[14].head.ref="private@example.com";
  const r=chain.evaluate(doc,s),str=JSON.stringify(r)+chain.markdown(r);
  assert.equal(str.includes("PRIVATE_SOURCE_TOKEN_DO_NOT_ECHO"),false);
  assert.equal(str.includes("private@example.com"),false);
  assert.equal(r.production_release_authorized,false);
});
test("GitHub reader only permits fixed repository GET resources",async()=>{
  const sha=doc.chain[0].pinned_head_sha,paths=[
    "/repos/P00NSMASHER/x402-product-factory/pulls/2",
    "/repos/P00NSMASHER/x402-product-factory/actions/runs?head_sha="+sha+"&per_page=50",
    "/repos/P00NSMASHER/x402-product-factory/compare/"+sha+"..."+sha
  ];
  const calls=[];
  for(const pathname of paths){
    const result=await chain.fetchGithubJson(pathname,{
      token:"TEST_MOCK_GITHUB_TOKEN_DO_NOT_LOG",
      fetchImpl:async(url,options)=>{
        calls.push({url,options});
        return {ok:true,headers:{get(){return null}},async text(){return '{"safe":true}';}};
      }
    });
    assert.equal(result.safe,true);
  }
  assert.equal(calls.length,3);
  assert.ok(calls.every(x=>x.options.method==="GET"));
  assert.ok(calls.every(x=>new URL(x.url).hostname==="api.github.com"));
  for(const bad of [
    "/repos/other/repo/pulls/2",
    "/repos/P00NSMASHER/x402-product-factory/pulls/25?body=private",
    "/repos/P00NSMASHER/x402-product-factory/actions/runs?head_sha=NO&per_page=50",
    "/repos/P00NSMASHER/x402-product-factory/compare/../../secrets"
  ]){
    await assert.rejects(chain.fetchGithubJson(bad,{
      token:"TEST_MOCK_GITHUB_TOKEN_DO_NOT_LOG",
      fetchImpl:async()=>{throw Error("should not call unapproved URL");}
    }),/RELEASE_CHAIN_GATE/);
  }
});
test("mocked GitHub API audit captures parent comparisons and exact-source CI",async()=>{
  const s=snapshot(),requests=[];
  const prefix="/repos/P00NSMASHER/x402-product-factory";
  const fake=async(url,opts)=>{
    assert.equal(opts.method,"GET");
    requests.push(url);
    const parsed=new URL(url);
    assert.equal(parsed.origin,"https://api.github.com");
    const tail=parsed.pathname+parsed.search;
    const matchPull=tail.match(/^\/repos\/P00NSMASHER\/x402-product-factory\/pulls\/(\d+)$/);
    let response;
    if(matchPull){
      response=s.pulls[matchPull[1]];
    }else if(tail.includes("/actions/runs?")){
      const sha=parsed.searchParams.get("head_sha");
      const node=doc.chain.find(x=>x.pinned_head_sha===sha);
      response={workflow_runs:s.runs[node.number]};
    }else if(tail.includes("/compare/")){
      const target=tail.split("...").at(-1);
      const node=doc.chain.find(x=>x.pinned_head_sha===target);
      response=s.comparisons[node.number];
    }else throw new Error("unknown fake GitHub resource");
    return {ok:true,headers:{get(){return null}},async text(){return JSON.stringify(response);}};
  };
  const report=await chain.auditLive(doc,{
    fetchImpl:fake,token:"TEST_MOCK_GITHUB_TOKEN_DO_NOT_LOG",
    observedAt:"2026-10-12T17:00:00.000Z"
  });
  assert.equal(report.stack_integrity_verified,true);
  assert.equal(report.upstream_draft_pr_count,14);
  assert.equal(report.upstream_workflow_requirements_checked,16);
  assert.equal(requests.length,41);
  assert.equal(report.production_release_authorized,false);
});


test("latest five source and cache safety PRs cannot lose exact-head green checks",()=>{
  for(const id of [16,17,19,20,21]){
    const broken=snapshot();
    const run=broken.runs[id].find(r=>r.name===chain.CI);
    run.conclusion="failure";
    const r=chain.evaluate(doc,broken);
    assert.ok(r.findings.some(f=>f.pr_number===id&&
      f.code==="EXACT_HEAD_WORKFLOW_NOT_GREEN"),"PR #"+id);
    assert.equal(r.production_release_authorized,false);
  }
});
test("main integrated line must include PRs 16 17 19 20 21 after PR14",()=>{
  assert.deepEqual(doc.chain.slice(9).map(n=>n.number),[16,17,19,20,21]);
  for(const index of [9,10,11,12,13]){
    const altered=clone(doc);
    altered.chain[index].base_ref="main";
    assert.throws(()=>chain.validateManifest(altered),/RELEASE_CHAIN_GATE/);
  }
});
