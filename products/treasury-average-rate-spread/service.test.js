"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {validateTreasuryRateSpreadInput,createTreasuryRateSpreadService}=require("./service");

test("input defaults to 2 bps tolerance",()=>{
  assert.deepEqual(validateTreasuryRateSpreadInput({
    leftSecurity:"Treasury Bills",
    rightSecurity:"Treasury Notes"
  }),{
    leftSecurity:"Treasury Bills",
    rightSecurity:"Treasury Notes",
    toleranceBps:2
  });
});

test("identical categories are rejected before source work",async()=>{
  let calls=0;
  const service=createTreasuryRateSpreadService({treasury:{async compare(){calls++;return{};}}});
  await assert.rejects(
    ()=>service.check({leftSecurity:"Treasury Bills",rightSecurity:"treasury bills"}),
    e=>e.code==="INVALID_INPUT"
  );
  assert.equal(calls,0);
});

test("service calls one same-month comparison and classifies spread",async()=>{
  let args=null;
  const service=createTreasuryRateSpreadService({
    treasury:{async compare(input){args=input;return{
      available:true,
      recordDate:"2026-09-30",
      left:{found:true,ambiguous:false,selected:{recordDate:"2026-09-30",averageInterestRatePercent:4.123}},
      right:{found:true,ambiguous:false,selected:{recordDate:"2026-09-30",averageInterestRatePercent:3.456}}
    };}},
    now:()=>"2026-10-02T13:40:00.000Z"
  });
  const r=await service.check({
    leftSecurity:"Treasury Bills",
    rightSecurity:"Treasury Notes",
    toleranceBps:"2"
  });
  assert.deepEqual(args,{leftSecurity:"Treasury Bills",rightSecurity:"Treasury Notes"});
  assert.equal(r.decision,"left_higher");
  assert.equal(r.spreadBps,66.7);
  assert.equal(r.chargeable,true);
});

test("Treasury transport failure is non-chargeable",async()=>{
  const service=createTreasuryRateSpreadService({
    treasury:{async compare(){const e=new Error("timeout");e.code="SOURCE_HTTP_ERROR";throw e;}}
  });
  const r=await service.check({
    leftSecurity:"Treasury Bills",
    rightSecurity:"Treasury Notes"
  });
  assert.equal(r.decision,"human_review");
  assert.equal(r.chargeable,false);
});
