"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const monitor=require("./018-source-drift");
const clone=x=>structuredClone(x);

const WHEN="2026-10-12T16:00:00.000Z";
const MODIFIED_PA="2026-10-06T12:56:05.000Z";
const MODIFIED_OFAC="2026-10-09T14:01:35.000Z";
function sourceReport(status,data,requests,lastModified=null,errorCode=null){
  return {
    status, data,
    error_code:errorCode,
    request_count:requests,
    provider_last_modified_at_utc:lastModified
  };
}
function observation(when=WHEN){
  return {
    schema_version:1,
    report_type:"READ_ONLY_PUBLIC_SOURCE_COMPATIBILITY_OBSERVATION",
    observed_at_utc:when,
    transaction_or_payment_headers_sent:false,
    write_or_mutation_methods_sent:false,
    external_buyer_data_processed:false,
    raw_names_urls_api_responses_logged:false,
    production_release_authorized:false,
    product_025_unlock_evidence:false,
    checked_get_requests:8,
    source_reports:{
      pennsylvania_registry:sourceReport(
        "SOURCE_SCHEMA_COMPATIBLE",{
          compatible:true,
          unique_strong_match_observed:true,
          returned_candidate_count:2,
          returned_strong_candidate_count:1,
          source_schema_verified_with_public_probe:true,
          entity_name:"PUBLIC_NAME_MUST_NOT_PERSIST",
          private_address:"DO_NOT_EXPORT_PUBLIC_LOCATION"
        },2,MODIFIED_PA
      ),
      ofac_sdn:sourceReport(
        "SOURCE_SCHEMA_COMPATIBLE",{
          compatible:true,
          candidate_count_above_threshold:0,
          displayed_candidate_count:0,
          sanctions_clearance_established:false,
          source_schema_verified_with_public_probe:true,
          sensitive_raw_candidate:"NEVER_LOG_SOURCE_NAME"
        },4,MODIFIED_OFAC
      ),
      iana_rdap:sourceReport(
        "SOURCE_SCHEMA_COMPATIBLE",{
          compatible:true,
          public_documentation_domain_registered:true,
          registration_date_shape_usable:true,
          domain_ownership_established:false,
          source_schema_verified_with_public_probe:true,
          hidden_signed_url:"X-Amz-Signature=SENSITIVE"
        },2,null
      )
    }
  };
}
test("snapshot strips source details, signed URLs and public identity text",()=>{
  const o=observation();
  const snap=monitor.snapshot(o);
  assert.equal(snap.report_type,"REDACTED_PUBLIC_SOURCE_DRIFT_SNAPSHOT");
  assert.equal(snap.total_bounded_get_requests,8);
  assert.equal(snap.sources.pennsylvania_registry.fixed_public_fixture_semantics.ranked_candidate_count,2);
  assert.equal(snap.sources.pennsylvania_registry.fixed_public_fixture_semantics.strong_candidate_count,1);
  assert.equal(snap.sources.ofac_sdn.fixed_public_fixture_semantics.candidate_count_above_threshold,0);
  assert.equal(snap.raw_provider_payload_stored,false);
  assert.equal(snap.production_release_authorized,false);
  assert.equal(snap.payment_sent,false);
  const serialized=JSON.stringify(snap);
  for(const unwanted of [
    "PUBLIC_NAME_MUST_NOT_PERSIST",
    "DO_NOT_EXPORT_PUBLIC_LOCATION",
    "NEVER_LOG_SOURCE_NAME",
    "X-Amz-Signature=SENSITIVE"
  ]) assert.equal(serialized.includes(unwanted),false);
  assert.doesNotThrow(()=>monitor.validateSnapshot(snap));
  assert.deepEqual(monitor.snapshot(clone(o)),snap);
});
test("first observation boots redacted baseline without inventing comparison or production approval",()=>{
  const current=monitor.snapshot(observation());
  const report=monitor.compare(current,null);
  assert.equal(report.status,"BOOTSTRAP_BASELINE_PENDING");
  assert.equal(report.baseline_comparison_performed,false);
  assert.equal(report.drift_alert_count,0);
  assert.equal(report.release_approval_granted,false);
  assert.equal(report.payments_sent,false);
  assert.equal(report.product_025_unlocked,false);
  assert.equal(monitor.enforce(report),true);
  assert.match(monitor.formatSummary(report),/baseline pending/);
});
test("unchanged source observation produces no blocking drift",()=>{
  const prev=monitor.snapshot(observation("2026-10-11T16:00:00.000Z"));
  const now=monitor.snapshot(observation());
  const report=monitor.compare(now,prev);
  assert.equal(report.status,"NO_BLOCKING_DRIFT");
  assert.equal(report.baseline_comparison_performed,true);
  assert.equal(report.drift_alert_count,0);
  assert.equal(report.events.length,0);
  assert.equal(monitor.enforce(report),true);
});
test("provider-reported publication timestamp moving forward is informative, not a false outage",()=>{
  const previous=monitor.snapshot(observation("2026-10-11T16:00:00.000Z"));
  const updated=observation();
  updated.source_reports.ofac_sdn.provider_last_modified_at_utc="2026-10-12T10:00:00.000Z";
  const result=monitor.compare(monitor.snapshot(updated),previous);
  assert.equal(result.status,"NO_BLOCKING_DRIFT");
  assert.ok(result.events.some(e=>e.severity==="NOTICE"&&
    e.code==="PROVIDER_REPORTED_UPDATE"&&e.source==="ofac_sdn"));
  assert.equal(result.release_approval_granted,false);
});
test("decreasing provider Last-Modified triggers failure requiring review",()=>{
  const prior=monitor.snapshot(observation("2026-10-11T16:00:00.000Z"));
  const changed=observation();
  changed.source_reports.ofac_sdn.provider_last_modified_at_utc=
    "2026-10-08T01:00:00.000Z";
  const report=monitor.compare(monitor.snapshot(changed),prior);
  assert.equal(report.status,"HOLD_DRIFT_OR_SOURCE_FAILURE");
  assert.ok(report.events.some(e=>e.code==="PROVIDER_TIMESTAMP_REGRESSED"));
  assert.equal(monitor.enforce(report),false);
});
test("stale OFAC and Pennsylvania source-reported timestamps trigger separate alerts",()=>{
  const old=observation("2026-11-14T16:00:00.000Z");
  const report=monitor.compare(monitor.snapshot(old));
  assert.equal(report.status,"HOLD_DRIFT_OR_SOURCE_FAILURE");
  assert.ok(report.events.some(e=>e.code==="PROVIDER_TIMESTAMP_OVERDUE"&&
    e.source==="ofac_sdn"));
  assert.ok(report.events.some(e=>e.code==="PROVIDER_TIMESTAMP_OVERDUE"&&
    e.source==="pennsylvania_registry"));
});
test("source failure, adverse candidate count movement and missing metadata are classified",()=>{
  const base=monitor.snapshot(observation("2026-10-11T16:00:00.000Z"));
  const current=observation();
  current.source_reports.ofac_sdn.data.candidate_count_above_threshold=1;
  current.source_reports.ofac_sdn.data.displayed_candidate_count=1;
  let report=monitor.compare(monitor.snapshot(current),base);
  assert.ok(report.events.some(e=>e.code==="PUBLIC_EVIDENCE_CHANGED"&&
    e.source==="ofac_sdn"&&e.severity==="ALERT"));
  assert.equal(report.status,"HOLD_DRIFT_OR_SOURCE_FAILURE");

  const failed=observation();
  failed.source_reports.ofac_sdn=sourceReport(
    "HOLD_SOURCE_COMPATIBILITY",null,4,null,"SOURCE_REDIRECT_REFUSED");
  report=monitor.compare(monitor.snapshot(failed),base);
  assert.equal(report.compatibility_verified_now,false);
  assert.ok(report.events.some(e=>e.code==="SOURCE_UNAVAILABLE"&&e.source==="ofac_sdn"));
  assert.equal(monitor.enforce(report),false);

  const missing=observation();
  missing.source_reports.pennsylvania_registry.provider_last_modified_at_utc=null;
  report=monitor.compare(monitor.snapshot(missing),base);
  assert.equal(report.status,"REVIEW_TIMESTAMP_METADATA");
  assert.ok(report.events.some(e=>e.code==="PROVIDER_TIMESTAMP_DISAPPEARED"));
  assert.equal(monitor.enforce(report),true);
});
test("review parser rejects injected private fields, spoofed errors and inconsistent counts",()=>{
  const valid=monitor.snapshot(observation());
  for(const mutation of [
    x=>{x.sources.ofac_sdn.authorized=false;},
    x=>{x.sources.pennsylvania_registry.fixed_public_fixture_semantics.raw_business_name="private";},
    x=>{x.sources.ofac_sdn.sanitized_error_code="SECRET_NETWORK_ERROR";},
    x=>{x.payment_sent=true;},
    x=>{x.production_release_authorized=true;},
    x=>{x.total_bounded_get_requests=9;},
    x=>{x.sources.iana_rdap.get_request_count=-1;},
    x=>{x.sources.ofac_sdn.fixed_public_fixture_semantics.displayed_candidate_count=10;},
    x=>{x.sources.pennsylvania_registry.fixed_public_fixture_semantics.unique_strong_match="yes";}
  ]){
    const copy=clone(valid);mutation(copy);
    assert.throws(()=>monitor.validateSnapshot(copy),/SOURCE_DRIFT_GATE/);
  }
  const incompatible=observation();
  incompatible.source_reports.ofac_sdn.error_code="RAW_UPSTREAM_ERROR_UNTRUSTED";
  assert.throws(()=>monitor.snapshot(incompatible),/SOURCE_DRIFT_GATE/);
});
test("clock anomalies and lost immutable guards fail closed",()=>{
  const first=monitor.snapshot(observation());
  const old=monitor.snapshot(observation("2026-10-13T16:00:00.000Z"));
  const r=monitor.compare(first,old);
  assert.equal(r.status,"HOLD_DRIFT_OR_SOURCE_FAILURE");
  assert.ok(r.events.some(x=>x.code==="OBSERVATION_CLOCK_INVALID"));
  const bad=clone(r);bad.release_approval_granted=true;
  assert.throws(()=>monitor.enforce(bad),/SOURCE_DRIFT_GATE/);
});


test("recovered previously failed source becomes a notice, not fabricated history of healthy evidence",()=>{
  const old=monitor.snapshot(observation("2026-10-11T16:00:00.000Z"));
  old.sources.ofac_sdn.status="HOLD_SOURCE_COMPATIBILITY";
  old.sources.ofac_sdn.sanitized_error_code="SOURCE_ADAPTER_FAILURE";
  old.sources.ofac_sdn.fixed_public_fixture_semantics=null;
  const now=monitor.snapshot(observation());
  const report=monitor.compare(now,old);
  assert.equal(report.status,"NO_BLOCKING_DRIFT");
  assert.equal(report.drift_alert_count,0);
  assert.ok(report.events.some(x=>x.code==="SOURCE_RECOVERED"&&
    x.source==="ofac_sdn"&&x.severity==="NOTICE"));
  assert.equal(report.baseline_comparison_performed,true);
});
test("forged green report cannot conceal real blocking drift or tamper with alert annotations",()=>{
  const prior=monitor.snapshot(observation("2026-10-11T16:00:00.000Z"));
  const failed=observation();
  failed.source_reports.ofac_sdn=sourceReport(
    "HOLD_SOURCE_COMPATIBILITY",null,4,null,"SOURCE_HTTP_ERROR"
  );
  const report=monitor.compare(monitor.snapshot(failed),prior);
  assert.equal(report.status,"HOLD_DRIFT_OR_SOURCE_FAILURE");
  assert.equal(monitor.enforce(report),false);
  for(const modify of [
    x=>{x.status="NO_BLOCKING_DRIFT";},
    x=>{x.drift_alert_count=0;},
    x=>{x.events[0].code="INJECTED::error::private_data";},
    x=>{x.events[0].source="private_customer";},
    x=>{x.release_gate="PRODUCTION_APPROVED";}
  ]){
    const mutated=clone(report);modify(mutated);
    assert.throws(()=>monitor.enforce(mutated),/SOURCE_DRIFT_GATE/);
  }
});
