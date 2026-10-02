"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {validateLocalVendorPolicyInput,createLocalVendorPolicyService}=require("./service");

test("input parser normalizes all three caller policies",()=>{
 const r=validateLocalVendorPolicyInput({company:" OpenAI   OpCo ",allowedKinds:"LLC,corporation",allowedCounties:"dauphin county,Schuylkill",minAgeDays:"30"});
 assert.deepEqual(r,{company:"OpenAI OpCo",allowedKinds:["llc","corporation"],allowedCounties:["Dauphin","Schuylkill"],minAgeDays:30});
});

function adapter(){return{async lookup({company}){return{available:true,strongMatch:true,ambiguous:false,entity:{businessName:company,filingNumber:"1",registrationType:"Foreign Limited Liability Company",creationDate:"2025-09-29",address1:"600 North Second Street",city:"Harrisburg",state:"PA",zip:"17101",county:"Dauphin"}};}};}

test("one registry call can satisfy combined policy",async()=>{
 let calls=0;const base=adapter();
 const s=createLocalVendorPolicyService({registry:{async lookup(args){calls++;return base.lookup(args);}},now:()=>"2026-10-02T00:00:00.000Z"});
 const r=await s.check({company:"OpenAI OpCo",allowedKinds:"llc,corporation",allowedCounties:"Dauphin",minAgeDays:"30"});
 assert.equal(calls,1);assert.equal(r.decision,"proceed");assert.equal(r.chargeable,true);
});
test("completed caller-policy mismatch remains chargeable human_review",async()=>{
 const s=createLocalVendorPolicyService({registry:adapter(),now:()=>"2026-10-02T00:00:00.000Z"});
 const r=await s.check({company:"OpenAI OpCo",allowedKinds:"corporation",allowedCounties:"Schuylkill",minAgeDays:"1000"});
 assert.equal(r.decision,"human_review");assert.equal(r.chargeable,true);assert.equal(r.reasonCodes.length,3);
});
test("registry outage is non-chargeable",async()=>{
 const s=createLocalVendorPolicyService({registry:{async lookup(){const e=new Error("timeout");e.code="UPSTREAM_TIMEOUT";throw e;}}});
 const r=await s.check({company:"OpenAI OpCo",allowedKinds:"llc",allowedCounties:"Dauphin",minAgeDays:"30"});
 assert.equal(r.decision,"human_review");assert.equal(r.chargeable,false);
});
