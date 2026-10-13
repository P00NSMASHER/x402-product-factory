"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createRdapAdapter,IANA_RDAP_BOOTSTRAP}=require("./live-pa-identity");
const {createFactoryRuntime,chooseFactory}=require("../../runtime/create-runtime");
const {PAID_HANDLER_MODULES}=require("../../generated/product-modules");
const {loadSpecs}=require("../../scripts/generate-spec-artifacts");
const registry=require("../../product-registry.json");
const {encodeHeader}=require("../x402/payment");
const BASE="https://candidate.example";
const PAYMENT=encodeHeader({x402Version:2,payload:{synthetic:true}});
const SECRET="PRIVATE_INVALID_RDAP_PAYLOAD_NEVER_DISCLOSE";
function rawRecord(overrides={}) {
  return {objectClassName:"domain",ldhName:"example.com",
    events:[{eventAction:"registration",eventDate:"2020-01-01T00:00:00Z"},
      {eventAction:"expiration",eventDate:"2028-01-01T00:00:00Z"},
      {eventAction:"last changed",eventDate:"2025-01-01T00:00:00Z"}],
    entities:[],...overrides};
}
function fakeResponse(body,status=200){return{status,ok:status>=200&&status<300,json:async()=>structuredClone(body)};}
function provider(raw,{status=200,domain="example.com"}={}) {
  const calls=[];
  const fetchImpl=async (url)=>{
    const u=String(url); calls.push(u);
    if(u===IANA_RDAP_BOOTSTRAP)return fakeResponse({services:[[[domain.split(".").pop()],["https://rdap.identity-test.example/"]]]});
    assert.equal(u,"https://rdap.identity-test.example/domain/"+domain);
    return fakeResponse(raw,status);
  };
  return {adapter:createRdapAdapter({fetchImpl}),calls,fetchImpl};
}
function isSanitizedSourceFailure(error) {
  return error?.code==="SOURCE_CONTRACT_INVALID" &&
    error?.message==="rdap_source_contract_invalid" &&
    !String(error?.message).includes(SECRET);
}
test("matching authoritative domain payload is registered and case/dot-normalized",async()=>{
  const x=provider(rawRecord({ldhName:"EXAMPLE.COM."}));
  const result=await x.adapter.lookup({domain:"Example.COM."});
  assert.equal(result.registered,true);
  assert.equal(result.available,true);
  assert.equal(result.domain,"example.com");
  assert.equal(result.events.registration,"2020-01-01T00:00:00Z");
  assert.equal(x.calls.length,2);
});
test("matching ASCII punycode domain identity stays registered",async()=>{
  const domain="xn--bcher-kva.example";
  const x=provider(rawRecord({ldhName:"XN--BCHER-KVA.EXAMPLE",events:[]}),{domain});
  const result=await x.adapter.lookup({domain});
  assert.equal(result.registered,true);
  assert.deepEqual(result.events,{});
});
test("complete identity with no domain events remains a registered human-review candidate",async()=>{
  const result=await provider(rawRecord({events:undefined})).adapter.lookup({domain:"example.com"});
  assert.equal(result.registered,true);
  assert.deepEqual(result.events,{});
});
test("authoritative 404 remains a valid unregistered domain",async()=>{
  const x=provider({privateProviderDebug:SECRET},{status:404});
  const result=await x.adapter.lookup({domain:"example.com"});
  assert.equal(result.registered,false);
  assert.equal(result.available,true);
  assert.equal(result.domain,"example.com");
});
const bad=[
  ["unrelated domain",()=>rawRecord({ldhName:"unrelated.example"})],
  ["parent/child domain substitution",()=>rawRecord({ldhName:"sub.example.com"})],
  ["missing ldhName",()=>rawRecord({ldhName:undefined})],
  ["numeric ldhName",()=>rawRecord({ldhName:42})],
  ["malformed ldhName",()=>rawRecord({ldhName:"example.com/redirect"})],
  ["unicode-only response without matching ASCII identity",()=>({objectClassName:"domain",unicodeName:"exämple.com",events:[]})],
  ["wrong object class",()=>rawRecord({objectClassName:"entity"})],
  ["missing object class",()=>rawRecord({objectClassName:undefined})],
  ["array provider body",()=>[]],
  ["null provider body",()=>null],
  ["empty provider body",()=>({})],
];
for(const [label,make] of bad){
  test("rejects "+label+" instead of asserting registration",async()=>{
    const x=provider({...make(),privateProviderDebug:SECRET});
    await assert.rejects(()=>x.adapter.lookup({domain:"example.com"}),isSanitizedSourceFailure);
    assert.equal(x.calls.length,2);
  });
}
const specs=loadSpecs();
const relevant=["007","011","012"].map(number=>specs.find(s=>s.number===number));
test("billing test targets existing three standalone domain products",()=>{
  assert.deepEqual(relevant.map(x=>x?.number),["007","011","012"]);
});
async function paidProbe(spec,implementation) {
  const calls={verify:0,settle:0,lookups:0,unexpected:0};
  const p=registry.products.find(x=>x.id===spec.id);
  const fetchImpl=async(url)=>{
    const u=String(url);
    if(u.endsWith("/verify")){calls.verify++;return fakeResponse({isValid:true});}
    if(u.endsWith("/settle")){calls.settle++;return fakeResponse({success:true,transaction:"0xmock"});}
    calls.unexpected++;
    throw new Error("unexpected payment or source request");
  };
  const rdap=createRdapAdapter({fetchImpl:async(url)=>{
    calls.lookups++;
    const u=String(url);
    if(u===IANA_RDAP_BOOTSTRAP)return fakeResponse({services:[[["com"],["https://rdap.identity-test.example/"]]]});
    assert.equal(u,"https://rdap.identity-test.example/domain/example.com");
    return fakeResponse(rawRecord({ldhName:"attacker.example",privateProviderDebug:SECRET}));
  }});
  const badAdapter=async()=>{calls.unexpected++;throw new Error("unexpected external source");};
  const runtime=createFactoryRuntime({publicApiBase:BASE,now:()=>"2026-10-12T12:00:00Z",fetchImpl,
    adapters:{rdap,registry:{lookup:badAdapter},address:{compare:badAdapter},
      sec:{lookup:badAdapter},treasury:{lookup:badAdapter,history:badAdapter,compare:badAdapter,latest:badAdapter},
      ofac:{lookup:badAdapter,screen:badAdapter}}});
  const args={query:{...spec.api.example_query,domain:"Example.COM."},event:{headers:{"payment-signature":PAYMENT}}};
  const result=implementation==="generated"?await runtime.handle({method:"GET",path:p.path,...args}):
    await chooseFactory(PAID_HANDLER_MODULES[spec.id],{kind:"handler",productId:spec.id})({
      service:runtime.services[spec.id],publicApiBase:BASE,fetchImpl
    })(args);
  return {result,body:JSON.parse(result.body),calls};
}
for(const p of relevant){
  for(const implementation of ["generated","handwritten"]){
    test(p.number+" "+implementation+" refuses raw wrong-identity RDAP without x402 settlement",async()=>{
      const x=await paidProbe(p,implementation);
      assert.equal(x.result.statusCode,502);
      assert.equal(x.body.chargeable,false);
      assert.equal(x.body.error,"required_source_unavailable");
      assert.deepEqual(x.body.sourceFailures,[{source:"rdap",detail:"SOURCE_CONTRACT_INVALID"}]);
      assert.equal(x.calls.verify,1);
      assert.equal(x.calls.settle,0);
      assert.equal(x.calls.lookups,2);
      assert.equal(x.calls.unexpected,0);
      assert.equal(x.result.headers["PAYMENT-RESPONSE"],undefined);
      assert.equal(JSON.stringify(x.result).includes(SECRET),false);
    });
  }
}
