"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createSecCompanyIdentityService,validateSecCompanyIdentityInput}=require("./service");

test("input requires exactly one ticker or cik",()=>{
  assert.throws(()=>validateSecCompanyIdentityInput({company:"Apple",ticker:"AAPL",cik:"320193"}),/exactly one/);
  assert.throws(()=>validateSecCompanyIdentityInput({company:"Apple"}),/exactly one/);
});

test("service matches Apple ticker to SEC company identity",async()=>{
  const service=createSecCompanyIdentityService({
    sec:{async lookup(input){
      assert.equal(input.ticker,"AAPL");
      assert.equal(input.cik,"");
      return {
        available:true,found:true,
        company:{name:"Apple Inc.",cik:"0000320193",tickers:["AAPL"],exchanges:["Nasdaq"]},
        filings:[],
        provenance:{source:"U.S. Securities and Exchange Commission EDGAR"}
      };
    }},
    now:()=>"2026-10-02T09:30:00.000Z"
  });
  const r=await service.check({company:"Apple",ticker:"aapl"});
  assert.equal(r.decision,"match");
  assert.equal(r.chargeable,true);
  assert.deepEqual(r.sourceFailures,[]);
});

test("unknown ticker is chargeable company_not_found",async()=>{
  const service=createSecCompanyIdentityService({
    sec:{async lookup(){return{available:true,found:false,company:null,filings:[]};}}
  });
  const r=await service.check({company:"Example Corp",ticker:"ZZZZ"});
  assert.equal(r.decision,"company_not_found");
  assert.equal(r.chargeable,true);
});

test("SEC source failure is non-chargeable human review",async()=>{
  const service=createSecCompanyIdentityService({
    sec:{async lookup(){const e=new Error("blocked");e.code="SEC_USER_AGENT_REQUIRED";throw e;}}
  });
  const r=await service.check({company:"Apple",ticker:"AAPL"});
  assert.equal(r.decision,"human_review");
  assert.equal(r.chargeable,false);
  assert.equal(r.sourceFailures[0].detail,"SEC_USER_AGENT_REQUIRED");
});
