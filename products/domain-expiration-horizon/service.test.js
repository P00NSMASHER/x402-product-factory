"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {validateExpirationInput,createDomainExpirationService}=require("./service");
test("input defaults to 60-day horizon",()=>assert.deepEqual(validateExpirationInput({domain:"Example.COM"}),{domain:"example.com",horizonDays:60}));
test("completed RDAP result is chargeable",async()=>{const s=createDomainExpirationService({rdap:{async lookup(){return{available:true,registered:true,events:{expiration:"2027-01-19"}};}},now:()=>"2026-10-02T12:00:00Z"});const r=await s.check({domain:"example.com",horizonDays:60});assert.equal(r.decision,"not_expiring_soon");assert.equal(r.chargeable,true);});
test("RDAP outage is non-chargeable",async()=>{const s=createDomainExpirationService({rdap:{async lookup(){const e=new Error("timeout");e.code="SOURCE_HTTP_ERROR";throw e;}}});const r=await s.check({domain:"example.com"});assert.equal(r.decision,"human_review");assert.equal(r.chargeable,false);});
