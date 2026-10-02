"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {validateRecencyInput,createDomainLastChangedService}=require("./service");
test("input defaults to 90 days",()=>assert.deepEqual(validateRecencyInput({domain:"Example.COM"}),{domain:"example.com",maxAgeDays:90}));
test("completed RDAP evidence is chargeable",async()=>{const s=createDomainLastChangedService({rdap:{async lookup(){return{available:true,registered:true,events:{lastChanged:"2025-01-01"}};}},now:()=>"2026-10-02T12:00:00Z"});const r=await s.check({domain:"example.com",maxAgeDays:90});assert.equal(r.decision,"stable_since_window");assert.equal(r.chargeable,true);});
test("RDAP transport failure is non-chargeable",async()=>{const s=createDomainLastChangedService({rdap:{async lookup(){const e=new Error("timeout");e.code="SOURCE_HTTP_ERROR";throw e;}}});const r=await s.check({domain:"example.com"});assert.equal(r.decision,"human_review");assert.equal(r.chargeable,false);});
