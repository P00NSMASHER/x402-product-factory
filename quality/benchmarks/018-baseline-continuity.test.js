"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const monitor=require("./018-source-drift");
const history=require("./018-baseline-continuity");

const REPO="P00NSMASHER/x402-product-factory";
const BRANCH="factory/018-public-source-drift-watch-20261012";
const CURRENT_ID=999999999;
const EARLIER="2026-10-12T16:30:30.000Z";
const NOW="2026-10-12T17:30:30.000Z";
function observation(time=EARLIER){
  return {
    report_type:"READ_ONLY_PUBLIC_SOURCE_COMPATIBILITY_OBSERVATION",
    observed_at_utc:time,
    transaction_or_payment_headers_sent:false,
    write_or_mutation_methods_sent:false,
    external_buyer_data_processed:false,
    raw_names_urls_api_responses_logged:false,
    production_release_authorized:false,
    product_025_unlock_evidence:false,
    checked_get_requests:8,
    source_reports:{
      pennsylvania_registry:{
        status:"SOURCE_SCHEMA_COMPATIBLE",
        data:{
          compatible:true,unique_strong_match_observed:true,
          returned_candidate_count:2,returned_strong_candidate_count:1,
          source_schema_verified_with_public_probe:true
        },
        error_code:null,request_count:2,
        provider_last_modified_at_utc:"2026-10-06T12:56:05.000Z"
      },
      ofac_sdn:{
        status:"SOURCE_SCHEMA_COMPATIBLE",
        data:{
          compatible:true,candidate_count_above_threshold:0,
          displayed_candidate_count:0,sanctions_clearance_established:false,
          source_schema_verified_with_public_probe:true
        },
        error_code:null,request_count:4,
        provider_last_modified_at_utc:"2026-10-09T14:01:35.000Z"
      },
      iana_rdap:{
        status:"SOURCE_SCHEMA_COMPATIBLE",
        data:{
          compatible:true,public_documentation_domain_registered:true,
          registration_date_shape_usable:true,domain_ownership_established:false,
          source_schema_verified_with_public_probe:true
        },
        error_code:null,request_count:2,
        provider_last_modified_at_utc:null
      }
    }
  };
}
function previousRun(id,start="2026-10-12T16:29:00Z",end="2026-10-12T16:32:00Z"){
  return {id,head_branch:BRANCH,status:"completed",run_started_at:start,updated_at:end};
}
function runner(runs,{missing=[],tamper={},apiFail=false}={}){
  const attempts=[];
  return {
    attempts,
    execGh(args){
      if(args[0]==="api"){
        attempts.push("api");
        if(apiFail)return {status:1,stdout:"",stderr:"private token not logged"};
        return {status:0,stdout:JSON.stringify({workflow_runs:runs}),stderr:""};
      }
      assert.equal(args[0],"run");
      assert.equal(args[1],"download");
      const id=Number(args[2]);
      attempts.push(id);
      const dest=args[args.indexOf("-D")+1];
      if(missing.includes(id))return {status:1,stdout:"",stderr:"not found"};
      fs.mkdirSync(dest,{recursive:true});
      const payload=tamper[id]??monitor.snapshot(observation(EARLIER));
      fs.writeFileSync(path.join(dest,"current.json"),JSON.stringify(payload));
      return {status:0,stdout:"",stderr:""};
    }
  };
}
function tempTest(handler){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"factory018-history-"));
  try{return handler(dir)}
  finally{fs.rmSync(dir,{recursive:true,force:true})}
}
function restore(dir,runs,config={}){
  const stub=runner(runs,config);
  const state=history.recover({
    dir,repository:REPO,branch:BRANCH,currentRunId:CURRENT_ID,
    execGh:stub.execGh
  });
  return {state,attempts:stub.attempts};
}
function report(previous=null){
  return monitor.compare(
    monitor.snapshot(observation(NOW)),previous);
}
test("latest exact-branch redacted artifact is recovered and matches the generated drift report",()=>{
  tempTest(dir=>{
    const p=previousRun(102);
    const {state,attempts}=restore(dir,[p]);
    assert.deepEqual(attempts,["api",102]);
    assert.equal(state.history_state,"VERIFIED_PREVIOUS");
    assert.equal(state.latest_prior_run_id,102);
    assert.equal(state.selected_prior_run_id,102);
    assert.equal(state.selected_snapshot_at_utc,EARLIER);
    const previous=monitor.readPrevious(path.join(dir,"current.json"));
    assert.equal(history.verifyAgainstReport(state,report(previous)).ok,true);
    const tamperedReport=report(previous);
    tamperedReport.baseline_at_utc=NOW;
    assert.equal(history.verifyAgainstReport(state,tamperedReport).code,
      "HOLD_BASELINE_COMPARISON_MISMATCH");
  });
});
test("genuine first same-branch workflow gets a baseline notice rather than fabricated history",()=>{
  tempTest(dir=>{
    const {state,attempts}=restore(dir,[]);
    assert.deepEqual(attempts,["api"]);
    assert.equal(state.history_state,"NO_PREVIOUS_COMPLETED_RUN");
    assert.equal(state.prior_completed_runs_seen,0);
    assert.equal(fs.existsSync(path.join(dir,"current.json")),false);
    assert.equal(history.verifyAgainstReport(state,report()).ok,true);
    assert.equal(history.verifyAgainstReport(state,report(
      monitor.snapshot(observation(EARLIER)))).ok,false);
  });
});
test("lost newest artifact cannot silently bootstrap or become a green comparison",()=>{
  tempTest(dir=>{
    const latest=previousRun(102);
    const older=previousRun(101,"2026-10-12T16:20:00Z","2026-10-12T16:35:00Z");
    const {state,attempts}=restore(dir,[older,latest],{missing:[102]});
    assert.deepEqual(attempts,["api",102,101]);
    assert.equal(state.history_state,"HOLD_PRIOR_ARTIFACT_GAP");
    assert.equal(state.latest_prior_run_id,102);
    assert.equal(state.selected_prior_run_id,101);
    assert.equal(history.verifyAgainstReport(state,report(
      monitor.readPrevious(path.join(dir,"current.json")))).ok,false);
  });
});
test("no usable artifact among completed runs is a blocking continuity gap",()=>{
  tempTest(dir=>{
    const {state,attempts}=restore(dir,[previousRun(102),previousRun(101)],
      {missing:[101,102]});
    assert.deepEqual(attempts,["api",102,101]);
    assert.equal(state.history_state,"HOLD_PRIOR_ARTIFACT_GAP");
    assert.equal(state.selected_prior_run_id,null);
    assert.equal(fs.existsSync(path.join(dir,"current.json")),false);
    assert.equal(history.verifyAgainstReport(state,report()).ok,false);
  });
});
test("prior GitHub Actions API failure can never be mistaken for first observation",()=>{
  tempTest(dir=>{
    const {state}=restore(dir,[],{apiFail:true});
    assert.equal(state.history_state,"HOLD_RUN_LOOKUP_UNAVAILABLE");
    assert.equal(history.verifyAgainstReport(state,report()).ok,false);
  });
});
test("corrupt or mismatched historical snapshots cannot become trusted baselines",()=>{
  for(const mutation of [
    p=>{p.raw_private_buyer_name="SHOULD_NOT_PASS";},
    p=>{p.release_approved=true;},
    p=>{p.observed_at_utc="2024-01-01T00:00:00.000Z";},
    p=>{p.sources.ofac_sdn.sanitized_error_code="PRIVATE_NETWORK_CODE";}
  ]){
    tempTest(dir=>{
      const payload=monitor.snapshot(observation(EARLIER));
      mutation(payload);
      const {state}=restore(dir,[previousRun(102)],{tamper:{102:payload}});
      assert.equal(state.history_state,"HOLD_PRIOR_ARTIFACT_GAP");
      assert.equal(state.selected_prior_run_id,null);
    });
  }
});
test("GitHub run listing is strictly scoped by prior branch, completion and chronology",()=>{
  const good=previousRun(102);
  assert.deepEqual(history.selectRuns({workflow_runs:[good]},{
    branch:BRANCH,currentRunId:CURRENT_ID
  }).map(x=>x.id),[102]);
  for(const changed of [
    {...good,head_branch:"someone-else"},
    {...good,status:"in_progress"},
    {...good,run_started_at:"not a date"},
    {...good,updated_at:"2026-10-12T16:20:00Z"}
  ]){
    assert.throws(()=>history.selectRuns({workflow_runs:[changed]},{
      branch:BRANCH,currentRunId:CURRENT_ID
    }),/SOURCE_CONTINUITY_GATE/);
  }
});
test("history state schema and report binding reject forged release or gaps",()=>{
  const good=history.makeState("VERIFIED_PREVIOUS",{
    count:1,attempts:1,latest:102,selected:102,observed:EARLIER
  });
  assert.equal(history.validateState(good),good);
  for(const mutation of [
    s=>{s.release_approved=true;},
    s=>{s.private_token="Bearer TOKEN";},
    s=>{s.selected_prior_run_id=101;},
    s=>{s.history_state="NO_PREVIOUS_COMPLETED_RUN";},
    s=>{s.selected_snapshot_at_utc="not a time";},
    s=>{s.candidate_downloads_attempted=99;}
  ]){
    const bad=structuredClone(good);mutation(bad);
    assert.throws(()=>history.validateState(bad),/SOURCE_CONTINUITY_GATE/);
  }
  const current=report(monitor.snapshot(observation(EARLIER)));
  assert.equal(history.verifyAgainstReport(good,current).ok,true);
  const changed=structuredClone(current);
  changed.release_approval_granted=true;
  assert.throws(()=>history.verifyAgainstReport(good,changed),/SOURCE_DRIFT_GATE/);
});
test("download commands are read-only and do not submit payments or source requests",()=>{
  tempTest(dir=>{
    const {state,attempts}=restore(dir,[previousRun(102)]);
    assert.equal(state.history_state,"VERIFIED_PREVIOUS");
    assert.deepEqual(attempts,["api",102]);
    assert.equal(JSON.stringify(state).includes("Bearer"),false);
    assert.equal(JSON.stringify(state).includes("payment_header"),false);
  });
});


test("historical redacted artifact timestamp must match its GitHub Actions run window",()=>{
  tempTest(dir=>{
    const staleRun=previousRun(202,
      "2026-10-11T10:00:00Z","2026-10-11T10:02:00Z");
    const {state}=restore(dir,[staleRun]);
    assert.equal(state.history_state,"HOLD_PRIOR_ARTIFACT_GAP");
    assert.equal(state.selected_snapshot_at_utc,null);
    assert.equal(fs.existsSync(path.join(dir,"current.json")),false);
    assert.equal(history.verifyAgainstReport(state,report()).ok,false);
  });
});
test("invalid same-branch GitHub run listing never masquerades as a first observation",()=>{
  tempTest(dir=>{
    const wrong=previousRun(203);
    wrong.head_branch="unauthorized/other-branch";
    const {state}=restore(dir,[wrong]);
    assert.equal(state.history_state,"HOLD_RUN_LOOKUP_UNAVAILABLE");
    assert.notEqual(state.history_state,"NO_PREVIOUS_COMPLETED_RUN");
  });
});
test("symlinked redacted artifact is not a trusted snapshot",()=>{
  tempTest(dir=>{
    const valid=monitor.snapshot(observation(EARLIER));
    const target=path.join(dir,"trusted-target.json");
    const linked=path.join(dir,"current.json");
    fs.writeFileSync(target,JSON.stringify(valid));
    fs.symlinkSync(target,linked);
    assert.equal(history.confirmedSnapshot(linked,previousRun(205)),null);
  });
});
