"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {parseAllowedCounties,createRegisteredCountyPolicyService}=require("./service");

test("allowed county parser normalizes, dedupes, and rejects typos",()=>{
 assert.deepEqual(parseAllowedCounties("schuylkill, Dauphin County, SCHUYLKILL"),["Schuylkill","Dauphin"]);
 assert.throws(()=>parseAllowedCounties("Schuylkill,Atlantis"),e=>e.code==="INVALID_INPUT");
});

function adapter(county="Dauphin"){return{async lookup({company}){return{available:true,strongMatch:true,ambiguous:false,entity:{businessName:company,filingNumber:"1",registrationType:"LLC",address1:"1 Market St",city:"Harrisburg",state:"PA",zip:"17101",county}};}};}

test("service produces chargeable policy_match from completed registry evidence",async()=>{
 const s=createRegisteredCountyPolicyService({registry:adapter(),now:()=>"2026-10-02T12:00:00.000Z"});
 const r=await s.check({company:"Example LLC",allowedCounties:"Dauphin,Schuylkill"});
 assert.equal(r.decision,"policy_match");assert.equal(r.chargeable,true);assert.deepEqual(r.sourceFailures,[]);
});

test("completed policy mismatch remains chargeable",async()=>{
 const s=createRegisteredCountyPolicyService({registry:adapter()});
 const r=await s.check({company:"Example LLC",allowedCounties:"Schuylkill"});
 assert.equal(r.decision,"policy_mismatch");assert.equal(r.chargeable,true);
});

test("registry outage is non-chargeable",async()=>{
 const s=createRegisteredCountyPolicyService({registry:{async lookup(){const e=new Error("timeout");e.code="UPSTREAM_TIMEOUT";throw e;}}});
 const r=await s.check({company:"Example LLC",allowedCounties:"Dauphin"});
 assert.equal(r.decision,"human_review");assert.equal(r.chargeable,false);assert.equal(r.sourceFailures[0].source,"pa_registry");
});
