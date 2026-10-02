"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createFormationAgeService,validateFormationAgeInput}=require("./service");

test("validates formation-age input",()=>{
  assert.deepEqual(validateFormationAgeInput({company:" Example LLC ",minAgeDays:"30"}),{company:"Example LLC",minAgeDays:30});
  assert.throws(()=>validateFormationAgeInput({company:"x",minAgeDays:30}),e=>e.code==="INVALID_INPUT");
});

test("completed registry evidence is chargeable",async()=>{
  const service=createFormationAgeService({
    registry:{async lookup(){return{available:true,strongMatch:true,entity:{businessName:"Example LLC",creationDate:"2020-01-01"}};}},
    now:()=>"2026-10-02T12:00:00Z"
  });
  const r=await service.check({company:"Example LLC",minAgeDays:365});
  assert.equal(r.decision,"established_entity");
  assert.equal(r.chargeable,true);
  assert.deepEqual(r.sourceFailures,[]);
});

test("registry transport failure is non-chargeable",async()=>{
  const service=createFormationAgeService({
    registry:{async lookup(){const e=new Error("timeout");e.code="UPSTREAM_TIMEOUT";throw e;}}
  });
  const r=await service.check({company:"Example LLC",minAgeDays:365});
  assert.equal(r.decision,"human_review");
  assert.equal(r.chargeable,false);
  assert.equal(r.sourceFailures[0].source,"pa_registry");
});
