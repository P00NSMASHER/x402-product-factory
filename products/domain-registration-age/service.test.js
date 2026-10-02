"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {validateDomainAgeInput,createDomainAgeService}=require("./service");
test("input normalizes domain and defaults threshold",()=>{const x=validateDomainAgeInput({domain:"EXAMPLE.COM."});assert.equal(x.domain,"example.com");assert.equal(x.minAgeDays,90);});
test("invalid threshold is rejected",()=>assert.throws(()=>validateDomainAgeInput({domain:"example.com",minAgeDays:0}),/between 1 and 3650/));
test("service returns established for completed RDAP",async()=>{
 const s=createDomainAgeService({rdap:{async lookup(){return{available:true,registered:true,events:{registration:"2020-01-01T00:00:00Z"}};}},now:()=>"2026-10-02T12:00:00Z"});
 const r=await s.check({domain:"example.com",minAgeDays:90});assert.equal(r.decision,"established");assert.equal(r.chargeable,true);
});
test("registered domain without date is chargeable human_review",async()=>{
 const s=createDomainAgeService({rdap:{async lookup(){return{available:true,registered:true,events:{}};}}});
 const r=await s.check({domain:"example.com"});assert.equal(r.decision,"human_review");assert.equal(r.chargeable,true);
});
test("RDAP transport failure is non-chargeable",async()=>{
 const s=createDomainAgeService({rdap:{async lookup(){const e=new Error("down");e.code="SOURCE_HTTP_ERROR";throw e;}}});
 const r=await s.check({domain:"example.com"});assert.equal(r.chargeable,false);assert.equal(r.decision,"human_review");
});
