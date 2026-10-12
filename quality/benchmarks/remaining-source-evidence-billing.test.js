"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {loadSpecs}=require("../../scripts/generate-spec-artifacts");
const registry=require("../../product-registry.json");
const {createFactoryRuntime,chooseFactory}=require("../../runtime/create-runtime");
const {PAID_HANDLER_MODULES:HANDWRITTEN}=require("../../generated/product-modules");
const {encodeHeader}=require("../../packages/x402/payment");
const {trackRequiredEvidence,safeSourceErrorCode,sourceUnavailable}=
  require("../../packages/sources/contracts");

const SKIP_NUMBERS=new Set(["016","017","018","019","020"]);
const specs=loadSpecs().filter(s=>!SKIP_NUMBERS.has(s.number));
const SIGNATURE=encodeHeader({x402Version:2,payload:{synthetic:true}});
const SECRET="PRIVATE_INTERNAL_FACILITATOR_TOKEN_DO_NOT_ECHO";
const BASE="https://candidate.example";
function mockAdapters(mode="unavailable"){
  const calls={registry:0,address:0,rdap:0,sec:0,treasury:0,ofac:0};
  function lookup(name){
    return async()=>{
      calls[name]++;
      if(mode==="error"){
        const failure=new Error("Private upstream "+SECRET);
        failure.code="SECRET_"+SECRET;
        throw failure;
      }
      if(mode==="valid_negative"){
        if(name==="registry")return{
          available:true,strongMatch:false,ambiguous:false,
          candidateCount:0,strongCandidateCount:0,entity:null
        };
        if(name==="rdap")return{
          available:true,registered:false,domain:"example.com",events:{}
        };
        if(name==="ofac")return{
          available:true,query:"Example LLC",minScore:90,
          totalCandidatesAboveThreshold:0,candidates:[]
        };
      }
      // Returns successfully at transport layer, but source evidence is
      // explicitly unavailable. Prior services falsely declared chargeable.
      return {available:false,detail:"PRIVATE_UPSTREAM_BODY_"+SECRET};
    };
  }
  const a={
    registry:{lookup:lookup("registry")},
    address:{compare:lookup("address")},
    rdap:{lookup:lookup("rdap")},
    sec:{lookup:lookup("sec")},
    treasury:{
      lookup:lookup("treasury"),history:lookup("treasury"),
      compare:lookup("treasury"),latest:lookup("treasury")
    },
    ofac:{lookup:lookup("ofac"),screen:lookup("ofac")}
  };
  return {a,calls};
}
function fakePayments(){
  const calls={verify:0,settle:0,unexpected:0};
  const fetchImpl=async url=>{
    const u=String(url);
    if(u.endsWith("/verify")){
      calls.verify++;return{ok:true,status:200,async json(){return{isValid:true}}};
    }
    if(u.endsWith("/settle")){
      calls.settle++;return{ok:true,status:200,async json(){return{success:true,transaction:"0xmock"}}};
    }
    calls.unexpected++;
    throw new Error("only mocked payment verifier/settler may be invoked");
  };
  return {fetchImpl,calls};
}
function setup(mode){
  const {a,calls:sourceCalls}=mockAdapters(mode);
  const {fetchImpl,calls:paymentCalls}=fakePayments();
  const runtime=createFactoryRuntime({
    publicApiBase:BASE,now:()=>"2026-10-12T12:00:00Z",
    adapters:a,fetchImpl
  });
  return {runtime,sourceCalls,paymentCalls,fetchImpl};
}
async function invoke(productSpec,mode,implementation){
  const x=setup(mode);
  const p=registry.products.find(row=>row.id===productSpec.id);
  assert.ok(p);
  const query=structuredClone(productSpec.api.example_query);
  const args={query,event:{headers:{"payment-signature":SIGNATURE}}};
  let result;
  if(implementation==="generated"){
    result=await x.runtime.handle({method:"GET",path:p.path,...args});
  }else{
    const factory=chooseFactory(HANDWRITTEN[productSpec.id],{
      kind:"handler",productId:productSpec.id
    });
    const handler=factory({
      service:x.runtime.services[productSpec.id],
      publicApiBase:BASE,fetchImpl:x.fetchImpl
    });
    result=await handler(args);
  }
  return {result,...x};
}

test("exactly 17 existing non-composite products remain in source billing audit scope",()=>{
  assert.equal(specs.length,17);
  assert.deepEqual(specs.map(s=>s.number),[
    ...Array.from({length:13},(_,i)=>String(i+3).padStart(3,"0")),
    "021","022","023","024"
  ]);
  assert.ok(specs.every(s=>registry.products.some(p=>p.id===s.id&&/staging$/.test(p.status))));
});
test("shared required evidence tracking rejects unavailable data without penalizing skipped optional checks",()=>{
  const failures=[];
  const missing=trackRequiredEvidence("pa_registry",{available:false},failures);
  assert.equal(missing.available,false);
  assert.deepEqual(failures,[{source:"pa_registry",detail:"SOURCE_UNAVAILABLE"}]);
  trackRequiredEvidence("pa_registry",null,failures);
  assert.equal(failures.length,1,"duplicate source failure must not double count");
  const optional=sourceUnavailable("census_address","registry identity not resolved");
  assert.equal(optional.available,false);
  assert.equal(failures.length,1,"skipped optional source not actually requested");
  assert.deepEqual(trackRequiredEvidence("rdap",{available:true,registered:false},failures),
    {source:"rdap",available:true,registered:false});
  assert.equal(failures.length,1);
  assert.equal(safeSourceErrorCode({code:"SOURCE_TIMEOUT"}),"SOURCE_TIMEOUT");
  assert.equal(safeSourceErrorCode({code:"SECRET_"+SECRET}),"SOURCE_ADAPTER_FAILURE");
  assert.equal(safeSourceErrorCode(new Error(SECRET)),"SOURCE_ADAPTER_FAILURE");
  assert.throws(()=>trackRequiredEvidence("rdap",{},null),/sourceFailures/);
});

for(const spec of specs){
  test(spec.number+" "+spec.id+" available:false cannot be charged by either x402 handler",async()=>{
    for(const implementation of ["generated","handwritten"]){
      const x=await invoke(spec,"unavailable",implementation);
      assert.equal(x.result.statusCode,502,spec.id+" "+implementation);
      const data=JSON.parse(x.result.body);
      assert.equal(data.error,"required_source_unavailable");
      assert.equal(data.chargeable,false);
      assert.ok(Array.isArray(data.sourceFailures)&&data.sourceFailures.length>0,
        spec.id+" "+implementation+" lacks source-failure provenance");
      assert.ok(data.sourceFailures.some(f=>f.detail==="SOURCE_UNAVAILABLE"),
        spec.id+" "+implementation+" did not mark source transport-success outage");
      assert.equal(x.paymentCalls.verify,1);
      assert.equal(x.paymentCalls.settle,0);
      assert.equal(x.paymentCalls.unexpected,0);
      assert.equal(x.result.headers["PAYMENT-RESPONSE"],undefined);
      assert.equal(x.result.headers["x402-settled"],undefined);
      assert.equal(JSON.stringify(x.result).includes(SECRET),false);
    }
  });
  test(spec.number+" "+spec.id+" exception text and arbitrary code never leak through x402",async()=>{
    for(const implementation of ["generated","handwritten"]){
      const x=await invoke(spec,"error",implementation);
      assert.equal(x.result.statusCode,502,spec.id+" "+implementation);
      assert.equal(x.paymentCalls.verify,1);
      assert.equal(x.paymentCalls.settle,0);
      assert.equal(JSON.stringify(x.result).includes(SECRET),false);
      const body=JSON.parse(x.result.body);
      assert.equal(body.chargeable,false);
      assert.ok(Array.isArray(body.sourceFailures)&&body.sourceFailures.length>0);
      assert.ok(body.sourceFailures.every(failure=>
        failure.detail==="SOURCE_ADAPTER_FAILURE"||
        failure.detail==="SOURCE_UNAVAILABLE"));
    }
  });
}
for(const number of ["003","004","024","007","011","012"]){
  test("completed negative registry/domain evidence stays chargeable for Product "+number,async()=>{
    const spec=specs.find(s=>s.number===number);
    assert.ok(spec);
    for(const implementation of ["generated","handwritten"]){
      const x=await invoke(spec,"valid_negative",implementation);
      assert.equal(x.result.statusCode,200,number+" "+implementation);
      assert.equal(x.paymentCalls.verify,1);
      assert.equal(x.paymentCalls.settle,1);
      const body=JSON.parse(x.result.body);
      assert.equal(body.paid,true);
      assert.equal(body.chargeable,true);
      assert.deepEqual(body.sourceFailures,[]);
    }
  });
}
