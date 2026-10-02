"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createCounterpartyReviewService}=require("./service");

function good(){
 return {
  registry:{async lookup({company}){return{available:true,strongMatch:true,ambiguous:false,candidateCount:1,entity:{businessName:company,filingNumber:"1",registrationType:"LLC",address1:"100 Market St",city:"Pottsville",state:"PA",zip:"17901"}};}},
  ofac:{async lookup({name,minScore}){return{available:true,query:name,minScore,totalCandidatesAboveThreshold:0,candidates:[]};}},
  rdap:{async lookup({domain}){return{available:true,registered:true,domain,events:{registration:"2020-01-01T00:00:00Z"}};}}
 };
}
test("service composes passing evidence into proceed",async()=>{
 const s=createCounterpartyReviewService({...good(),now:()=>"2026-10-02T12:00:00Z"});
 const r=await s.check({company:"Example LLC",domain:"example.com"});
 assert.equal(r.decision,"proceed");assert.equal(r.chargeable,true);assert.equal(r.resolvedLegalName,"Example LLC");
});
test("completed OFAC candidate is chargeable human review",async()=>{
 const a=good();a.ofac={async lookup({name,minScore}){return{available:true,query:name,minScore,totalCandidatesAboveThreshold:1,candidates:[{primaryName:name,score:100}]};}};
 const r=await createCounterpartyReviewService({...a,now:()=>"2026-10-02T12:00:00Z"}).check({company:"Example LLC",domain:"example.com"});
 assert.equal(r.decision,"human_review");assert.equal(r.chargeable,true);assert.ok(r.reasonCodes.includes("OFAC_CANDIDATE_REQUIRES_REVIEW"));
});
test("OFAC transport failure is non-chargeable",async()=>{
 const a=good();a.ofac={async lookup(){const e=new Error("timeout");e.code="SOURCE_TIMEOUT";throw e;}};
 const r=await createCounterpartyReviewService({...a,now:()=>"2026-10-02T12:00:00Z"}).check({company:"Example LLC",domain:"example.com"});
 assert.equal(r.decision,"human_review");assert.equal(r.chargeable,false);assert.equal(r.sourceFailures[0].source,"ofac_sdn");
});
test("invalid thresholds fail before source work",async()=>{
 let called=0;const a=good();a.registry={async lookup(){called++;return{};}};
 const s=createCounterpartyReviewService(a);
 await assert.rejects(()=>s.check({company:"Example LLC",domain:"example.com",minScore:101}),(e)=>e.code==="INVALID_INPUT");
 assert.equal(called,0);
});
