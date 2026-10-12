"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const {createCounterpartyReviewService}=require("./service");
const {createPaidCounterpartyReviewHandler}=require("./paid-handler");
const {PAID_HANDLER_MODULES}=require("../../generated/spec-paid-handlers");
const {encodeHeader}=require("../../packages/x402/payment");

const NOW="2026-10-02T12:00:00Z";
const QUERY={company:"Example LLC",domain:"example.com",minScore:90,minDomainAgeDays:90};
const clone=value=>structuredClone(value);
function evidence(){
  return {
    registry:{
      available:true,strongMatch:true,ambiguous:false,candidateCount:1,
      strongCandidateCount:1,identityComplete:true,matchScore:0,
      entity:{businessName:"Example LLC",filingNumber:"REG-1",
        registrationType:"LLC",address1:"100 Sample Rd",city:"Pottsville",
        state:"PA",zip:"17901"}
    },
    ofac:{available:true,query:"Example LLC",minScore:90,totalCandidatesAboveThreshold:0,candidates:[]},
    rdap:{available:true,registered:true,domain:"example.com",
      events:{registration:"2020-01-01T00:00:00Z"}}
  };
}
function harness(modify){
  const state=evidence();
  if(modify)modify(state);
  const calls={registry:0,ofac:0,rdap:0};
  const adapters={
    registry:{async lookup(){
      calls.registry++;return clone(state.registry);
    }},
    ofac:{async lookup(){
      calls.ofac++;return clone(state.ofac);
    }},
    rdap:{async lookup(){
      calls.rdap++;return clone(state.rdap);
    }}
  };
  const service=createCounterpartyReviewService({...adapters,now:()=>NOW});
  return {service,calls};
}
test("one strong registry match may coexist with two weaker ranked candidates",async()=>{
  for(const count of [1,2,3]){
    const h=harness(e=>{e.registry.candidateCount=count;});
    const result=await h.service.check(QUERY);
    assert.equal(result.decision,"proceed");
    assert.equal(result.chargeable,true);
    assert.deepEqual(result.sourceFailures,[]);
    assert.deepEqual(h.calls,{registry:1,ofac:1,rdap:1});
  }
});
test("contradictory registry strong-match evidence blocks dependent lookups",async()=>{
  for(const change of [
    e=>{e.registry.strongCandidateCount=2;e.registry.candidateCount=2;},
    e=>{e.registry.identityComplete=false;},
    e=>{e.registry.candidateCount=0;},
    e=>{e.registry.candidateCount=4;},
    e=>{delete e.registry.strongCandidateCount;}
  ]){
    const h=harness(change);
    const r=await h.service.check(QUERY);
    assert.equal(r.decision,"human_review");
    assert.equal(r.chargeable,false);
    assert.equal(r.sourceFailures.length,1);
    assert.equal(r.sourceFailures[0].source,"pa_registry");
    assert.deepEqual(h.calls,{registry:1,ofac:0,rdap:0});
  }
});
test("coherent adverse findings remain paid human review, not false source failure",async()=>{
  const ofac=harness(e=>{
    e.ofac.totalCandidatesAboveThreshold=1;
    e.ofac.candidates=[{score:98,primaryName:"Example LLC"}];
  });
  const r=await ofac.service.check(QUERY);
  assert.equal(r.decision,"human_review");
  assert.equal(r.chargeable,true);
  assert.deepEqual(r.sourceFailures,[]);
  assert.ok(r.reasonCodes.includes("OFAC_CANDIDATE_REQUIRES_REVIEW"));

  const mismatch=harness(e=>{e.rdap.domain="other.example.com";});
  // Alignment is intentionally computed against caller's domain, not RDAP
  // domain metadata; the separate upstream consistency policy is out of scope.
  const r2=await mismatch.service.check(QUERY);
  assert.equal(r2.chargeable,true);
});
test("inconsistent OFAC screen context and tally become nonchargeable source failure",async()=>{
  for(const change of [
    e=>{e.ofac.query="Unrelated LLC";},
    e=>{e.ofac.minScore=70;},
    e=>{e.ofac.totalCandidatesAboveThreshold=-1;},
    e=>{e.ofac.totalCandidatesAboveThreshold=1;e.ofac.candidates=[];},
    e=>{delete e.ofac.candidates;},
    e=>{e.ofac.available=false;}
  ]){
    const h=harness(change);
    const r=await h.service.check(QUERY);
    assert.equal(r.decision,"human_review");
    assert.equal(r.chargeable,false);
    assert.equal(r.sourceFailures.length,1);
    assert.equal(r.sourceFailures[0].source,"ofac_sdn");
    assert.deepEqual(h.calls,{registry:1,ofac:1,rdap:1});
  }
});
test("missing, invalid, future or unavailable required RDAP registration evidence is nonchargeable",async()=>{
  for(const change of [
    e=>{e.rdap.events={};},
    e=>{e.rdap.events.registration="2026-02-31";},
    e=>{e.rdap.events.registration="2027-01-01";},
    e=>{e.rdap.registered=undefined;},
    e=>{e.rdap.available=false;}
  ]){
    const h=harness(change);
    const r=await h.service.check(QUERY);
    assert.equal(r.decision,"human_review");
    assert.equal(r.chargeable,false);
    assert.equal(r.sourceFailures.length,1);
    assert.equal(r.sourceFailures[0].source,"rdap");
    assert.deepEqual(h.calls,{registry:1,ofac:1,rdap:1});
  }
});
test("valid company not found and unregistered domain preserve completed-result semantics",async()=>{
  const absent=harness(e=>{
    e.registry.strongMatch=false;
    e.registry.candidateCount=0;
    e.registry.strongCandidateCount=0;
    e.registry.entity=null;
  });
  const r=await absent.service.check(QUERY);
  assert.equal(r.decision,"human_review");
  assert.equal(r.chargeable,true);
  assert.deepEqual(absent.calls,{registry:1,ofac:0,rdap:0});
  const unregistered=harness(e=>{e.rdap.registered=false;e.rdap.events={};});
  const r2=await unregistered.service.check(QUERY);
  assert.equal(r2.decision,"human_review");
  assert.equal(r2.chargeable,true);
  assert.deepEqual(r2.sourceFailures,[]);
});
function getFactory(exports,source){
  const named=Object.entries(exports).filter(([name,value])=>
    typeof value==="function"&&/^createPaid.*Handler$/.test(name));
  assert.equal(named.length,1,source+" must have exactly one factory");
  return named[0][1];
}
const HAND=getFactory({createPaidCounterpartyReviewHandler},"handwritten");
const GENERATOR=getFactory(PAID_HANDLER_MODULES["pa-vendor-counterparty-review"],"generated");
function signed(){return encodeHeader({x402Version:2,payload:{signed:true}});}
async function runPayment(factory,modify){
  const h=harness(modify);
  const urls=[];
  const fetchImpl=async url=>{
    const str=String(url);urls.push(str);
    if(str.endsWith("/verify")){
      return {ok:true,status:200,async json(){return {isValid:true};}};
    }
    if(str.endsWith("/settle")){
      return {ok:true,status:200,async json(){return {success:true,transaction:"0xtest"};}};
    }
    throw new Error("unapproved external network request");
  };
  const handler=factory({service:h.service,publicApiBase:"https://candidate.example",fetchImpl});
  const response=await handler({query:QUERY,event:{headers:{"payment-signature":signed()}}});
  return {response,urls,calls:h.calls};
}
for(const [name,factory] of [["handwritten",HAND],["generated",GENERATOR]]){
  test(name+" withholds x402 settlement on contradictory OFAC and RDAP evidence",async()=>{
    for(const mutate of [
      e=>{e.ofac.query="Other LLC";},
      e=>{e.ofac.available=false;},
      e=>{e.rdap.events.registration="2026-02-31";},
      e=>{e.rdap.events={};}
    ]){
      const x=await runPayment(factory,mutate);
      assert.equal(x.response.statusCode,502);
      assert.equal(JSON.parse(x.response.body).chargeable,false);
      assert.deepEqual(x.urls.map(u=>u.split("/").at(-1)),["verify"]);
      assert.equal(x.response.headers["PAYMENT-RESPONSE"],undefined);
      assert.equal(x.response.headers["x402-settled"],undefined);
    }
  });
  test(name+" preserves paid success only with coherent required source evidence",async()=>{
    const x=await runPayment(factory,e=>{e.registry.candidateCount=2;});
    assert.equal(x.response.statusCode,200);
    assert.equal(x.response.headers["x402-settled"],"true");
    assert.deepEqual(x.urls.map(u=>u.split("/").at(-1)),["verify","settle"]);
    assert.equal(JSON.parse(x.response.body).decision,"proceed");
    assert.equal(JSON.parse(x.response.body).price,"$0.010");
  });
}
