"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {loadSpecs}=require("../../scripts/generate-spec-artifacts");
const registry=require("../../product-registry.json");
const {createFactoryRuntime,chooseFactory}=require("../../runtime/create-runtime");
const {PAID_HANDLER_MODULES}=require("../../generated/product-modules");
const {encodeHeader}=require("../../packages/x402/payment");
const NOW="2026-10-12T12:00:00Z", BASE="https://candidate.example";
const SECRET="PRIVATE_RDAP_RESPONSE_DO_NOT_ECHO";
const SIGNATURE=encodeHeader({x402Version:2,payload:{synthetic:true}});
const PROFILES=[
  {number:"007",key:"registration",alias:"registered",date:"2020-01-01",positive:"established",recent:"recent_registration",field:"registrationDate"},
  {number:"011",key:"expiration",alias:"expiry",date:"2027-01-01",positive:"not_expiring_soon",recent:"expiring_soon",field:"expirationDate"},
  {number:"012",key:"lastChanged",date:"2020-01-01",positive:"stable_since_window",recent:"recently_changed",field:"lastChangedDate"}
];
const specs=loadSpecs();
const cases=PROFILES.map(profile=>({...profile,spec:specs.find(s=>s.number===profile.number)}));
function evidence(p){return {available:true,registered:true,domain:"example.com",events:{[p.key]:p.date}};}
async function invoke(p,raw,implementation){
  const calls={lookup:0,verify:0,settle:0,clock:0,unexpected:0};
  const impossible=async()=>{calls.unexpected++;throw new Error("unexpected adapter/network");};
  const fetchImpl=async url=>{
    if(String(url).endsWith("/verify")){calls.verify++;return {ok:true,status:200,json:async()=>({isValid:true})};}
    if(String(url).endsWith("/settle")){calls.settle++;return {ok:true,status:200,json:async()=>({success:true,transaction:"0xmock"})};}
    return impossible();
  };
  const runtime=createFactoryRuntime({publicApiBase:BASE,
    now:()=>{calls.clock++;return NOW;},fetchImpl,adapters:{
      rdap:{lookup:async query=>{calls.lookup++;assert.equal(query.domain,"example.com");return structuredClone(raw);}},
      registry:{lookup:impossible},address:{compare:impossible},sec:{lookup:impossible},
      ofac:{lookup:impossible,screen:impossible},treasury:{lookup:impossible,history:impossible,compare:impossible,latest:impossible}
    }});
  const args={query:{...p.spec.api.example_query,domain:"Example.COM."},event:{headers:{"payment-signature":SIGNATURE}}};
  const product=registry.products.find(row=>row.id===p.spec.id);
  const result=implementation==="generated"
    ? await runtime.handle({method:"GET",path:product.path,...args})
    : await chooseFactory(PAID_HANDLER_MODULES[p.spec.id],{kind:"handler",productId:p.spec.id})({
      service:runtime.services[p.spec.id],publicApiBase:BASE,fetchImpl
    })(args);
  return {result,body:JSON.parse(result.body),calls};
}
async function rejects(p,raw){
  for(const implementation of ["generated","handwritten"]){
    const x=await invoke(p,{...raw,privateDebug:SECRET},implementation);
    assert.equal(x.result.statusCode,502,p.number+" "+implementation+" must refuse invalid source evidence before billing");
    assert.equal(x.body.error,"required_source_unavailable");
    assert.equal(x.body.chargeable,false);
    assert.deepEqual(x.body.sourceFailures,[{source:"rdap",detail:"SOURCE_CONTRACT_INVALID"}]);
    assert.equal(x.calls.verify,1);assert.equal(x.calls.lookup,1);assert.equal(x.calls.settle,0);
    assert.equal(x.calls.unexpected,0);
    assert.equal(x.result.headers["PAYMENT-RESPONSE"],undefined);
    assert.equal(x.result.headers["x402-settled"],undefined);
    assert.equal(JSON.stringify(x.result).includes(SECRET),false);
  }
}
async function completed(p,raw,decision){
  for(const implementation of ["generated","handwritten"]){
    const x=await invoke(p,raw,implementation);
    assert.equal(x.result.statusCode,200,p.number+" "+implementation);
    assert.equal(x.body.decision,decision);assert.equal(x.body.chargeable,true);assert.equal(x.body.paid,true);
    assert.deepEqual(x.body.sourceFailures,[]);
    assert.equal(x.calls.lookup,1);assert.equal(x.calls.verify,1);assert.equal(x.calls.settle,1);assert.equal(x.calls.unexpected,0);
  }
}
test("domain gate covers exactly the three existing standalone staging products",()=>{
  assert.deepEqual(cases.map(p=>p.spec.number),["007","011","012"]);
  for(const p of cases)assert.match(registry.products.find(row=>row.id===p.spec.id).status,/staging$/);
});
for(const p of cases){
  const mutations=[
    ["wrong requested domain",raw=>{raw.domain="other.example";}],
    ["missing requested domain",raw=>{delete raw.domain;}],
    ["unknown registration status",raw=>{delete raw.registered;}],
    ["nonboolean registration status",raw=>{raw.registered="false";}],
    ["array instead of event map",raw=>{raw.events=[];}],
    ["absent event map",raw=>{delete raw.events;}],
    ["null event map",raw=>{raw.events=null;}],
    ["contradictory unregistered event",raw=>{raw.registered=false;}]
  ];
  for(const [label,mutate] of mutations){
    test(p.number+" refuses "+label+" without settlement",async()=>{const raw=evidence(p);mutate(raw);await rejects(p,raw);});
  }
  for(const date of ["2025-02-29","2026-04-31","2026-01-01garbage","2026-01-01T24:00:00Z","2026-01-01T12:60:00Z","2026-01-01T00:00:00+24:00","2026-01-01T00:00:00","not-a-date","",17,{}]){
    test(p.number+" refuses malformed date "+JSON.stringify(date),async()=>{const raw=evidence(p);raw.events[p.key]=date;await rejects(p,raw);});
  }
  if(p.key!=="expiration"){
    for(const date of ["2026-10-13","2026-10-12T12:00:01Z","2026-10-12T23:30:00-02:00"]){
      test(p.number+" refuses future past-event "+date,async()=>{const raw=evidence(p);raw.events[p.key]=date;await rejects(p,raw);});
    }
  }
  if(p.alias){
    test(p.number+" refuses conflicting aliases",async()=>{const raw=evidence(p);raw.events[p.alias]="2024-02-29";await rejects(p,raw);});
    test(p.number+" refuses malformed nonselected alias",async()=>{const raw=evidence(p);raw.events[p.alias]="2025-02-29";await rejects(p,raw);});
    test(p.number+" accepts the documented fallback alias",async()=>{const raw=evidence(p);delete raw.events[p.key];raw.events[p.alias]=p.date;await completed(p,raw,p.positive);});
    test(p.number+" accepts equivalent timestamp aliases",async()=>{const raw=evidence(p);raw.events[p.alias]=p.date+"T00:00:00Z";await completed(p,raw,p.positive);});
  }
  test(p.number+" retains successful ordinary decisions",()=>completed(p,evidence(p),p.positive));
  test(p.number+" retains genuine no-registration outcomes",()=>completed(p,{available:true,registered:false,domain:"example.com",events:{}},"unregistered"));
  test(p.number+" retains completed missing-event human review",()=>completed(p,{available:true,registered:true,domain:"example.com",events:{}},"human_review"));
  test(p.number+" retains null missing-event human review",()=>completed(p,{available:true,registered:true,domain:"example.com",events:{[p.key]:null}},"human_review"));
  test(p.number+" accepts valid leap-day evidence",()=>completed(p,{...evidence(p),events:{[p.key]:"2024-02-29T00:00:00.123456789Z"}},p.key==="expiration"?p.recent:p.positive));
  test(p.number+" preserves completed adverse signal",()=>completed(p,{...evidence(p),events:{[p.key]:p.key==="expiration"?"2026-10-01":"2026-10-11"}},p.recent));
  test(p.number+" uses the actual UTC day for offset timestamps",async()=>{
    const raw={...evidence(p),events:{[p.key]:"2026-10-11T23:30:00-02:00"}};
    for(const implementation of ["generated","handwritten"]){
      const x=await invoke(p,raw,implementation);
      assert.equal(x.result.statusCode,200);
      assert.equal(x.body[p.field],"2026-10-12");
      assert.equal(p.key==="expiration"?x.body.daysUntilExpiration:x.body.ageDays,0);
      assert.equal(x.calls.settle,1);
    }
  });
}
