"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const registry=require("../../product-registry.json");
const {SERVICE_MODULES:SPEC_SERVICES,PAID_HANDLER_MODULES:GENERATED}=
  require("../../generated/spec-paid-handlers");
const {PAID_HANDLER_MODULES:HANDWRITTEN}=require("../../generated/product-modules");
const {encodeHeader}=require("../../packages/x402/payment");

const NOW="2026-10-02T12:00:00Z";
const PRODUCTS=[
  {number:"016",id:"pa-entity-ofac-review",
    query:{company:"Example LLC",minScore:"90"},
    good:"no_candidate",adverse:"candidate_found",source:"ofac_sdn"},
  {number:"017",id:"pa-vendor-new-domain-review",
    query:{company:"Example LLC",domain:"example.com",minDomainAgeDays:"90"},
    good:"established_domain_match",adverse:"unregistered_domain",source:"rdap"},
  {number:"019",id:"pa-vendor-maturity-review",
    query:{company:"Example LLC",domain:"example.com",minEntityAgeDays:"30",minDomainAgeDays:"90"},
    good:"established_vendor",adverse:"human_review",source:"rdap"},
  {number:"020",id:"pa-vendor-domain-continuity-review",
    query:{company:"Example LLC",domain:"example.com",minExpirationDays:"180",minStableDays:"30"},
    good:"stable_domain",adverse:"human_review",source:"rdap"}
];
function fixtureState(){
  return {
    registry:{available:true,strongMatch:true,ambiguous:false,candidateCount:2,
      strongCandidateCount:1,identityComplete:true,matchScore:0,
      entity:{businessName:"Example LLC",filingNumber:"SYNTHETIC",
        registrationType:"LLC",creationDate:"2020-01-01",address1:"100 Mock St",
        city:"Pottsville",state:"PA",zip:"17901"}},
    ofac:{available:true,query:"Example LLC",minScore:90,
      totalCandidatesAboveThreshold:0,candidates:[]},
    rdap:{available:true,registered:true,domain:"example.com",events:{
      registration:"2015-01-01T00:00:00Z",expiration:"2029-01-19T00:00:00Z",
      lastChanged:"2024-10-17T00:00:00Z"}}
  };
}
function factory(mod,type){
  const matches=Object.entries(mod||{}).filter(([name,value])=>
    typeof value==="function"&&
    (type==="service"?/^create.*Service$/:/^createPaid.*Handler$/).test(name));
  assert.equal(matches.length,1,"exactly one "+type+" factory");
  return matches[0][1];
}
function harness(spec,edit=null){
  const state=fixtureState();
  if(edit)edit(state);
  const calls={registry:0,ofac:0,rdap:0};
  const copy=x=>x instanceof Error?x:structuredClone(x);
  const adapter={
    registry:{async lookup(){
      calls.registry++;
      if(state.registry instanceof Error)throw state.registry;
      return copy(state.registry);
    }},
    ofac:{async lookup(){
      calls.ofac++;
      if(state.ofac instanceof Error)throw state.ofac;
      return copy(state.ofac);
    }},
    rdap:{async lookup(){
      calls.rdap++;
      if(state.rdap instanceof Error)throw state.rdap;
      return copy(state.rdap);
    }}
  };
  const service=factory(SPEC_SERVICES[spec.id],"service")({...adapter,now:()=>NOW});
  return {service,calls};
}
function expectedSourceCount(spec){
  return spec.number==="016"?{registry:1,ofac:1,rdap:0}
    :{registry:1,ofac:0,rdap:1};
}
function badContract(spec){
  if(spec.number==="016")return e=>{e.ofac.query="Different LLC";};
  if(spec.number==="020")return e=>{e.rdap.events.lastChanged="2026-02-31";};
  return e=>{e.rdap.events.registration="2026-02-31";};
}
function validAdverse(spec){
  if(spec.number==="016"){
    return e=>{e.ofac.totalCandidatesAboveThreshold=1;
      e.ofac.candidates=[{score:98,primaryName:"Example LLC"}];};
  }
  if(spec.number==="017")return e=>{e.rdap.registered=false;e.rdap.events={};};
  if(spec.number==="019")return e=>{e.registry.entity.creationDate="2026-09-25";};
  return e=>{e.rdap.events.expiration="2026-10-12";};
}
const signature=()=>encodeHeader({x402Version:2,payload:{synthetic:true}});
async function paid(spec,which,edit){
  const h=harness(spec,edit),traffic=[];
  const fetchImpl=async url=>{
    if(!String(url).startsWith("https://facilitator.payai.network/")){
      throw new Error("synthetic test must not contact unknown endpoint");
    }
    const action=String(url).split("/").at(-1);
    traffic.push(action);
    return {
      ok:true,status:200,
      async json(){
        return action==="verify"?{isValid:true}:
          action==="settle"?{success:true,transaction:"0xmock"}:{error:"unexpected"};
      }
    };
  };
  const impl=which==="generated"?GENERATED[spec.id]:HANDWRITTEN[spec.id];
  const create=factory(impl,"handler");
  const handler=create({service:h.service,publicApiBase:"https://candidate.example",fetchImpl});
  const response=await handler({query:spec.query,event:{headers:{"payment-signature":signature()}}});
  return {response,traffic,calls:h.calls};
}
for(const spec of PRODUCTS){
  test(spec.number+" coherent source evidence stays paid and follows the original decision",async()=>{
    const h=harness(spec);
    const r=await h.service.check(spec.query);
    assert.equal(r.decision,spec.good);
    assert.equal(r.chargeable,true);
    assert.deepEqual(r.sourceFailures,[]);
    assert.deepEqual(h.calls,expectedSourceCount(spec));
  });
  test(spec.number+" legitimate adverse evidence remains a chargeable completed result",async()=>{
    const h=harness(spec,validAdverse(spec));
    const r=await h.service.check(spec.query);
    assert.equal(r.decision,spec.adverse);
    assert.equal(r.chargeable,true);
    assert.deepEqual(r.sourceFailures,[]);
  });
  test(spec.number+" invalid claimed strong registry evidence blocks dependent adapter calls",async()=>{
    const h=harness(spec,e=>{e.registry.strongCandidateCount=2;});
    const r=await h.service.check(spec.query);
    assert.equal(r.decision,"human_review");
    assert.equal(r.chargeable,false);
    assert.deepEqual(r.sourceFailures.map(e=>e.source),["pa_registry"]);
    assert.deepEqual(h.calls,{registry:1,ofac:0,rdap:0});
  });
  test(spec.number+" adapter returned available:false is non-chargeable",async()=>{
    for(const source of ["registry",spec.number==="016"?"ofac":"rdap"]){
      const h=harness(spec,e=>{e[source].available=false;});
      const r=await h.service.check(spec.query);
      assert.equal(r.decision,"human_review");
      assert.equal(r.chargeable,false);
      assert.deepEqual(r.sourceFailures.map(e=>e.source),[
        source==="registry"?"pa_registry":spec.source
      ]);
      if(source==="registry"){
        assert.deepEqual(h.calls,{registry:1,ofac:0,rdap:0});
      }
    }
  });
  test(spec.number+" contradictory source evidence is a non-chargeable review",async()=>{
    const h=harness(spec,badContract(spec));
    const r=await h.service.check(spec.query);
    assert.equal(r.decision,"human_review");
    assert.equal(r.chargeable,false);
    assert.deepEqual(r.sourceFailures.map(e=>e.source),[spec.source]);
    assert.ok(r.reasonCodes.includes("REQUIRED_SOURCE_EVIDENCE_UNAVAILABLE"));
  });
  test(spec.number+" upstream exceptions never echo private provider details",async()=>{
    const secret="SYNTHETIC_DO_NOT_ECHO_PRIVATE_TOKEN";
    const error=new Error(secret);
    error.code="PRIVATE_"+secret;
    const h=harness(spec,e=>{e[spec.number==="016"?"ofac":"rdap"]=error;});
    const r=await h.service.check(spec.query);
    assert.equal(r.chargeable,false);
    assert.equal(r.sourceFailures[0].detail,"SOURCE_ADAPTER_FAILURE");
    assert.equal(JSON.stringify(r.sourceFailures).includes(secret),false);
  });
  for(const mode of ["handwritten","generated"]){
    test(spec.number+" "+mode+" x402 never settles on a source-contract failure",async()=>{
      const x=await paid(spec,mode,badContract(spec));
      assert.equal(x.response.statusCode,502);
      assert.equal(JSON.parse(x.response.body).chargeable,false);
      assert.deepEqual(x.traffic,["verify"]);
      assert.equal(x.response.headers["x402-settled"],undefined);
      assert.equal(x.response.headers["PAYMENT-RESPONSE"],undefined);
    });
    test(spec.number+" "+mode+" x402 preserves paid success for coherent data",async()=>{
      const x=await paid(spec,mode);
      assert.equal(x.response.statusCode,200);
      assert.equal(x.response.headers["x402-settled"],"true");
      assert.deepEqual(x.traffic,["verify","settle"]);
      const row=registry.products.find(p=>p.number===spec.number);
      assert.ok(row);
      assert.equal(JSON.parse(x.response.body).decision,spec.good);
      assert.equal(JSON.parse(x.response.body).price,"$"+row.price_usdc);
    });
  }
}
test("coverage is limited to the existing registered composite products",()=>{
  assert.deepEqual(PRODUCTS.map(x=>x.number),["016","017","019","020"]);
  assert.ok(PRODUCTS.every(x=>registry.products.some(r=>r.id===x.id&&
    r.number===x.number&&r.status.endsWith("staging"))));
});
