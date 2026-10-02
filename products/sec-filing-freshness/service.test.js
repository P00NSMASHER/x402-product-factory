"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {validateFilingFreshnessInput,createSecFilingFreshnessService}=require("./service");

test("input requires exactly one of ticker or cik",()=>{
 assert.throws(()=>validateFilingFreshnessInput({}),/exactly one/);
 assert.throws(()=>validateFilingFreshnessInput({ticker:"AAPL",cik:"320193"}),/exactly one/);
 assert.equal(validateFilingFreshnessInput({ticker:"aapl"}).ticker,"AAPL");
 assert.equal(validateFilingFreshnessInput({cik:"320193"}).maxAgeDays,30);
 assert.throws(()=>validateFilingFreshnessInput({cik:"CIK 320193"}),/invalid cik/);
 assert.throws(()=>validateFilingFreshnessInput({cik:"320193abc"}),/invalid cik/);
});

test("service returns recent filing with chargeable completed evidence",async()=>{
 const service=createSecFilingFreshnessService({
  sec:{async lookup(){return{available:true,found:true,company:{name:"Apple Inc."},filings:[{form:"8-K",filingDate:"2026-10-01"}]};}},
  now:()=>"2026-10-02T12:00:00Z"
 });
 const r=await service.check({ticker:"AAPL",maxAgeDays:30});
 assert.equal(r.decision,"recent_filing");
 assert.equal(r.chargeable,true);
 assert.deepEqual(r.sourceFailures,[]);
});

test("unknown ticker is chargeable company_not_found",async()=>{
 const service=createSecFilingFreshnessService({
  sec:{async lookup(){return{available:true,found:false,company:null,filings:[]};}},
  now:()=>"2026-10-02T12:00:00Z"
 });
 const r=await service.check({ticker:"ZZZZ"});
 assert.equal(r.decision,"company_not_found");
 assert.equal(r.chargeable,true);
});

test("SEC outage is non-chargeable",async()=>{
 const service=createSecFilingFreshnessService({
  sec:{async lookup(){const e=new Error("sec down");e.code="SOURCE_HTTP_ERROR";throw e;}},
  now:()=>"2026-10-02T12:00:00Z"
 });
 const r=await service.check({ticker:"AAPL"});
 assert.equal(r.chargeable,false);
 assert.equal(r.sourceFailures[0].source,"sec_edgar");
});
