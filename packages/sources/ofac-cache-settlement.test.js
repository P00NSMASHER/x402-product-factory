"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createFactoryRuntime}=require("../../runtime/create-runtime");
const {createOfacNameAdapter}=require("./ofac-name-screen");
const {encodeHeader,FACILITATOR}=require("../x402/payment");

const NOW="2026-10-12T12:00:00.000Z";
const REQUESTS=[
  {product:"ofac-name-review-gate",path:"/api/ofac-name-review-gate",
    query:{name:"Example LLC",minScore:"90"}},
  {product:"pa-entity-ofac-review",path:"/api/pa-entity-ofac-review",
    query:{company:"Example LLC",minScore:"90"}},
  {product:"pa-vendor-counterparty-review",path:"/api/pa-vendor-counterparty-review",
    query:{company:"Example LLC",domain:"example.com",
      minScore:"90",minDomainAgeDays:"90"}}
];
const payload=encodeHeader({x402Version:2,payload:{fixture:true}});
const stableRegistry={available:true,strongMatch:true,ambiguous:false,
  candidateCount:1,strongCandidateCount:1,identityComplete:true,matchScore:0,
  entity:{businessName:"Example LLC",filingNumber:"1",
    registrationType:"LLC",address1:"100 Sample Rd",city:"Sample",state:"PA",zip:"19000"}
};
test("stale OFAC refresh failures prevent charging across three existing paid products",async()=>{
  const clock={ms:Date.parse(NOW)};
  const state={feed:"healthy",sourceFetches:0,settlements:0,verifications:0};
  const ofac=createOfacNameAdapter({
    cacheTtlMs:1000,now:()=>clock.ms,
    fetchImpl:async url=>{
      state.sourceFetches++;
      if(state.feed==="offline")return{status:503,ok:false,async text(){return"";}};
      const sdn="100,Example LLC,Entity,TEST,,,,,,,,\n";
      return{status:200,ok:true,async text(){
        return String(url).endsWith("SDN.CSV")?sdn:"";
      }};
    }
  });
  const adapters={
    ofac,
    registry:{async lookup(){return structuredClone(stableRegistry);}},
    rdap:{async lookup({domain}){
      return {available:true,registered:true,domain,
        events:{registration:"2020-01-01T00:00:00Z"}};
    }},
    address:{async compare(){throw new Error("Census not expected for these routes");}},
    sec:{async lookup(){throw new Error("SEC not expected for these routes");}},
    treasury:{
      async lookup(){throw new Error("Treasury not expected");},
      async history(){throw new Error("Treasury history not expected");},
      async compare(){throw new Error("Treasury compare not expected");}
    }
  };
  const facilitator=async url=>{
    if(String(url)===FACILITATOR+"/verify"){
      state.verifications++;
      return{status:200,ok:true,async json(){return{isValid:true}}};
    }
    if(String(url)===FACILITATOR+"/settle"){
      state.settlements++;
      return{status:200,ok:true,async json(){
        return{success:true,transaction:"0xsynthetic"}
      }};
    }
    throw new Error("Unapproved external network in mock x402 fixture");
  };
  const runtime=createFactoryRuntime({
    publicApiBase:"https://candidate.example",
    adapters,fetchImpl:facilitator,now:()=>NOW
  });
  const handle=async request=>runtime.handle({
    method:"GET",path:request.path,query:request.query,
    event:{headers:{"payment-signature":payload}}
  });
  const first=await handle(REQUESTS[2]);
  assert.equal(first.statusCode,200);
  assert.equal(JSON.parse(first.body).chargeable,true);
  assert.equal(state.sourceFetches,2);
  assert.equal(state.settlements,1);
  state.feed="offline";clock.ms+=1000;
  for(const request of REQUESTS){
    const before=state.settlements;
    const result=await handle(request);
    assert.equal(result.statusCode,502,request.product);
    const body=JSON.parse(result.body);
    assert.equal(body.chargeable,false,request.product);
    assert.equal(body.error,"required_source_unavailable",request.product);
    assert.deepEqual(body.sourceFailures.map(x=>x.source),["ofac_sdn"]);
    assert.equal(state.settlements,before,request.product+" accidentally settled");
    assert.equal(result.headers["PAYMENT-RESPONSE"],undefined);
    assert.equal(result.headers["x402-settled"],undefined);
  }
  assert.equal(state.settlements,1);
  assert.equal(state.verifications,4);
  assert.equal(state.sourceFetches,8);
  // Even after a failed refresh, the next lookup can recover atomically.
  state.feed="healthy";
  const recovered=await handle(REQUESTS[2]);
  assert.equal(recovered.statusCode,200);
  assert.equal(state.sourceFetches,10);
  assert.equal(state.settlements,2);
  assert.equal(JSON.parse(recovered.body).chargeable,true);
});
