"use strict";

// Cross-run continuity for the Product 018 public GET-only monitor.
// Uses only GitHub Actions run metadata and previous REDACTED artifact
// snapshots. It never queries public providers or payment systems itself.
const fs=require("node:fs");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const {readPrevious,validateReport}=require("./018-source-drift");

const HISTORY_FILE="history.json";
const SNAPSHOT_FILE="current.json";
const WORKFLOW_NAME="factory-018-live-source-smoke.yml";
const ARTIFACT_NAME="factory-018-redacted-source-observation";
const MAX_PRIOR=12;
const MAX_RUNS=30;
const MAX_PREVIOUS_BYTES=20000;
const STATES=Object.freeze([
  "VERIFIED_PREVIOUS",
  "NO_PREVIOUS_COMPLETED_RUN",
  "HOLD_PRIOR_ARTIFACT_GAP",
  "HOLD_RUN_LOOKUP_UNAVAILABLE"
]);
const FIELDS=Object.freeze([
  "schema_version","report_type","history_state","branch_scope",
  "prior_completed_runs_seen","candidate_downloads_attempted",
  "latest_prior_run_id","selected_prior_run_id","selected_snapshot_at_utc",
  "release_approved","payment_sent","raw_source_records_saved"
]);
function fail(message){
  const error=new Error("SOURCE_CONTINUITY_GATE: "+message);
  error.code="SOURCE_CONTINUITY_GATE";
  throw error;
}
function integer(n,max,label){
  if(!Number.isSafeInteger(n)||n<0||n>max)fail(label+" invalid bounded integer");
}
function nullableId(n,label){
  if(n!==null&&(!Number.isSafeInteger(n)||n<1))fail(label+" invalid workflow id");
}
function exact(obj,keys,label){
  if(!obj||typeof obj!=="object"||Array.isArray(obj)||
     Object.keys(obj).sort().join("|")!==[...keys].sort().join("|")){
    fail(label+" contains forbidden/missing fields");
  }
}
function iso(date,label){
  if(typeof date!=="string"||!Number.isFinite(Date.parse(date))||
     !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(date)||
     new Date(date).toISOString()!==date)fail(label+" invalid timestamp");
  return Date.parse(date);
}
function makeState(history_state,details={}){
  return {
    schema_version:1,
    report_type:"PRODUCT_018_GITHUB_REDACTED_BASELINE_CONTINUITY",
    history_state,
    branch_scope:"SAME_BRANCH_COMPLETED_RUN_ONLY",
    prior_completed_runs_seen:details.count??0,
    candidate_downloads_attempted:details.attempts??0,
    latest_prior_run_id:details.latest??null,
    selected_prior_run_id:details.selected??null,
    selected_snapshot_at_utc:details.observed??null,
    release_approved:false,
    payment_sent:false,
    raw_source_records_saved:false
  };
}
function validateState(state){
  exact(state,FIELDS,"history state");
  if(state.schema_version!==1||
     state.report_type!=="PRODUCT_018_GITHUB_REDACTED_BASELINE_CONTINUITY"||
     !STATES.includes(state.history_state)||
     state.branch_scope!=="SAME_BRANCH_COMPLETED_RUN_ONLY"||
     state.release_approved!==false||state.payment_sent!==false||
     state.raw_source_records_saved!==false){
    fail("history state has invalid purpose or trust claims");
  }
  integer(state.prior_completed_runs_seen,MAX_RUNS,"prior count");
  integer(state.candidate_downloads_attempted,MAX_PRIOR,"attempt count");
  nullableId(state.latest_prior_run_id,"latest id");
  nullableId(state.selected_prior_run_id,"selected id");
  if(state.selected_snapshot_at_utc!==null)iso(state.selected_snapshot_at_utc,"selected snapshot");
  if(state.history_state==="NO_PREVIOUS_COMPLETED_RUN"){
    if(state.prior_completed_runs_seen!==0||
       state.candidate_downloads_attempted!==0||
       state.latest_prior_run_id!==null||
       state.selected_prior_run_id!==null||
       state.selected_snapshot_at_utc!==null)fail("false first-run claim");
  }else if(state.history_state==="VERIFIED_PREVIOUS"){
    if(state.prior_completed_runs_seen<1||
       state.candidate_downloads_attempted<1||
       state.selected_prior_run_id!==state.latest_prior_run_id||
       state.selected_snapshot_at_utc===null)fail("unverified continuous predecessor");
  }else if(state.history_state==="HOLD_PRIOR_ARTIFACT_GAP"){
    if(state.prior_completed_runs_seen<1||
       state.candidate_downloads_attempted<1||
       state.latest_prior_run_id===null||
       state.selected_prior_run_id===state.latest_prior_run_id){
      fail("history gap claimed with no missing predecessor");
    }
    if((state.selected_prior_run_id===null)!==(state.selected_snapshot_at_utc===null)){
      fail("recovered artifact identity and observation mismatch");
    }
  }else if(state.history_state==="HOLD_RUN_LOOKUP_UNAVAILABLE"){
    if(state.prior_completed_runs_seen!==0||state.candidate_downloads_attempted!==0||
       state.selected_prior_run_id!==null||state.latest_prior_run_id!==null||
       state.selected_snapshot_at_utc!==null){
      fail("unavailable run API may not assert known history");
    }
  }
  if(state.candidate_downloads_attempted>state.prior_completed_runs_seen){
    fail("artifact attempts exceed known runs");
  }
  return state;
}
function selectRuns(payload,{branch,currentRunId}){
  if(!payload||typeof payload!=="object"||!Array.isArray(payload.workflow_runs)||
      payload.workflow_runs.length>MAX_RUNS)fail("invalid read-only GitHub runs response");
  if(typeof branch!=="string"||!branch||branch.length>180||
     !/^[A-Za-z0-9._/-]+$/.test(branch)||branch.includes("..")||
     !Number.isSafeInteger(currentRunId)||currentRunId<1){
    fail("invalid GitHub run scope");
  }
  const runs=[];
  const seen=new Set();
  for(const r of payload.workflow_runs){
    if(!r||!Number.isSafeInteger(r.id)||r.id<1)fail("malformed prior run identity");
    if(r.id===currentRunId)continue;
    // The API query is explicitly restricted to this branch and completed
    // runs. Unexpected scope is not evidence that this is the first run.
    if(r.head_branch!==branch||r.status!=="completed"){
      fail("prior run API did not honor same-branch completed scope");
    }
    if(seen.has(r.id))fail("duplicate workflow id in history API");
    seen.add(r.id);
    const started=Date.parse(r.run_started_at);
    const updated=Date.parse(r.updated_at);
    if(!Number.isFinite(started)||!Number.isFinite(updated)||
       updated<started)fail("invalid prior run chronology");
    runs.push({
      id:r.id,
      run_started_at:new Date(started).toISOString(),
      updated_at:new Date(updated).toISOString()
    });
  }
  // Newest by event timing; run ID breaks ties. Do not use the current run.
  runs.sort((a,b)=>
    Date.parse(b.run_started_at)-Date.parse(a.run_started_at)||b.id-a.id);
  return runs;
}
function runGh(args){
  // GH_TOKEN is supplied by GitHub Actions as actions:read; never print the
  // command arguments or provider-signed artifacts on errors.
  return spawnSync("gh",args,{
    encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:30000,
    maxBuffer:2000000
  });
}
function confirmedSnapshot(file,run){
  if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||
     fs.statSync(file).size>MAX_PREVIOUS_BYTES)return null;
  let snap;
  try{snap=readPrevious(file)}catch{return null}
  const at=Date.parse(snap.observed_at_utc);
  const started=Date.parse(run.run_started_at);
  const finished=Date.parse(run.updated_at);
  // Bind the redacted evidence to the reported earlier workflow window;
  // an ancient or future-dated replay cannot count as continuous evidence.
  if(!Number.isFinite(at)||
     at<started-15*60*1000||at>finished+15*60*1000)return null;
  return snap;
}
function previousRuns({repository,branch,currentRunId,execGh=runGh}){
  if(typeof repository!=="string"||
     !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)){
    fail("invalid repository identity");
  }
  const response=execGh([
    "api","--method","GET",
    "/repos/"+repository+"/actions/workflows/"+WORKFLOW_NAME+"/runs",
    "-f","branch="+branch,"-f","status=completed","-f","per_page="+MAX_RUNS
  ]);
  if(response?.status!==0||typeof response.stdout!=="string"){
    return {ok:false,runs:[]};
  }
  try{
    return {
      ok:true,
      runs:selectRuns(JSON.parse(response.stdout),{branch,currentRunId})
    };
  }catch{
    return {ok:false,runs:[]};
  }
}
function recover({
  dir,repository,branch,currentRunId,execGh=runGh
}){
  if(typeof dir!=="string"||!dir)fail("history artifact directory missing");
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const base=path.resolve(dir);
  const prior=previousRuns({repository,branch,currentRunId,execGh});
  if(!prior.ok){
    const state=validateState(makeState("HOLD_RUN_LOOKUP_UNAVAILABLE"));
    fs.writeFileSync(path.join(base,HISTORY_FILE),
      JSON.stringify(state,null,2)+"\n",{mode:0o600});
    return state;
  }
  if(!prior.runs.length){
    const state=validateState(makeState("NO_PREVIOUS_COMPLETED_RUN"));
    fs.writeFileSync(path.join(base,HISTORY_FILE),
      JSON.stringify(state,null,2)+"\n",{mode:0o600});
    return state;
  }
  const latest=prior.runs[0].id;
  let selected=null,observed=null,attempts=0;
  for(const priorRun of prior.runs.slice(0,MAX_PRIOR)){
    attempts++;
    const dest=path.join(base,"candidate-"+priorRun.id);
    fs.mkdirSync(dest,{recursive:true,mode:0o700});
    const response=execGh([
      "run","download",String(priorRun.id),"-R",repository,
      "-n",ARTIFACT_NAME,"-D",dest
    ]);
    if(response?.status===0){
      // The first historical workflow stored files flat. Adding a history
      // file from a second folder caused GitHub upload-artifact to preserve
      // this ONE known alternate directory prefix. Never scan arbitrary
      // extracted paths: doing so could import untrusted ZIP content.
      const allowedSnapshots=[
        path.join(dest,SNAPSHOT_FILE),
        path.join(dest,"factory018-current",SNAPSHOT_FILE)
      ];
      let accepted=null,acceptedFile=null;
      for(const file of allowedSnapshots){
        const snap=confirmedSnapshot(file,priorRun);
        if(snap){accepted=snap;acceptedFile=file;break}
      }
      if(accepted){
        selected=priorRun.id;
        observed=accepted.observed_at_utc;
        fs.copyFileSync(acceptedFile,path.join(base,SNAPSHOT_FILE));
        fs.chmodSync(path.join(base,SNAPSHOT_FILE),0o600);
        fs.rmSync(dest,{recursive:true,force:true});
        break;
      }
    }
    fs.rmSync(dest,{recursive:true,force:true});
  }
  // Even a valid older artifact cannot close the hole left by the latest
  // completed workflow. Fail the monitoring run rather than claiming green.
  const status=selected===latest?"VERIFIED_PREVIOUS":"HOLD_PRIOR_ARTIFACT_GAP";
  const state=validateState(makeState(status,{
    count:prior.runs.length,attempts,latest,selected,observed
  }));
  fs.writeFileSync(path.join(base,HISTORY_FILE),
    JSON.stringify(state,null,2)+"\n",{mode:0o600});
  return state;
}
function verifyAgainstReport(state,report){
  validateState(state);
  validateReport(report);
  if(state.history_state==="HOLD_RUN_LOOKUP_UNAVAILABLE"||
     state.history_state==="HOLD_PRIOR_ARTIFACT_GAP"){
    return {ok:false,code:state.history_state};
  }
  if(state.history_state==="VERIFIED_PREVIOUS"&&(
      report.baseline_comparison_performed!==true||
      report.baseline_at_utc!==state.selected_snapshot_at_utc)){
    return {ok:false,code:"HOLD_BASELINE_COMPARISON_MISMATCH"};
  }
  if(state.history_state==="NO_PREVIOUS_COMPLETED_RUN"&&(
      report.baseline_comparison_performed!==false||
      report.baseline_at_utc!==null)){
    return {ok:false,code:"HOLD_BASELINE_COMPARISON_MISMATCH"};
  }
  return {ok:true,code:state.history_state};
}
if(require.main===module){
  try{
    const [mode,...args]=process.argv.slice(2);
    if(mode==="--restore"&&args.length===1){
      const state=recover({
        dir:args[0],
        repository:process.env.GITHUB_REPOSITORY,
        branch:process.env.GITHUB_HEAD_REF||process.env.GITHUB_REF_NAME,
        currentRunId:Number(process.env.GITHUB_RUN_ID)
      });
      process.stdout.write("::notice title=Source baseline continuity::"+
        state.history_state+"\n");
    }else if(mode==="--verify"&&args.length===2){
      const state=JSON.parse(fs.readFileSync(args[0],"utf8"));
      const report=JSON.parse(fs.readFileSync(args[1],"utf8"));
      const checked=verifyAgainstReport(state,report);
      if(!checked.ok){
        process.stdout.write("::error title=Source history continuity::"+
          checked.code+"\n");
        process.exitCode=2;
      }else{
        process.stdout.write("::notice title=Source history continuity::"+
          checked.code+"\n");
      }
    }else fail("expected --restore <dir> or --verify <state> <report>");
  }catch{
    process.stderr.write("SOURCE_CONTINUITY_GATE_UNAVAILABLE\n");
    process.exitCode=2;
  }
}
module.exports={
  STATES,FIELDS,makeState,validateState,selectRuns,previousRuns,
  confirmedSnapshot,recover,verifyAgainstReport
};
