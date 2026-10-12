"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {
  authorityFor,makeReadOnlyTransport,probe,shortSummary,
  FIXTURE,MAX_REQUESTS
}=require("./018-live-source-probe");
const {PA_SOURCE}=require("../../packages/sources/live-pa-identity");

const WHEN="2026-10-12T13:00:00.000Z";
const publicPaRow={
  business_name:FIXTURE.public_company,filing_number:"PUBLIC-TEST-123",
  typeofbusinessregistration:"Limited Liability Company",
  address_line1:"100 Public Test Road",city:"Sample City",state:"PA",zip:"19000"
};
const ofacCsv="12345,UNRELATED TEST PERSON,individual,TEST,,,,,,,,\n";
const IANA={services:[[["com"],["https://rdap.verisign.com/com/v1/"]]]};
const RDAP={
  objectClassName:"domain",ldhName:"EXAMPLE.COM",
  events:[{eventAction:"registration",eventDate:"1995-08-14T04:00:00Z"}]
};
const makeResponse=(body,status=200)=>({
  ok:status>=200&&status<300,status,
  headers:{get(key){
    if(key==="content-length")return String(Buffer.byteLength(body,"utf8"));
    if(key==="last-modified")return "Sun, 11 Oct 2026 13:00:00 GMT";
    return null;
  }},
  async text(){return body;}
});
function fakeProvider({ofacStatus=null,paCorrupt=false,badIana=false,rdapMissing=false,redirect=false}={}){
  const calls=[];
  const fetchImpl=async (url,opts={})=>{
    const u=new URL(String(url));calls.push({host:u.hostname,path:u.pathname,options:opts});
    assert.equal(opts.method,"GET");
    assert.equal(opts.credentials,"omit");
    assert.equal(opts.redirect,"manual");
    assert.equal(opts.body,undefined);
    if(u.hostname==="data.pa.gov"){
      return makeResponse(JSON.stringify(paCorrupt?{bad:"shape"}:[publicPaRow]));
    }
    if(u.hostname==="sanctionslistservice.ofac.treas.gov"){
      if(u.pathname.endsWith("/SDN.CSV")){
        if(redirect)return makeResponse("",302);
        return makeResponse(ofacCsv,ofacStatus??200);
      }
      return makeResponse("");
    }
    if(u.hostname==="data.iana.org"){
      return makeResponse(JSON.stringify(badIana?
        {services:[[["com"],["http://127.0.0.1:8080/private"]]]}:IANA));
    }
    if(u.hostname==="rdap.verisign.com"){
      return makeResponse(JSON.stringify(rdapMissing?{events:[]}:RDAP));
    }
    throw new Error("Unexpected external host in controlled source fixture");
  };
  return {fetchImpl,calls};
}
const clock=()=>WHEN;
test("all three adapters pass bounded fixed-public fixtures with redacted output",async()=>{
  const {fetchImpl,calls}=fakeProvider();
  const result=await probe({fetchImpl,clock});
  assert.equal(result.source_compatibility_passed,true);
  assert.equal(result.release_gate,"HOLD_PENDING_REAL_PAYMENT_BUYER_AND_COST_AUDIT");
  assert.deepEqual(result.source_reports.pennsylvania_registry.data,{
    compatible:true,unique_strong_match_observed:true,returned_candidate_count:1,
    returned_strong_candidate_count:1,source_schema_verified_with_public_probe:true
  });
  assert.equal(result.source_reports.ofac_sdn.data.candidate_count_above_threshold,0);
  assert.equal(result.source_reports.iana_rdap.data.public_documentation_domain_registered,true);
  assert.equal(result.checked_get_requests,6);
  assert.equal(calls.length,6);
  assert.equal(result.source_reports.pennsylvania_registry.request_count,2);
  assert.equal(result.source_reports.ofac_sdn.request_count,2);
  assert.equal(result.source_reports.iana_rdap.request_count,2);
  assert.equal(result.source_reports.pennsylvania_registry.provider_last_modified_at_utc,
    "2026-10-11T13:00:00.000Z");
  assert.equal(result.transaction_or_payment_headers_sent,false);
  assert.equal(result.production_release_authorized,false);
  assert.equal(result.product_025_unlock_evidence,false);
  const publicSummary=JSON.stringify(shortSummary(result));
  assert.equal(publicSummary.includes("PUBLIC-TEST-123"),false);
  assert.equal(publicSummary.includes(FIXTURE.public_company),false);
  assert.equal(publicSummary.includes("SAMPLE"),false);
});
test("public fixture source corruption blocks release but keeps observations redacted",async()=>{
  for(const bad of [
    {ofacStatus:503},
    {paCorrupt:true},
    {badIana:true},
    {rdapMissing:true},
    {redirect:true}
  ]){
    const {fetchImpl,calls}=fakeProvider(bad);
    const result=await probe({fetchImpl,clock});
    assert.equal(result.source_compatibility_passed,false);
    assert.equal(result.release_gate,"HOLD_SOURCE_COMPATIBILITY_REQUIRES_REVIEW");
    assert.equal(result.production_release_authorized,false);
    assert.equal(result.real_facilitator_settlement_verified,false);
    assert.equal(result.transaction_or_payment_headers_sent,false);
    assert.ok(calls.every(x=>x.options.method==="GET"&&x.options.redirect==="manual"));
    assert.equal(JSON.stringify(shortSummary(result)).includes("127.0.0.1"),false);
  }
});
test("strict host and request policy cannot contact facilitator, buyer or private targets",async()=>{
  for(const u of [
    "http://data.pa.gov/resource/xvd7-5r2c.json",
    "https://127.0.0.1/private",
    "https://localhost/private",
    "https://facilitator.payai.network/verify",
    "https://data.pa.gov.evil.test/resource/xvd7-5r2c.json",
    "https://data.pa.gov/resource/xvd7-5r2c.json?$where=private_person&$limit=100&$select=distinct%20business_name",
    "https://rdap.verisign.com/com/v1/domain/private-buyer.com",
    "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SECRET.CSV",
    "https://data.iana.org:8443/rdap/dns.json"
  ]){
    assert.throws(()=>authorityFor(u),/SOURCE_HOST_POLICY_BLOCKED/,u);
  }
  let touched=0;
  const transport=makeReadOnlyTransport(async()=>{
    touched++;return makeResponse("{}");
  });
  const ofac="https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ALT.CSV";
  for(const options of [
    {method:"POST"},{body:"data"},{headers:{"payment-signature":"secret"}},
    {headers:{"Authorization":"Bearer secret"}},
    {headers:{"Cookie":"session"}},
    {credentials:"include"}
  ]){
    await assert.rejects(()=>transport.checkedFetch(ofac,options),
      /SOURCE_READ_ONLY_POLICY_BLOCKED/);
  }
  assert.equal(touched,0);
});
test("read-only transport refuses redirect and enforces maximum outbound budget",async()=>{
  const sample="https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ALT.CSV";
  let called=0;
  const guarded=makeReadOnlyTransport(async()=>{
    called++;return makeResponse("",200);
  });
  for(let i=0;i<MAX_REQUESTS;i++)await guarded.checkedFetch(sample);
  await assert.rejects(()=>guarded.checkedFetch(sample),/SOURCE_READ_ONLY_POLICY_BLOCKED/);
  assert.equal(called,MAX_REQUESTS);
  const redirect=makeReadOnlyTransport(async()=>makeResponse("",302));
  await assert.rejects(()=>redirect.checkedFetch(sample),/SOURCE_REDIRECT_REFUSED/);
});
test("private upstream transport errors are normalized to fixed, non-revealing status",async()=>{
  const fake=async()=>{
    const e=new Error("TOP_SECRET_USER_PRIVATE_INVOICE_DATA");
    e.code="SECRET_INTERNAL_123";
    throw e;
  };
  const result=await probe({fetchImpl:fake,clock});
  const body=JSON.stringify(shortSummary(result));
  assert.equal(body.includes("TOP_SECRET_USER_PRIVATE_INVOICE_DATA"),false);
  assert.equal(body.includes("SECRET_INTERNAL_123"),false);
  assert.equal(result.source_compatibility_passed,false);
  for(const s of Object.values(result.source_reports)){
    assert.equal(s.error_code,"SOURCE_ADAPTER_FAILURE");
  }
});
