"use strict";

// Product 018 public-source drift monitor. Operates exclusively on the
// fixed-input GET-only probe. Never downloads, stores or prints raw records.
const fs=require("node:fs");
const path=require("node:path");
const {probe}=require("./018-live-source-probe");

const SOURCES=Object.freeze(["pennsylvania_registry","ofac_sdn","iana_rdap"]);
const SOURCE_STATES=Object.freeze(["SOURCE_SCHEMA_COMPATIBLE","HOLD_SOURCE_COMPATIBILITY"]);
const ERROR_CODES=new Set([
  "SOURCE_TIMEOUT","SOURCE_HTTP_ERROR","SOURCE_CONTRACT_INVALID",
  "SOURCE_HOST_POLICY_BLOCKED","SOURCE_READ_ONLY_POLICY_BLOCKED",
  "SOURCE_BODY_LIMIT","SOURCE_REDIRECT_REFUSED","SOURCE_ADAPTER_FAILURE"
]);
const CATEGORY_CODES=Object.freeze({
  SOURCE_UNAVAILABLE:"SOURCE_UNAVAILABLE",
  SOURCE_UNVERIFIED:"SOURCE_UNVERIFIED",
  SCHEMA_DRIFT:"SOURCE_SCHEMA_DRIFT",
  PUBLIC_EVIDENCE_CHANGED:"PUBLIC_EVIDENCE_CHANGED",
  FRESHNESS_ROLLBACK:"PROVIDER_TIMESTAMP_REGRESSED",
  FRESHNESS_OVERDUE:"PROVIDER_TIMESTAMP_OVERDUE",
  PROVIDER_DATE_DISAPPEARED:"PROVIDER_TIMESTAMP_DISAPPEARED",
  CLOCK_ORDER_INVALID:"OBSERVATION_CLOCK_INVALID",
  RECOVERED:"SOURCE_RECOVERED",
  PROVIDER_UPDATED:"PROVIDER_REPORTED_UPDATE",
  BASELINE_PENDING:"NO_PREVIOUS_REDACTED_BASELINE"
});
const AGE_DAYS=Object.freeze({pennsylvania_registry:30,ofac_sdn:14,iana_rdap:null});
const MAX_REQUESTS=8;

function fail(message){
  const error=new Error("SOURCE_DRIFT_GATE: "+message);
  error.code="SOURCE_DRIFT_GATE";
  throw error;
}
function iso(value,label){
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||
     !Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value){
    fail(label+" must be a canonical UTC timestamp");
  }
  return Date.parse(value);
}
function integer(value,max,label){
  if(!Number.isSafeInteger(value)||value<0||value>max)fail(label+" must be a bounded integer");
}
function exactKeys(obj,required,label){
  if(!obj||typeof obj!=="object"||Array.isArray(obj)||
    Object.keys(obj).sort().join("|")!==[...required].sort().join("|")){
    fail("invalid "+label+" fields");
  }
}
function summaryShape(source,result){
  // Bounded values observed from a fixed, previously public company and
  // IANA documentation domain only. Never retain names, addresses or IDs.
  if(result.status!=="SOURCE_SCHEMA_COMPATIBLE")return null;
  const data=result.data;
  if(!data||data.compatible!==true||data.source_schema_verified_with_public_probe!==true){
    fail(source+" incompatible trusted source shape");
  }
  if(source==="pennsylvania_registry"){
    integer(data.returned_candidate_count,3,"ranked candidate count");
    integer(data.returned_strong_candidate_count,3,"strong candidate count");
    if(typeof data.unique_strong_match_observed!=="boolean"||
       data.returned_strong_candidate_count>data.returned_candidate_count){
      fail("invalid Pennsylvania source quality marker");
    }
    return {
      ranked_candidate_count:data.returned_candidate_count,
      strong_candidate_count:data.returned_strong_candidate_count,
      unique_strong_match:data.unique_strong_match_observed
    };
  }
  if(source==="ofac_sdn"){
    integer(data.candidate_count_above_threshold,1000000,"OFAC candidate count");
    integer(data.displayed_candidate_count,3,"bounded OFAC candidates");
    if(data.displayed_candidate_count>data.candidate_count_above_threshold||
       data.sanctions_clearance_established!==false){
      fail("invalid OFAC screen cardinality or clearance claim");
    }
    return {
      candidate_count_above_threshold:data.candidate_count_above_threshold,
      displayed_candidate_count:data.displayed_candidate_count
    };
  }
  if(source==="iana_rdap"){
    if(data.public_documentation_domain_registered!==true||
       data.registration_date_shape_usable!==true||
       data.domain_ownership_established!==false){
      fail("invalid registered documentation domain shape");
    }
    return {documentation_domain_registered:true,registration_date_shape_usable:true};
  }
  fail("unexpected source name");
}
function snapshot(observation){
  if(!observation||observation.report_type!=="READ_ONLY_PUBLIC_SOURCE_COMPATIBILITY_OBSERVATION"||
     observation.transaction_or_payment_headers_sent!==false||
     observation.write_or_mutation_methods_sent!==false||
     observation.external_buyer_data_processed!==false||
     observation.raw_names_urls_api_responses_logged!==false||
     observation.production_release_authorized!==false||
     observation.product_025_unlock_evidence!==false){
    fail("source report has unsafe or unexpected provenance");
  }
  const observedAt=iso(observation.observed_at_utc,"observed_at_utc");
  integer(observation.checked_get_requests,MAX_REQUESTS,"outbound request count");
  const sources={};let total=0;
  for(const name of SOURCES){
    const r=observation.source_reports?.[name];
    if(!r||!SOURCE_STATES.includes(r.status))fail("missing or invalid "+name+" report");
    integer(r.request_count,MAX_REQUESTS,name+" read calls");
    total+=r.request_count;
    const code=r.error_code;
    if(!(code===null||ERROR_CODES.has(code)))fail(name+" contains unknown error code");
    const date=r.provider_last_modified_at_utc;
    if(date!==null)iso(date,name+" Last-Modified");
    if(r.status==="SOURCE_SCHEMA_COMPATIBLE"&&code!==null||
       r.status==="HOLD_SOURCE_COMPATIBILITY"&&code===null){
      fail(name+" status and error contradict");
    }
    sources[name]={
      status:r.status,
      sanitized_error_code:code,
      get_request_count:r.request_count,
      provider_claimed_last_modified_at_utc:date,
      fixed_public_fixture_semantics:summaryShape(name,r)
    };
  }
  if(total!==observation.checked_get_requests)fail("source request-count reconciliation failed");
  return {
    schema_version:1,
    report_type:"REDACTED_PUBLIC_SOURCE_DRIFT_SNAPSHOT",
    observed_at_utc:new Date(observedAt).toISOString(),
    product_number:"018",
    public_fixture_scope:"PINNED_PA_ENTITY_OFAC_SCREEN_AND_IANA_DOCUMENTATION_DOMAIN",
    adapter_sources:SOURCES.length,
    total_bounded_get_requests:total,
    raw_provider_payload_stored:false,
    payment_sent:false,
    buyer_records_used:false,
    actual_facilitator_payment_verified:false,
    actual_customer_demand_verified:false,
    production_release_authorized:false,
    product_025_unlock_evidence:false,
    sources
  };
}
function validateSnapshot(s){
  exactKeys(s,[
    "schema_version","report_type","observed_at_utc","product_number",
    "public_fixture_scope","adapter_sources","total_bounded_get_requests",
    "raw_provider_payload_stored","payment_sent","buyer_records_used",
    "actual_facilitator_payment_verified","actual_customer_demand_verified",
    "production_release_authorized","product_025_unlock_evidence","sources"
  ],"snapshot");
  if(s.schema_version!==1||
     s.report_type!=="REDACTED_PUBLIC_SOURCE_DRIFT_SNAPSHOT"||
     s.product_number!=="018"||
     s.public_fixture_scope!=="PINNED_PA_ENTITY_OFAC_SCREEN_AND_IANA_DOCUMENTATION_DOMAIN"||
     s.adapter_sources!==3||
     s.raw_provider_payload_stored!==false||
     s.payment_sent!==false||
     s.buyer_records_used!==false||
     s.actual_facilitator_payment_verified!==false||
     s.actual_customer_demand_verified!==false||
     s.production_release_authorized!==false||
     s.product_025_unlock_evidence!==false)fail("snapshot trust assertion is malformed");
  iso(s.observed_at_utc,"snapshot observation");
  integer(s.total_bounded_get_requests,MAX_REQUESTS,"snapshot request count");
  exactKeys(s.sources,SOURCES,"source identities");
  let calls=0;
  for(const name of SOURCES){
    const r=s.sources[name];
    exactKeys(r,[
      "status","sanitized_error_code","get_request_count",
      "provider_claimed_last_modified_at_utc","fixed_public_fixture_semantics"
    ],name);
    if(!SOURCE_STATES.includes(r.status))fail(name+" source status invalid");
    const code=r.sanitized_error_code;
    if(code!==null&&!ERROR_CODES.has(code))fail(name+" untrusted error code");
    if(r.status==="SOURCE_SCHEMA_COMPATIBLE"&&(code!==null||r.fixed_public_fixture_semantics===null)){
      fail(name+" source evidence missing or status inconsistent");
    }
    if(r.status==="HOLD_SOURCE_COMPATIBILITY"&&(code===null||r.fixed_public_fixture_semantics!==null)){
      fail(name+" failed source cannot claim a passing schema");
    }
    integer(r.get_request_count,MAX_REQUESTS,name+" request count");
    calls+=r.get_request_count;
    if(r.provider_claimed_last_modified_at_utc!==null){
      iso(r.provider_claimed_last_modified_at_utc,name+" timestamp");
    }
    if(r.fixed_public_fixture_semantics!==null){
      const semantics=r.fixed_public_fixture_semantics;
      if(name==="pennsylvania_registry"){
        exactKeys(semantics,[
          "ranked_candidate_count","strong_candidate_count","unique_strong_match"
        ],name+" shape");
        integer(semantics.ranked_candidate_count,3,name+" ranked");
        integer(semantics.strong_candidate_count,3,name+" strong");
        if(typeof semantics.unique_strong_match!=="boolean"||
           semantics.strong_candidate_count>semantics.ranked_candidate_count)fail("invalid registry shape");
      }else if(name==="ofac_sdn"){
        exactKeys(semantics,["candidate_count_above_threshold","displayed_candidate_count"],name+" shape");
        integer(semantics.candidate_count_above_threshold,1000000,name+" total");
        integer(semantics.displayed_candidate_count,3,name+" display");
        if(semantics.displayed_candidate_count>semantics.candidate_count_above_threshold){
          fail("OFAC candidate count does not reconcile");
        }
      }else{
        exactKeys(semantics,[
          "documentation_domain_registered","registration_date_shape_usable"
        ],name+" shape");
        if(semantics.documentation_domain_registered!==true||
           semantics.registration_date_shape_usable!==true)fail("bad RDAP shape");
      }
    }
  }
  if(calls!==s.total_bounded_get_requests)fail("saved request totals do not reconcile");
  return s;
}
function notice(level,code,source){
  return {severity:level,code,source};
}
function compare(current,previous=null){
  validateSnapshot(current);
  if(previous!==null)validateSnapshot(previous);
  const currentAt=iso(current.observed_at_utc,"current snapshot time");
  const earlier=previous===null?null:iso(previous.observed_at_utc,"previous snapshot time");
  const events=[];
  function add(severity,code,source){events.push(notice(severity,code,source))}
  if(earlier!==null&&currentAt<=earlier){
    add("ALERT",CATEGORY_CODES.CLOCK_ORDER_INVALID,"monitor");
  }
  for(const name of SOURCES){
    const now=current.sources[name],then=previous?.sources?.[name]||null;
    if(now.status!=="SOURCE_SCHEMA_COMPATIBLE"){
      add("ALERT",CATEGORY_CODES.SOURCE_UNAVAILABLE,name);
    }else if(then?.status==="HOLD_SOURCE_COMPATIBILITY"){
      add("NOTICE",CATEGORY_CODES.RECOVERED,name);
    }
    const date=now.provider_claimed_last_modified_at_utc;
    const old=then?.provider_claimed_last_modified_at_utc??null;
    if(date!==null){
      const epoch=iso(date,name+" provider date");
      if(epoch>currentAt+86400000){
        add("ALERT",CATEGORY_CODES.CLOCK_ORDER_INVALID,name);
      }
      const maxAge=AGE_DAYS[name];
      if(maxAge!==null&&currentAt-epoch>maxAge*86400000){
        add("ALERT",CATEGORY_CODES.FRESHNESS_OVERDUE,name);
      }
      if(old!==null){
        const before=iso(old,name+" prior provider date");
        if(epoch<before){
          add("ALERT",CATEGORY_CODES.FRESHNESS_ROLLBACK,name);
        }else if(epoch>before){
          add("NOTICE",CATEGORY_CODES.PROVIDER_UPDATED,name);
        }
      }
    }else if(old!==null){
      add("WARNING",CATEGORY_CODES.PROVIDER_DATE_DISAPPEARED,name);
    }
    const left=now.fixed_public_fixture_semantics;
    const right=then?.fixed_public_fixture_semantics??null;
    if(left!==null&&right!==null&&JSON.stringify(left)!==JSON.stringify(right)){
      // The test fixture is public, but changes can indicate that source
      // screening semantics or ranking have drifted; require human review.
      add("ALERT",CATEGORY_CODES.PUBLIC_EVIDENCE_CHANGED,name);
    }
  }
  if(previous===null)add("NOTICE",CATEGORY_CODES.BASELINE_PENDING,"monitor");
  const order={ALERT:0,WARNING:1,NOTICE:2};
  events.sort((a,b)=>
    order[a.severity]-order[b.severity]||
    a.source.localeCompare(b.source)||
    a.code.localeCompare(b.code)
  );
  const needsReview=events.some(x=>x.severity==="ALERT");
  const warnings=events.some(x=>x.severity==="WARNING");
  return {
    schema_version:1,
    report_type:"PRODUCT_018_READ_ONLY_SOURCE_DRIFT_ASSESSMENT",
    observed_at_utc:current.observed_at_utc,
    baseline_at_utc:previous?.observed_at_utc??null,
    baseline_comparison_performed:previous!==null,
    fixed_public_source_count:SOURCES.length,
    current_public_GET_request_count:current.total_bounded_get_requests,
    compatibility_verified_now:SOURCES.every(x=>current.sources[x].status==="SOURCE_SCHEMA_COMPATIBLE"),
    drift_alert_count:events.filter(x=>x.severity==="ALERT").length,
    warning_count:events.filter(x=>x.severity==="WARNING").length,
    event_count:events.length,
    events,
    status:needsReview?"HOLD_DRIFT_OR_SOURCE_FAILURE":
      warnings?"REVIEW_TIMESTAMP_METADATA":
      previous===null?"BOOTSTRAP_BASELINE_PENDING":"NO_BLOCKING_DRIFT",
    actual_customer_buyer_data_used:false,
    payments_sent:false,
    release_approval_granted:false,
    real_customer_demand_proven:false,
    real_payment_settlement_verified:false,
    product_025_unlocked:false,
    release_gate:"HOLD_PENDING_REAL_PAYMENT_BUYER_COST_AND_SECURITY_REVIEW"
  };
}
function formatSummary(report){
  const rows=[
    "## Product 018 — public-source drift monitor",
    "",
    "| Property | Result |",
    "|---|---|",
    "| Source compatibility at observation | "+(report.compatibility_verified_now?"3/3 compatible":"At least one source requires review")+" |",
    "| Compared with prior redacted run | "+(report.baseline_comparison_performed?"Yes":"No — bootstrap baseline pending")+" |",
    "| Blocking drift findings | "+report.drift_alert_count+" |",
    "| Nonblocking metadata warnings | "+report.warning_count+" |",
    "| Public GET requests | "+report.current_public_GET_request_count+" |",
    "| Assessment | "+report.status+" |",
    "| Production authorization | **HOLD** |",
    "",
    "| Severity | Source | Fixed reason code |",
    "|---|---|---|"
  ];
  if(!report.events.length)rows.push("| — | All | No meaningful changes observed |");
  for(const x of report.events){
    rows.push("| "+x.severity+" | "+x.source+" | "+x.code+" |");
  }
  rows.push("","Data sources are public fixed fixtures only. Provider Last-Modified is an unverified server header, **not authenticated publication freshness**. No raw source records, signed publisher URLs, wallet/payment data or buyer information are retained. A green monitor does not approve release.","");
  return rows.join("\n");
}
function readPrevious(file){
  if(!file||!fs.existsSync(file))return null;
  const stat=fs.statSync(file);
  if(stat.size>20000)fail("prior observation exceeds 20 KB trusted limit");
  const parsed=JSON.parse(fs.readFileSync(file,"utf8"));
  return validateSnapshot(parsed);
}
function saveFile(file,text){
  fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});
  fs.writeFileSync(file,text,"utf8",{mode:0o600});
}
async function capture({previousPath,currentPath,reportPath,markdownPath,fetchImpl}){
  const prior=readPrevious(previousPath);
  const observed=await probe({fetchImpl});
  const current=snapshot(observed);
  const report=compare(current,prior);
  // Only redacted schemas, bounded counts and fixed source IDs are persisted.
  saveFile(currentPath,JSON.stringify(current,null,2)+"\n");
  saveFile(reportPath,JSON.stringify(report,null,2)+"\n");
  if(markdownPath)saveFile(markdownPath,formatSummary(report));
  return report;
}
function validateReport(report){
  exactKeys(report,[
    "schema_version","report_type","observed_at_utc","baseline_at_utc",
    "baseline_comparison_performed","fixed_public_source_count",
    "current_public_GET_request_count","compatibility_verified_now",
    "drift_alert_count","warning_count","event_count","events","status",
    "actual_customer_buyer_data_used","payments_sent","release_approval_granted",
    "real_customer_demand_proven","real_payment_settlement_verified",
    "product_025_unlocked","release_gate"
  ],"drift report");
  if(report.schema_version!==1||
     report.report_type!=="PRODUCT_018_READ_ONLY_SOURCE_DRIFT_ASSESSMENT"||
     report.fixed_public_source_count!==3||
     report.actual_customer_buyer_data_used!==false||
     report.payments_sent!==false||
     report.release_approval_granted!==false||
     report.real_customer_demand_proven!==false||
     report.real_payment_settlement_verified!==false||
     report.product_025_unlocked!==false||
     report.release_gate!=="HOLD_PENDING_REAL_PAYMENT_BUYER_COST_AND_SECURITY_REVIEW"){
    fail("report makes unsupported trust or release assertions");
  }
  iso(report.observed_at_utc,"drift report timestamp");
  if(report.baseline_at_utc!==null)iso(report.baseline_at_utc,"drift baseline timestamp");
  if(report.baseline_comparison_performed!==(report.baseline_at_utc!==null)){
    fail("drift baseline comparison does not reconcile");
  }
  integer(report.current_public_GET_request_count,MAX_REQUESTS,"report request budget");
  for(const key of ["drift_alert_count","warning_count","event_count"]){
    integer(report[key],64,"drift "+key);
  }
  if(typeof report.compatibility_verified_now!=="boolean"||
     !Array.isArray(report.events)||report.events.length!==report.event_count){
    fail("drift report events malformed");
  }
  const severities=new Set(["ALERT","WARNING","NOTICE"]);
  const codes=new Set(Object.values(CATEGORY_CODES));
  for(const event of report.events){
    exactKeys(event,["severity","code","source"],"drift event");
    if(!severities.has(event.severity)||
       !codes.has(event.code)||
       !(SOURCES.includes(event.source)||event.source==="monitor")){
      fail("drift event may not include user-controlled codes or sources");
    }
  }
  const alerts=report.events.filter(e=>e.severity==="ALERT").length;
  const warnings=report.events.filter(e=>e.severity==="WARNING").length;
  if(alerts!==report.drift_alert_count||
     warnings!==report.warning_count||
     (!report.compatibility_verified_now&&alerts===0)){
    fail("drift severity counters or compatibility claims inconsistent");
  }
  const expected=alerts?"HOLD_DRIFT_OR_SOURCE_FAILURE":
    warnings?"REVIEW_TIMESTAMP_METADATA":
    report.baseline_at_utc===null?"BOOTSTRAP_BASELINE_PENDING":"NO_BLOCKING_DRIFT";
  if(report.status!==expected){
    fail("drift status inconsistent with recorded evidence");
  }
  return report;
}
function enforce(report){
  validateReport(report);
  return report.status!=="HOLD_DRIFT_OR_SOURCE_FAILURE";
}
if(require.main===module){
  (async()=>{
    const [mode,...args]=process.argv.slice(2);
    if(mode==="--capture"&&args.length===4){
      const report=await capture({
        previousPath:args[0],currentPath:args[1],reportPath:args[2],
        markdownPath:args[3]
      });
      // Emit only fixed known event codes and source IDs.
      process.stdout.write(JSON.stringify({
        status:report.status,
        compared_with_previous_run:report.baseline_comparison_performed,
        public_GET_requests:report.current_public_GET_request_count,
        blocking_alerts:report.drift_alert_count,
        warnings:report.warning_count,
        release_approved:false
      })+"\n");
    }else if(mode==="--enforce"&&args.length===1){
      const report=JSON.parse(fs.readFileSync(args[0],"utf8"));
      const success=enforce(report);
      if(!success){
        for(const event of report.events.filter(x=>x.severity==="ALERT")){
          process.stdout.write("::error title=Product 018 source drift::"+
            event.source+" "+event.code+"\n");
        }
        process.exitCode=2;
      }else if(report.status==="BOOTSTRAP_BASELINE_PENDING"){
        process.stdout.write("::notice title=Source baseline::First redacted snapshot recorded; baseline comparison starts next run.\n");
      }else if(report.status==="REVIEW_TIMESTAMP_METADATA"){
        process.stdout.write("::warning title=Source metadata::Provider timestamp disappeared; investigate source freshness.\n");
      }
    }else{
      throw new Error("Use --capture previous.json current.json report.json summary.md or --enforce report.json");
    }
  })().catch(()=>{
    process.stderr.write("SOURCE_DRIFT_GATE_UNAVAILABLE\n");
    process.exitCode=2;
  });
}
module.exports={SOURCES,SOURCE_STATES,AGE_DAYS,CATEGORY_CODES,MAX_REQUESTS,
  snapshot,validateSnapshot,compare,formatSummary,readPrevious,capture,validateReport,enforce};
