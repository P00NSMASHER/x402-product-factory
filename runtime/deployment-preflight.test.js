"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {checkDeploymentPrereqs,validateEnv}=require("./deployment-preflight");

test("blank required environment is invalid",()=>{
  assert.deepEqual(validateEnv("SEC_USER_AGENT",""),{ok:false,reason:"missing"});
});

test("SEC_USER_AGENT must include a contact email",()=>{
  assert.deepEqual(
    validateEnv("SEC_USER_AGENT","x402-product-1.0"),
    {ok:false,reason:"must_include_contact_email"}
  );
  assert.deepEqual(
    validateEnv("SEC_USER_AGENT","x402-product-1.0 ops@example.com"),
    {ok:true,reason:null}
  );
});

test("current staging bundle reports both SEC products blocked without SEC_USER_AGENT",()=>{
  const result=checkDeploymentPrereqs({});
  assert.equal(result.ready,false);
  const ids=result.missing.filter(x=>x.name==="SEC_USER_AGENT").map(x=>x.productId).sort();
  assert.deepEqual(ids,["sec-company-identity-match","sec-filing-freshness"]);
  assert.ok(result.missing.every(x=>x.reason==="missing"));
});

test("declared SEC contact makes current staging prerequisites ready",()=>{
  const result=checkDeploymentPrereqs({
    SEC_USER_AGENT:"x402-product-1.0 ops@example.com"
  });
  assert.equal(result.ready,true);
  assert.deepEqual(result.missing,[]);
});
