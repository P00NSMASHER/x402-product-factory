"use strict";

// Complete deployed-route SHADOW acceptance probe. Every source adapter and
// facilitator response is an injected in-memory mock; NEVER send a transaction.
const assert=require("node:assert/strict");
const {createFactoryRuntime}=require("../../runtime/create-runtime");
const {createAppDeployRouteMap}=require("../../runtime/appdeploy-bridge");
const {encodeHeader,NETWORK,USDC,PAY_TO,FACILITATOR}=require("../../packages/x402/payment");
const registry=require("../../product-registry.json");

const product=registry.products.find(p=>p.number==="018");
if(!product||product.id!=="pa-vendor-counterparty-review"||
   product.path!=="/api/pa-vendor-counterparty-review"||
   product.price_usdc!=="0.010"){
  throw new Error("PREDEPLOY_GATE: Product 018 registry identity changed");
}
const ROUTE="GET "+product.path,OPTIONS="OPTIONS "+product.path;
const NOW="2026-10-02T12:00:00Z";
const PUBLIC_BASE="https://candidate.example";
const MOCK_SIGNATURE=encodeHeader({x402Version:2,payload:{synthetic:true}});
const SECRET="SYNTH_PRIVATE_TOKEN_NEVER_ECHO";
const safeClone=x=>structuredClone(x);
function baseline(){
  return {
    registry:{available:true,strongMatch:true,ambiguous:false,
      candidateCount:1,strongCandidateCount:1,identityComplete:true,matchScore:0,
      entity:{businessName:"Example LLC",filingNumber:"REG-1",
        registrationType:"LLC",address1:"100 Sample Rd",city:"Pottsville",state:"PA",zip:"17901"}},
    ofac:{available:true,query:"Example LLC",minScore:90,
      totalCandidatesAboveThreshold:0,candidates:[]},
    rdap:{available:true,registered:true,domain:"example.com",
      events:{registration:"2020-01-01T00:00:00Z"}}
  };
}
const QUERY=Object.freeze({
  company:"Example LLC",domain:"example.com",minScore:"90",minDomainAgeDays:"90"
});
const NO_SOURCES=Object.freeze([0,0,0]);
const REGISTRY_ONLY=Object.freeze([1,0,0]);
const ALL_SOURCES=Object.freeze([1,1,1]);
function row(id,status,sources=ALL_SOURCES,decision=null,options={}){
  return Object.freeze({
    id,expected_status:status,expected_source_calls:sources,
    expected_verify:options.verify??1,expected_settle:options.settle??(status===200?1:0),
    expected_decision:decision,expected_source_failures:options.failures??[],
    expect_rejected_payment:options.rejected??false,
    expected_challenge:options.challenge??false,
    expect_retry:options.retry??false,
    secret_leak_guard:options.secret??false
  });
}
const CASES=Object.freeze([
  row("no_signature_challenge",402,NO_SOURCES,null,{verify:0,challenge:true}),
  row("cors_preflight",204,NO_SOURCES,null,{verify:0}),
  row("malformed_payment_signature",402,NO_SOURCES,null,{verify:0,challenge:true}),
  row("invalid_query_before_verify",400,NO_SOURCES,null,{verify:0}),
  row("verify_rejected",402,NO_SOURCES,null,{challenge:true}),
  row("verify_unresolved",503,NO_SOURCES,null,{retry:true}),
  row("clean_proceed",200,ALL_SOURCES,"proceed"),
  row("valid_ranked_multi_candidate",200,ALL_SOURCES,"proceed"),
  row("ofac_candidate_completed_review",200,ALL_SOURCES,"human_review"),
  row("unregistered_domain_completed_review",200,ALL_SOURCES,"human_review"),
  row("entity_not_found_completed_review",200,REGISTRY_ONLY,"human_review"),
  row("ambiguous_entity_completed_review",200,REGISTRY_ONLY,"human_review"),
  row("contradictory_strong_registry_count",502,REGISTRY_ONLY,null,{failures:["pa_registry"]}),
  row("incomplete_registry_identity",502,REGISTRY_ONLY,null,{failures:["pa_registry"]}),
  row("registry_source_unavailable",502,REGISTRY_ONLY,null,{failures:["pa_registry"]}),
  row("registry_transport_private_error",502,REGISTRY_ONLY,null,{failures:["pa_registry"],secret:true}),
  row("ofac_wrong_screened_name",502,ALL_SOURCES,null,{failures:["ofac_sdn"]}),
  row("ofac_wrong_requested_threshold",502,ALL_SOURCES,null,{failures:["ofac_sdn"]}),
  row("ofac_negative_candidate_total",502,ALL_SOURCES,null,{failures:["ofac_sdn"]}),
  row("ofac_source_unavailable",502,ALL_SOURCES,null,{failures:["ofac_sdn"]}),
  row("ofac_transport_private_error",502,ALL_SOURCES,null,{failures:["ofac_sdn"],secret:true}),
  row("rdap_impossible_calendar_date",502,ALL_SOURCES,null,{failures:["rdap"]}),
  row("rdap_future_registration",502,ALL_SOURCES,null,{failures:["rdap"]}),
  row("rdap_missing_registration",502,ALL_SOURCES,null,{failures:["rdap"]}),
  row("rdap_source_unavailable",502,ALL_SOURCES,null,{failures:["rdap"]}),
  row("rdap_transport_private_error",502,ALL_SOURCES,null,{failures:["rdap"],secret:true}),
  row("multiple_independent_contract_failures",502,ALL_SOURCES,null,{failures:["ofac_sdn","rdap"]}),
  row("settlement_terminal_payment",402,ALL_SOURCES,null,{settle:1,challenge:true})
]);
function applyVariant(scenario,state){
  switch(scenario.id){
    case "valid_ranked_multi_candidate": state.registry.candidateCount=3;break;
    case "ofac_candidate_completed_review":
      state.ofac.totalCandidatesAboveThreshold=1;
      state.ofac.candidates=[{primaryName:"Example LLC",score:100}];break;
    case "unregistered_domain_completed_review":
      state.rdap.registered=false;state.rdap.events={};break;
    case "entity_not_found_completed_review":
      Object.assign(state.registry,{strongMatch:false,candidateCount:0,
        strongCandidateCount:0,entity:null});break;
    case "ambiguous_entity_completed_review":
      Object.assign(state.registry,{strongMatch:false,candidateCount:2,
        strongCandidateCount:2,ambiguous:true});break;
    case "contradictory_strong_registry_count":
      state.registry.strongCandidateCount=2;state.registry.candidateCount=2;break;
    case "incomplete_registry_identity":state.registry.identityComplete=false;break;
    case "registry_source_unavailable":state.registry.available=false;break;
    case "ofac_wrong_screened_name":state.ofac.query="Wrong LLC";break;
    case "ofac_wrong_requested_threshold":state.ofac.minScore=75;break;
    case "ofac_negative_candidate_total":state.ofac.totalCandidatesAboveThreshold=-1;break;
    case "ofac_source_unavailable":state.ofac.available=false;break;
    case "rdap_impossible_calendar_date":state.rdap.events.registration="2026-02-31";break;
    case "rdap_future_registration":state.rdap.events.registration="2028-01-01";break;
    case "rdap_missing_registration":state.rdap.events={};break;
    case "rdap_source_unavailable":state.rdap.available=false;break;
    case "multiple_independent_contract_failures":
      state.ofac.query="Wrong LLC";state.rdap.events.registration="2026-02-31";break;
    default:break;
  }
}
function secretFailure(){
  const error=new Error("private authentication header "+SECRET);
  error.code="SECRET_TOKEN_"+SECRET;
  return error;
}
async function simulate(scenario){
  const state=baseline();
  applyVariant(scenario,state);
  const counts={registry:0,ofac:0,rdap:0,verify:0,settle:0,unexpectedNetwork:0};
  const adapterTrace=[],paymentTrace=[];
  const errorAt=scenario.id;
  const adapters={
    registry:{async lookup(){
      counts.registry++;adapterTrace.push("registry");
      if(errorAt==="registry_transport_private_error")throw secretFailure();
      return safeClone(state.registry);
    }},
    ofac:{async lookup(){
      counts.ofac++;adapterTrace.push("ofac");
      if(errorAt==="ofac_transport_private_error")throw secretFailure();
      return safeClone(state.ofac);
    }},
    rdap:{async lookup(){
      counts.rdap++;adapterTrace.push("rdap");
      if(errorAt==="rdap_transport_private_error")throw secretFailure();
      return safeClone(state.rdap);
    }},
    address:{async compare(){throw new Error("Unexpected address adapter call");}},
    sec:{async lookup(){throw new Error("Unexpected SEC adapter call");}},
    treasury:{
      async lookup(){throw new Error("Unexpected Treasury adapter call");},
      async history(){throw new Error("Unexpected Treasury history call");},
      async compare(){throw new Error("Unexpected Treasury compare call");}
    }
  };
  const fetchImpl=async(url,init)=>{
    const u=String(url);
    if(init?.method!=="POST"||!u.startsWith(FACILITATOR+"/")){
      counts.unexpectedNetwork++;
      throw new Error("Unapproved external HTTP request blocked");
    }
    if(u===FACILITATOR+"/verify"){
      counts.verify++;paymentTrace.push("verify");
      if(errorAt==="verify_unresolved")throw new Error("Synthetic payment verifier offline");
      if(errorAt==="verify_rejected"){
        return {status:200,ok:true,async json(){return {isValid:false,invalidReason:"synthetic_rejected"};}};
      }
      return {status:200,ok:true,async json(){return {isValid:true};}};
    }
    if(u===FACILITATOR+"/settle"){
      counts.settle++;paymentTrace.push("settle");
      if(errorAt==="settlement_terminal_payment"){
        return {status:402,ok:false,async json(){return {success:false,errorReason:"insufficient_funds"};}};
      }
      return {status:200,ok:true,async json(){return {success:true,transaction:"0xsynthetic"};}};
    }
    counts.unexpectedNetwork++;
    throw new Error("Unapproved facilitator endpoint blocked");
  };
  const runtime=createFactoryRuntime({
    publicApiBase:PUBLIC_BASE,fetchImpl,adapters,
    now:()=>NOW
  });
  const routes=createAppDeployRouteMap(runtime);
  assert.equal(runtime.stagingProducts.length,22,"factory product-count drift");
  assert.ok(routes[ROUTE]&&routes[OPTIONS],"Product 018 AppDeploy routes missing");
  const query={...QUERY};
  if(scenario.id==="invalid_query_before_verify")query.company="";
  let signature=MOCK_SIGNATURE;
  if(scenario.id==="no_signature_challenge"||scenario.id==="cors_preflight")signature=null;
  if(scenario.id==="malformed_payment_signature")signature="bad!!!";
  const verb=scenario.id==="cors_preflight"?OPTIONS:ROUTE;
  const response=await routes[verb][0]({
    query,event:{headers:signature?{"payment-signature":signature}:{}}
  });
  const body=response.statusCode===204?null:JSON.parse(response.body);
  const sourceCalls=[counts.registry,counts.ofac,counts.rdap];
  assert.equal(response.statusCode,scenario.expected_status,scenario.id+" HTTP");
  assert.deepEqual(sourceCalls,scenario.expected_source_calls,scenario.id+" source calls");
  assert.equal(counts.verify,scenario.expected_verify,scenario.id+" verifier calls");
  assert.equal(counts.settle,scenario.expected_settle,scenario.id+" settlement calls");
  assert.equal(counts.unexpectedNetwork,0,scenario.id+" unexpected HTTP calls");
  if(scenario.expected_decision!==null){
    assert.equal(body.decision,scenario.expected_decision,scenario.id+" decision");
    assert.equal(body.paid,true,scenario.id+" paid field");
    assert.equal(body.price,"$"+product.price_usdc,scenario.id+" registered price");
    assert.equal(response.headers["x402-settled"],"true",scenario.id+" receipt state");
    assert.ok(response.headers["PAYMENT-RESPONSE"],scenario.id+" settlement receipt");
    assert.equal(body.chargeable,true,scenario.id+" only completed source outcomes settle");
  }else{
    assert.notEqual(response.headers["x402-settled"],"true",scenario.id+" no x402 settled");
    assert.equal(response.headers["PAYMENT-RESPONSE"],undefined,scenario.id+" no paid receipt");
  }
  if(response.statusCode===502){
    assert.equal(body.chargeable,false,scenario.id+" failure must not charge");
    assert.equal(body.error,"required_source_unavailable");
    assert.deepEqual(body.sourceFailures.map(x=>x.source),
      scenario.expected_source_failures,scenario.id+" source failures");
    assert.equal(counts.settle,0,scenario.id+" no settlement on source failure");
  }
  if(scenario.expected_challenge){
    const header=response.headers["PAYMENT-REQUIRED"];
    assert.ok(header,scenario.id+" missing x402 challenge");
    const document=JSON.parse(Buffer.from(header,"base64").toString("utf8"));
    assert.equal(document.accepts[0].amount,"10000");
    assert.equal(document.accepts[0].network,NETWORK);
    assert.equal(document.accepts[0].asset,USDC);
    assert.equal(document.accepts[0].payTo,PAY_TO);
    assert.equal(document.resource.url,PUBLIC_BASE+product.path);
  }
  if(scenario.expect_retry)assert.equal(body.retrySamePayment,true);
  if(scenario.secret_leak_guard){
    assert.equal(JSON.stringify(response).includes(SECRET),false,
      scenario.id+" leaked upstream exception contents");
    assert.equal(body.sourceFailures?.[0]?.detail,"SOURCE_ADAPTER_FAILURE");
  }
  return {
    id:scenario.id,
    http_status:response.statusCode,
    decision:scenario.expected_decision,
    verified_mock_payments:counts.verify,
    mock_settlement_calls:counts.settle,
    source_adapter_calls:sourceCalls,
    source_failure_ids:body?.sourceFailures?.map(x=>x.source)||[],
    mock_facilitator_trace:paymentTrace,
    mock_source_call_trace:adapterTrace
  };
}
async function runAll(){
  const unique=new Set(CASES.map(s=>s.id));
  if(unique.size!==CASES.length||CASES.length<25)throw new Error("PREDEPLOY_GATE: synthetic scenario coverage missing");
  const rows=[];
  for(const c of CASES)rows.push(await simulate(c));
  const blocked=rows.filter(r=>r.http_status===502);
  const completed=rows.filter(r=>r.http_status===200);
  const deniedSettlement=blocked.every(r=>r.mock_settlement_calls===0);
  if(!deniedSettlement||completed.length<5){
    throw new Error("PREDEPLOY_GATE: blocked failure or insufficient normal-payment coverage");
  }
  return {
    schema_version:1,
    report_type:"OFFLINE_MOCKED_PRODUCT_018_RUNTIME_SHADOW_CANARY",
    product_number:"018",
    product_id:product.id,
    route:product.path,
    registered_price_usdc:product.price_usdc,
    exact_mock_cases:rows.length,
    nonchargeable_source_failures_checked:blocked.length,
    coherent_paid_behaviors_checked:completed.length,
    zero_real_payment_submissions:true,
    zero_real_upstream_calls:true,
    raw_customer_or_private_data_used:false,
    production_source_invoice_and_buyer_evidence_unverified:true,
    external_source_contract_smoke_not_run:true,
    actual_facilitator_receipt_not_verified:true,
    independently_measured_buyer_value:null,
    ready_for_production:false,
    release_gate:"HOLD_PENDING_REAL_SOURCE_PAYMENT_AND_CUSTOMER_EVIDENCE",
    product_025_unlocked:false,
    cases:rows
  };
}
if(require.main===module){
  (async()=>{
    if(process.argv.length!==3||process.argv[2]!=="--check"){
      throw new Error("Use --check (in-memory synthetic probes only)");
    }
    const report=await runAll();
    process.stdout.write(JSON.stringify(report,null,2)+"\n");
  })().catch(e=>{process.stderr.write(String(e.message)+"\n");process.exitCode=1;});
}
module.exports={CASES,PRODUCT_PATH:product.path,QUERY,NOW,simulate,runAll};
