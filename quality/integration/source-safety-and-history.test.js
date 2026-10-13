"use strict";

// Cross-branch integration acceptance: Product 018 trusted observation history
// AND all 22 existing x402 products' source-availability/field gate modules.
const test=require("node:test");
const assert=require("node:assert/strict");
const registry=require("../../product-registry.json");
const {loadSpecs}=require("../../scripts/generate-spec-artifacts");
const {createFactoryRuntime}=require("../../runtime/create-runtime");
const {createAppDeployRouteMap}=require("../../runtime/appdeploy-bridge");
const {NETWORK,USDC,PAY_TO}=require("../../packages/x402/payment");
const {trackRequiredEvidence,safeSourceErrorCode}=require("../../packages/sources/contracts");
const {guardMarketEvidence}=require("../../packages/sources/market-evidence-contract");
const {validateSnapshot,compare}=require("../benchmarks/018-source-drift");
const {makeState,verifyAgainstReport,validateState}=
  require("../benchmarks/018-baseline-continuity");

const PA_DEEP=new Set(["016","017","018","019","020"]);
const SEC_TREASURY_DEEP=new Set(["006","008","013","014","015"]);
const NUMBERS=Array.from({length:22},(_,i)=>String(i+3).padStart(3,"0"));
const COUNT=22;
const noop=async()=>{throw new Error("NO_EXTERNAL_REQUESTS_PERMITTED");};
function inertAdapters(){
  return {
    registry:{lookup:noop},address:{compare:noop},rdap:{lookup:noop},
    sec:{lookup:noop},treasury:{lookup:noop,history:noop,compare:noop},
    ofac:{lookup:noop}
  };
}
function historyReport(){
  const sources={
    pennsylvania_registry:{
      status:"SOURCE_SCHEMA_COMPATIBLE",sanitized_error_code:null,
      get_request_count:2,provider_claimed_last_modified_at_utc:"2026-10-06T12:56:05.000Z",
      fixed_public_fixture_semantics:{
        ranked_candidate_count:2,strong_candidate_count:1,unique_strong_match:true
      }
    },
    ofac_sdn:{
      status:"SOURCE_SCHEMA_COMPATIBLE",sanitized_error_code:null,
      get_request_count:4,provider_claimed_last_modified_at_utc:"2026-10-09T14:01:35.000Z",
      fixed_public_fixture_semantics:{candidate_count_above_threshold:0,displayed_candidate_count:0}
    },
    iana_rdap:{
      status:"SOURCE_SCHEMA_COMPATIBLE",sanitized_error_code:null,
      get_request_count:2,provider_claimed_last_modified_at_utc:null,
      fixed_public_fixture_semantics:{documentation_domain_registered:true,registration_date_shape_usable:true}
    }
  };
  const snapshot={
    schema_version:1,report_type:"REDACTED_PUBLIC_SOURCE_DRIFT_SNAPSHOT",
    observed_at_utc:"2026-10-12T16:48:05.000Z",
    product_number:"018",
    public_fixture_scope:"PINNED_PA_ENTITY_OFAC_SCREEN_AND_IANA_DOCUMENTATION_DOMAIN",
    adapter_sources:3,total_bounded_get_requests:8,
    raw_provider_payload_stored:false,payment_sent:false,buyer_records_used:false,
    actual_facilitator_payment_verified:false,actual_customer_demand_verified:false,
    production_release_authorized:false,product_025_unlock_evidence:false,sources
  };
  validateSnapshot(snapshot);
  return compare(snapshot);
}
test("all 22 paid staging routes remain discoverable and preserve existing price/wallet",async()=>{
  const specs=loadSpecs();
  assert.equal(specs.length,COUNT);
  const products=registry.products.filter(p=>/staging$/.test(p.status))
    .sort((a,b)=>a.number.localeCompare(b.number));
  assert.deepEqual(products.map(p=>p.number),NUMBERS);
  assert.deepEqual(specs.map(p=>p.number).sort(),NUMBERS);
  assert.equal(PA_DEEP.size,5);
  assert.equal(SEC_TREASURY_DEEP.size,5);
  for(const p of products){
    assert.equal(specs.find(s=>s.number===p.number).economics.price_usdc,p.price_usdc);
    assert.equal(PA_DEEP.has(p.number)&&SEC_TREASURY_DEEP.has(p.number),false);
  }
  let externalRequests=0;
  const runtime=createFactoryRuntime({
    publicApiBase:"https://candidate.example",
    adapters:inertAdapters(),
    now:()=>"2026-10-12T12:00:00Z",
    fetchImpl:async()=>{externalRequests++;throw new Error("FORBIDDEN_FACILITATOR");}
  });
  const routes=createAppDeployRouteMap(runtime);
  assert.equal(runtime.stagingProducts.length,COUNT);
  for(const product of products){
    const key=product.method+" "+product.path;
    assert.ok(routes[key],product.id+" missing integration route");
    const preflight=await routes["OPTIONS "+product.path][0]({});
    assert.equal(preflight.statusCode,204,product.id+" CORS");
    const challenge=await routes[key][0]({});
    assert.equal(challenge.statusCode,402,product.id+" unpaid challenge");
    assert.equal(challenge.headers["x402-network"],NETWORK);
    assert.equal(challenge.headers["x402-pay-to"],PAY_TO);
    const challengeData=JSON.parse(Buffer.from(
      challenge.headers["PAYMENT-REQUIRED"],"base64").toString("utf8"));
    assert.equal(challengeData.accepts[0].asset,USDC);
    assert.equal(challengeData.accepts[0].network,NETWORK);
    assert.equal(challengeData.accepts[0].payTo,PAY_TO);
    assert.equal(challengeData.resource.url,"https://candidate.example"+product.path);
    assert.equal(challengeData.accepts[0].amount,
      String(BigInt(product.price_usdc.replace(".",""))*1000n));
  }
  assert.equal(externalRequests,0);
});
test("composed branch retains availability and SEC/Treasury malformed-source safeguards",()=>{
  const failures=[];
  const unavailable=trackRequiredEvidence("sec_edgar",{available:false},failures);
  assert.equal(unavailable.available,false);
  assert.deepEqual(failures,[{source:"sec_edgar",detail:"SOURCE_UNAVAILABLE"}]);
  const malformedMarket=[];
  const result=guardMarketEvidence({
    kind:"sec",
    evidence:{available:true,found:true,filings:[],company:null},
    source:"sec_edgar",sourceFailures:malformedMarket,
    expected:{now:"2026-10-12T12:00:00Z"}
  });
  assert.equal(result.available,false);
  assert.deepEqual(malformedMarket,[{source:"sec_edgar",detail:"SOURCE_CONTRACT_INVALID"}]);
  assert.equal(safeSourceErrorCode({message:"PRIVATE_KEY",code:"SECRET_INTERNAL"}),
    "SOURCE_ADAPTER_FAILURE");
});
test("trusted redacted history cannot be replaced by green no-baseline when completed history exists",()=>{
  const noPrevious=validateState(makeState("NO_PREVIOUS_COMPLETED_RUN"));
  const report=historyReport();
  assert.equal(report.status,"BOOTSTRAP_BASELINE_PENDING");
  assert.deepEqual(verifyAgainstReport(noPrevious,report),{
    ok:true,code:"NO_PREVIOUS_COMPLETED_RUN"
  });
  const gap=validateState(makeState("HOLD_PRIOR_ARTIFACT_GAP",{
    count:1,attempts:1,latest:38279894957,selected:null,observed:null
  }));
  assert.deepEqual(verifyAgainstReport(gap,report),{
    ok:false,code:"HOLD_PRIOR_ARTIFACT_GAP"
  });
  const lookup=validateState(makeState("HOLD_RUN_LOOKUP_UNAVAILABLE"));
  assert.deepEqual(verifyAgainstReport(lookup,report),{
    ok:false,code:"HOLD_RUN_LOOKUP_UNAVAILABLE"
  });
});
test("source drift guards and release restrictions coexist with 22-product quality gates",()=>{
  const report=historyReport();
  assert.equal(report.release_approval_granted,false);
  assert.equal(report.payments_sent,false);
  assert.equal(report.product_025_unlocked,false);
  assert.equal(report.fixed_public_source_count,3);
  assert.equal(report.compatibility_verified_now,true);
  assert.equal(report.current_public_GET_request_count,8);
  const coverage={
    pa_composite:[...PA_DEEP].sort(),
    market_source_fields:[...SEC_TREASURY_DEEP].sort(),
    remaining_availability:NUMBERS.filter(x=>!PA_DEEP.has(x)&&!SEC_TREASURY_DEEP.has(x))
  };
  assert.equal(coverage.remaining_availability.length,12);
  assert.equal(Object.values(coverage).flat().length,22);
  assert.deepEqual([...new Set(Object.values(coverage).flat())].sort(),NUMBERS);
});
