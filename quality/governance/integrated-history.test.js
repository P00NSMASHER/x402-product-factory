"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const manifest=require("./integrated-history.json");
const gate=require("./integrated-history");
const {CI,PUBLIC,CI_PATH}=require("./release-chain");
const clone=x=>structuredClone(x);
function remote(){
  const s=manifest.source_history_branch;
  return {
    pr:{
      number:18,state:"open",draft:true,merged:false,merged_at:null,mergeable:true,
      head:{ref:s.head_branch,sha:s.reviewed_head_sha},
      base:{ref:s.base_branch,sha:s.base_sha}
    },
    runs:s.required_workflows.map((name,i)=>({
      id:310000+i,name,status:"completed",conclusion:"success",
      event:"pull_request",path:CI_PATH[name],
      head_branch:s.head_branch,head_sha:s.reviewed_head_sha
    }))
  };
}
test("four PR18 critical blobs and reconciled source workflow remain byte-for-byte verified",()=>{
  assert.equal(gate.validateManifest(manifest),manifest);
  const result=gate.checkLocal(manifest);
  assert.equal(result.identical_critical_source_files,4);
  assert.ok(result.reviewed_file_blobs.every(f=>f.git_blob_sha_matches));
  assert.equal(result.integrated_history_recovery_wired,true);
  assert.equal(result.production_release_authorized,false);
  assert.equal(result.product_025_unlocked,false);
  const first=gate.REQUIRED_PATHS[0];
  const raw=fs.readFileSync(require("node:path").join(gate.ROOT,first));
  assert.equal(gate.gitBlobSha(raw),manifest.critical_files[0].expected_git_blob_sha);
});
test("changed recovery implementation or disabled restore verification fails closed",()=>{
  const path=require("node:path");
  const fsReader=p=>{
    if(p.endsWith(gate.REQUIRED_PATHS[0]))return Buffer.from("tampered PR18 source");
    return fs.readFileSync(p);
  };
  assert.throws(()=>gate.checkLocal(manifest,{readFile:fsReader}),
    /INTEGRATED_HISTORY_GATE/);
  const workflowReader=p=>{
    const original=fs.readFileSync(p);
    if(p.endsWith(gate.WORKFLOW)){
      return Buffer.from(String(original).replace(
        "018-baseline-continuity.js --verify","removed verification hook"));
    }
    return original;
  };
  assert.throws(()=>gate.checkLocal(manifest,{readFile:workflowReader}),
    /INTEGRATED_HISTORY_GATE/);
});
test("pinned history branch provenance or product release proof cannot be fabricated",()=>{
  const changes=[
    x=>{x.product_025_unlocked=true;},
    x=>{x.price_wallet_production_changes_authorized=true;},
    x=>{x.verified_external_customers=1;},
    x=>{x.authenticated_real_payment=true;},
    x=>{x.critical_files[0].path="../private";},
    x=>{x.critical_files[2].expected_git_blob_sha="e".repeat(40);},
    x=>{x.source_history_branch.reviewed_head_sha="f".repeat(40);},
    x=>{x.source_history_branch.required_workflows=[CI];},
    x=>{x.integration_target.pr_number=25;},
    x=>{x.extra_unapproved_flag=true;}
  ];
  for(const mut of changes){
    const copy=clone(manifest);mut(copy);
    if(copy.critical_files[2].expected_git_blob_sha==="e".repeat(40)){
      assert.throws(()=>gate.checkLocal(copy),/INTEGRATED_HISTORY_GATE/);
    }else{
      assert.throws(()=>gate.validateManifest(copy),/INTEGRATED_HISTORY_GATE/);
    }
  }
});
test("PR18 remote state and exact-head CI must both be independently checked",()=>{
  const m=remote(),r=gate.checkRemote(manifest,m);
  assert.equal(r.source_history_copy_independently_verified,true);
  assert.equal(r.exact_head_workflows_passed,2);
  assert.equal(r.merged_into_default_branch,false);
  const mutations=[
    x=>{x.pr.head.sha="0".repeat(40);},
    x=>{x.pr.base.sha="0".repeat(40);},
    x=>{x.pr.mergeable=false;},
    x=>{x.pr.merged=true;},
    x=>{x.pr.draft=false;},
    x=>{x.runs.find(t=>t.name===PUBLIC).conclusion="failure";},
    x=>{x.runs.find(t=>t.name===CI).event="push";},
    x=>{x.runs.find(t=>t.name===CI).path="untrusted.yml";},
    x=>{x.runs.find(t=>t.name===PUBLIC).head_sha="0".repeat(40);},
    x=>{const failed=x.runs.find(t=>t.name===CI);x.runs.push({...failed,id:failed.id+100,conclusion:"failure"});}
  ];
  for(const mut of mutations){
    const x=clone(m);mut(x);
    assert.throws(()=>gate.checkRemote(manifest,x),/INTEGRATED_HISTORY_GATE/);
  }
});
test("GitHub source-PR audit accesses two allowlisted read-only metadata paths",async()=>{
  const m=remote(),requests=[];
  const outcome=await gate.checkLive(manifest,{
    token:"TEST_ONLY_GITHUB_TOKEN_NEVER_LOG",
    fetchImpl:async(uri,init)=>{
      const u=new URL(uri);
      requests.push({path:u.pathname+u.search,method:init.method});
      assert.equal(u.origin,"https://api.github.com");
      assert.equal(init.method,"GET");
      const result=u.pathname.endsWith("/pulls/18")
        ?m.pr:{workflow_runs:m.runs};
      return {ok:true,headers:{get:()=>null},async text(){return JSON.stringify(result)}};
    }
  });
  assert.equal(outcome.exact_head_workflows_passed,2);
  assert.equal(requests.length,2);
  assert.ok(requests.every(x=>x.method==="GET"));
  assert.ok(requests.some(x=>x.path.endsWith("/pulls/18")));
  assert.ok(requests.some(x=>x.path.includes("head_sha="+manifest.source_history_branch.reviewed_head_sha)));
});
