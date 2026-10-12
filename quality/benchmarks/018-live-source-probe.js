"use strict";

// Strict public read-only source compatibility probe for existing Product 018.
// No user-controlled queries, payment, private customer data, or production writes.
const {createPaRegistryAdapter,createRdapAdapter,PA_SOURCE,IANA_RDAP_BOOTSTRAP}=
  require("../../packages/sources/live-pa-identity");
const {createOfacNameAdapter,OFAC_BASE}=require("../../packages/sources/ofac-name-screen");
const {registryContradictions,ofacContradictions,rdapContradictions}=
  require("../../products/pa-vendor-counterparty-review/evidence-contract");

const FIXTURE=Object.freeze({
  public_company:"OpenAI OpCo", // Publicly registered test entity, not a buyer.
  registered_domain:"example.com", // IANA-reserved documentation domain.
  ofac_min_score:90
});
const MAX_REQUESTS=8;
const MAX_BODY_BYTES=30000000;
const VALID_HTTP_ENDPOINTS=Object.freeze([
  "data.pa.gov",
  "sanctionslistservice.ofac.treas.gov",
  "data.iana.org",
  "rdap.verisign.com"
]);
const PROBE_NAMES=Object.freeze(["pennsylvania_registry","ofac_sdn","iana_rdap"]);
const safeErrors=new Set([
  "SOURCE_TIMEOUT","SOURCE_HTTP_ERROR","SOURCE_CONTRACT_INVALID",
  "SOURCE_HOST_POLICY_BLOCKED","SOURCE_READ_ONLY_POLICY_BLOCKED",
  "SOURCE_BODY_LIMIT","SOURCE_REDIRECT_REFUSED","SOURCE_ADAPTER_FAILURE"
]);
function gate(code){
  const err=new Error(code);
  err.code=code;
  return err;
}
function authorityFor(rawUrl){
  let url;
  try{url=new URL(rawUrl)}catch{throw gate("SOURCE_HOST_POLICY_BLOCKED")}
  if(url.protocol!=="https:"||url.username||url.password||url.port||
    !VALID_HTTP_ENDPOINTS.includes(url.hostname)||
    url.hash)throw gate("SOURCE_HOST_POLICY_BLOCKED");
  const fixed=host=>url.hostname===host;
  if(fixed("data.pa.gov")){
    const keys=[...url.searchParams.keys()];
    const where=url.searchParams.get("$where")||"";
    if(url.pathname!==new URL(PA_SOURCE).pathname||
      keys.length!==3||
      new Set(keys).size!==3||
      keys.some(k=>!["$select","$where","$limit"].includes(k))||
      url.searchParams.get("$limit")!=="100"||
      !/^upper\(business_name\) like '[%]?OPENAI OPCO[%]?'$/.test(where)||
      !String(url.searchParams.get("$select")).startsWith("distinct business_name,")){
      throw gate("SOURCE_HOST_POLICY_BLOCKED");
    }
    return "pennsylvania_registry";
  }
  if(fixed("sanctionslistservice.ofac.treas.gov")){
    if(![new URL(OFAC_BASE+"/SDN.CSV").pathname,
         new URL(OFAC_BASE+"/ALT.CSV").pathname].includes(url.pathname)||
       url.search)throw gate("SOURCE_HOST_POLICY_BLOCKED");
    return "ofac_sdn";
  }
  if(fixed("data.iana.org")){
    if(url.pathname!==new URL(IANA_RDAP_BOOTSTRAP).pathname||url.search){
      throw gate("SOURCE_HOST_POLICY_BLOCKED");
    }
    return "iana_rdap";
  }
  if(fixed("rdap.verisign.com")){
    if(!/^\/com\/v1\/domain\/example\.com$/.test(url.pathname)||url.search){
      throw gate("SOURCE_HOST_POLICY_BLOCKED");
    }
    return "iana_rdap";
  }
  throw gate("SOURCE_HOST_POLICY_BLOCKED");
}
function sanitizedError(error){
  return typeof error?.code==="string"&&safeErrors.has(error.code)
    ?error.code:"SOURCE_ADAPTER_FAILURE";
}
function parseLastModified(value){
  if(typeof value!=="string")return null;
  const epoch=Date.parse(value);
  return Number.isFinite(epoch)?new Date(epoch).toISOString():null;
}
function makeReadOnlyTransport(rawFetch){
  if(typeof rawFetch!=="function")throw new TypeError("rawFetch required");
  const counter={total:0,pennsylvania_registry:0,ofac_sdn:0,iana_rdap:0};
  const transportMetadata={pennsylvania_registry:null,ofac_sdn:null,iana_rdap:null};
  async function checkedFetch(rawUrl,options={}){
    const authority=authorityFor(rawUrl);
    const method=(options.method||"GET").toUpperCase();
    if(method!=="GET"||options.body!==undefined||
       options.credentials!==undefined&&options.credentials!=="omit"||
       ["Authorization","Cookie","Payment-Signature","X-Payment"].some(key=>
         Object.keys(options.headers||{}).some(h=>h.toLowerCase()===key.toLowerCase()))){
      throw gate("SOURCE_READ_ONLY_POLICY_BLOCKED");
    }
    if(++counter.total>MAX_REQUESTS)throw gate("SOURCE_READ_ONLY_POLICY_BLOCKED");
    counter[authority]++;
    let res;
    try{
      res=await rawFetch(String(rawUrl),{
        ...options,method:"GET",credentials:"omit",redirect:"manual"
      });
    }catch(err){
      throw gate(err?.name==="AbortError"?"SOURCE_TIMEOUT":sanitizedError(err));
    }
    if(!res||typeof res.status!=="number"||typeof res.text!=="function"){
      throw gate("SOURCE_CONTRACT_INVALID");
    }
    // Redirects could bypass an approved host and leak source-query data.
    if(res.status>=300&&res.status<400)throw gate("SOURCE_REDIRECT_REFUSED");
    const lenHeader=res.headers?.get?.("content-length");
    if(lenHeader&&Number(lenHeader)>MAX_BODY_BYTES)throw gate("SOURCE_BODY_LIMIT");
    transportMetadata[authority]={
      provider_claimed_last_modified_at_utc:
        parseLastModified(res.headers?.get?.("last-modified")),
      access_method:"HTTPS_GET_ONLY",
      allowed_host:authority==="pennsylvania_registry"
        ?"data.pa.gov":authority==="ofac_sdn"
          ?"sanctionslistservice.ofac.treas.gov":"IANA_OR_VERISIGN"
    };
    // Bounded response wrapper; avoid returning provider bodies in summaries.
    let cached;
    async function boundedText(){
      if(cached!==undefined)return cached;
      let contents;
      try{
        if(res.body&&typeof res.body.getReader==="function"){
          const chunks=[];
          const reader=res.body.getReader();
          let bytes=0;
          for(;;){
            const {done,value}=await reader.read();
            if(done)break;
            if(!(value instanceof Uint8Array))throw gate("SOURCE_CONTRACT_INVALID");
            bytes+=value.byteLength;
            if(bytes>MAX_BODY_BYTES){
              await reader.cancel().catch(()=>{});
              throw gate("SOURCE_BODY_LIMIT");
            }
            chunks.push(Buffer.from(value));
          }
          contents=Buffer.concat(chunks).toString("utf8");
        }else{
          contents=await res.text();
        }
      }catch(error){
        if(error?.code==="SOURCE_BODY_LIMIT"||error?.code==="SOURCE_CONTRACT_INVALID")throw error;
        throw gate("SOURCE_ADAPTER_FAILURE");
      }
      if(typeof contents!=="string"||
          Buffer.byteLength(contents,"utf8")>MAX_BODY_BYTES){
        throw gate("SOURCE_BODY_LIMIT");
      }
      cached=contents;
      return cached;
    }
    return {
      status:res.status,ok:res.ok,
      text:boundedText,
      json:async()=>{
        const t=await boundedText();
        try{return JSON.parse(t)}catch{throw gate("SOURCE_CONTRACT_INVALID")}
      }
    };
  }
  return {checkedFetch,counter,transportMetadata};
}
function collectPa(evidence){
  if(!evidence||evidence.available!==true||
     !Number.isSafeInteger(evidence.candidateCount)||
     evidence.candidateCount<0||evidence.candidateCount>3||
     !Number.isSafeInteger(evidence.strongCandidateCount)||
     evidence.strongCandidateCount<0||
     evidence.strongCandidateCount>evidence.candidateCount||
     typeof evidence.strongMatch!=="boolean"||
     typeof evidence.ambiguous!=="boolean"){
    throw gate("SOURCE_CONTRACT_INVALID");
  }
  if(evidence.strongMatch&&registryContradictions(evidence).length){
    throw gate("SOURCE_CONTRACT_INVALID");
  }
  return {
    compatible:true,
    unique_strong_match_observed:evidence.strongMatch===true,
    returned_candidate_count:evidence.candidateCount,
    returned_strong_candidate_count:evidence.strongCandidateCount,
    source_schema_verified_with_public_probe:true
  };
}
function collectOfac(evidence,screenedName){
  if(!evidence||evidence.available!==true||
     ofacContradictions(evidence,{
       legalName:screenedName,minScore:FIXTURE.ofac_min_score
     }).length){
    throw gate("SOURCE_CONTRACT_INVALID");
  }
  return {
    compatible:true,
    candidate_count_above_threshold:evidence.totalCandidatesAboveThreshold,
    displayed_candidate_count:evidence.candidates.length,
    source_schema_verified_with_public_probe:true,
    sanctions_clearance_established:false
  };
}
function collectRdap(evidence,now){
  if(!evidence||evidence.available!==true||
     evidence.registered!==true||
     evidence.domain!==FIXTURE.registered_domain||
     typeof evidence.events!=="object"||evidence.events===null||
     rdapContradictions({...evidence,nameAligned:true},{now}).length||
     (evidence.events.registration??evidence.events.registered??null)===null){
    throw gate("SOURCE_CONTRACT_INVALID");
  }
  return {
    compatible:true,
    public_documentation_domain_registered:true,
    registration_date_shape_usable:true,
    domain_ownership_established:false,
    source_schema_verified_with_public_probe:true
  };
}
async function probe({fetchImpl=fetch,clock=()=>new Date().toISOString()}={}){
  const timestamp=clock();
  if(typeof timestamp!=="string"||!Number.isFinite(Date.parse(timestamp))){
    throw new Error("invalid probe timestamp");
  }
  const transport=makeReadOnlyTransport(fetchImpl);
  const adapters={
    registry:createPaRegistryAdapter({
      fetchImpl:transport.checkedFetch,retryDelayMs:0,
      sleepImpl:async()=>{},timeoutMs:12000
    }),
    ofac:createOfacNameAdapter({
      fetchImpl:transport.checkedFetch,timeoutMs:18000
    }),
    rdap:createRdapAdapter({
      fetchImpl:transport.checkedFetch,timeoutMs:12000
    })
  };
  const observations={};
  async function one(key,action){
    try{
      observations[key]={status:"SOURCE_SCHEMA_COMPATIBLE",data:await action(),
        error_code:null};
    }catch(error){
      observations[key]={
        status:"HOLD_SOURCE_COMPATIBILITY",
        data:null,
        error_code:sanitizedError(error)
      };
    }
  }
  let registryLegalName=FIXTURE.public_company;
  await one("pennsylvania_registry",async()=>{
    const e=await adapters.registry.lookup({company:FIXTURE.public_company});
    const result=collectPa(e);
    if(e.strongMatch&&typeof e.entity?.businessName==="string"){
      registryLegalName=e.entity.businessName.trim();
    }
    return result;
  });
  await one("ofac_sdn",async()=>{
    const e=await adapters.ofac.lookup({
      name:registryLegalName,minScore:FIXTURE.ofac_min_score,limit:3
    });
    return collectOfac(e,registryLegalName);
  });
  await one("iana_rdap",async()=>{
    const e=await adapters.rdap.lookup({domain:FIXTURE.registered_domain});
    return collectRdap(e,timestamp);
  });
  for(const key of PROBE_NAMES){
    observations[key].request_count=transport.counter[key];
    observations[key].provider_last_modified_at_utc=
      transport.transportMetadata[key]?.provider_claimed_last_modified_at_utc??null;
  }
  const compatible=PROBE_NAMES.every(k=>observations[k].status==="SOURCE_SCHEMA_COMPATIBLE");
  return {
    schema_version:1,
    report_type:"READ_ONLY_PUBLIC_SOURCE_COMPATIBILITY_OBSERVATION",
    observed_at_utc:timestamp,
    snapshot_persisted_to_repository:false,
    input_scope:"FIXED_PUBLIC_COMPANY_AND_IANA_DOCUMENTATION_DOMAIN",
    transaction_or_payment_headers_sent:false,
    write_or_mutation_methods_sent:false,
    external_buyer_data_processed:false,
    raw_names_urls_api_responses_logged:false,
    checked_get_requests:transport.counter.total,
    network_call_budget:MAX_REQUESTS,
    source_compatibility_passed:compatible,
    source_reports:observations,
    actual_buyer_demand_verified:false,
    real_facilitator_settlement_verified:false,
    current_operating_costs_verified:false,
    production_release_authorized:false,
    product_025_unlock_evidence:false,
    release_gate:compatible
      ?"HOLD_PENDING_REAL_PAYMENT_BUYER_AND_COST_AUDIT"
      :"HOLD_SOURCE_COMPATIBILITY_REQUIRES_REVIEW"
  };
}
function shortSummary(report){
  return {
    status:report.source_compatibility_passed?"PASS_READ_ONLY_SCHEMAS":"HOLD_SOURCE_REVIEW",
    at:report.observed_at_utc,
    request_count:report.checked_get_requests,
    sources:Object.fromEntries(PROBE_NAMES.map(k=>[k,{
      status:report.source_reports[k].status,
      error_code:report.source_reports[k].error_code,
      requests:report.source_reports[k].request_count,
      provider_claimed_last_modified_at_utc:
        report.source_reports[k].provider_last_modified_at_utc
    }])),
    payment_sent:false,
    buyer_data_used:false,
    release_gate:report.release_gate
  };
}
if(require.main===module){
  (async()=>{
    const args=process.argv.slice(2);
    if(args.length!==1||args[0]!=="--probe-live"){
      throw new Error("Use --probe-live; always GET-only fixed public fixtures");
    }
    const report=await probe();
    process.stdout.write(JSON.stringify(shortSummary(report),null,2)+"\n");
    if(!report.source_compatibility_passed)process.exitCode=2;
  })().catch(()=>{
    process.stderr.write("SOURCE_COMPATIBILITY_CHECK_UNAVAILABLE\n");
    process.exitCode=2;
  });
}
module.exports={FIXTURE,MAX_REQUESTS,MAX_BODY_BYTES,VALID_HTTP_ENDPOINTS,
  authorityFor,sanitizedError,makeReadOnlyTransport,collectPa,collectOfac,
  collectRdap,probe,shortSummary};
