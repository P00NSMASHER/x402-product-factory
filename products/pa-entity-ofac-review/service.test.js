"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {validatePaEntityOfacInput,createPaEntityOfacReviewService}=require("./service");

test("input defaults OFAC threshold to 90",()=>{
  assert.deepEqual(
    validatePaEntityOfacInput({company:"OpenAI OpCo"}),
    {company:"OpenAI OpCo",minScore:90}
  );
});

test("service screens resolved legal name rather than raw query",async()=>{
  let screened=null;
  const service=createPaEntityOfacReviewService({
    registry:{async lookup(){return{
      available:true,strongMatch:true,ambiguous:false,candidateCount:1,
      entity:{businessName:"Openai Opco, Llc",filingNumber:"0014879623"}
    };}},
    ofac:{async lookup(input){screened=input;return{
      available:true,totalCandidatesAboveThreshold:0,candidates:[]
    };}},
    now:()=>"2026-10-02T14:00:00.000Z"
  });
  const r=await service.check({company:"OpenAI OpCo",minScore:"90"});
  assert.equal(r.decision,"no_candidate");
  assert.deepEqual(screened,{name:"Openai Opco, Llc",minScore:90,limit:3});
  assert.equal(r.chargeable,true);
});

test("company_not_found skips OFAC lookup and remains chargeable completed evidence",async()=>{
  let ofacCalls=0;
  const service=createPaEntityOfacReviewService({
    registry:{async lookup(){return{
      available:true,strongMatch:false,ambiguous:false,candidateCount:0,entity:null
    };}},
    ofac:{async lookup(){ofacCalls++;return{};}}
  });
  const r=await service.check({company:"Definitely Missing Company"});
  assert.equal(r.decision,"company_not_found");
  assert.equal(r.chargeable,true);
  assert.equal(ofacCalls,0);
});

test("registry transport failure is non-chargeable and skips OFAC",async()=>{
  let ofacCalls=0;
  const service=createPaEntityOfacReviewService({
    registry:{async lookup(){const e=new Error("timeout");e.code="SOURCE_HTTP_ERROR";throw e;}},
    ofac:{async lookup(){ofacCalls++;return{};}}
  });
  const r=await service.check({company:"OpenAI OpCo"});
  assert.equal(r.decision,"human_review");
  assert.equal(r.chargeable,false);
  assert.equal(ofacCalls,0);
});

test("OFAC transport failure is non-chargeable after successful registry resolution",async()=>{
  const service=createPaEntityOfacReviewService({
    registry:{async lookup(){return{
      available:true,strongMatch:true,ambiguous:false,candidateCount:1,
      entity:{businessName:"Openai Opco, Llc"}
    };}},
    ofac:{async lookup(){const e=new Error("timeout");e.code="SOURCE_HTTP_ERROR";throw e;}}
  });
  const r=await service.check({company:"OpenAI OpCo"});
  assert.equal(r.decision,"human_review");
  assert.equal(r.chargeable,false);
  assert.equal(r.sourceFailures[0].source,"ofac_sdn");
});

test("invalid threshold is rejected before source work",async()=>{
  let registryCalls=0;
  const service=createPaEntityOfacReviewService({
    registry:{async lookup(){registryCalls++;return{};}},
    ofac:{async lookup(){return{};}}
  });
  await assert.rejects(()=>service.check({company:"OpenAI",minScore:101}),e=>e.code==="INVALID_INPUT");
  assert.equal(registryCalls,0);
});
