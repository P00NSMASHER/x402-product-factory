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

test("SEC_USER_AGENT rejects HTTP header values that fetch cannot serialize",()=>{
  const invalid=[
    "x402-product-1.0 ops@example.com\rX-Injected: yes",
    "x402-product-1.0 ops@example.com\nX-Injected: yes",
    "x402-product-1.0 ops@example.com\u0000",
    "x402-product-1.0 ops@example.com🙂"
  ];
  for(const value of invalid){
    assert.throws(()=>new Headers({"user-agent":value}),{name:"TypeError"});
    assert.deepEqual(
      validateEnv("SEC_USER_AGENT",value),
      {ok:false,reason:"invalid_http_header_value"}
    );
  }
});

test("header-incompatible SEC identity blocks both staged products",()=>{
  const result=checkDeploymentPrereqs({
    SEC_USER_AGENT:"x402-product-1.0 ops@example.com\nX-Injected: yes"
  });
  assert.equal(result.ready,false);
  const rejected=result.missing.filter(x=>x.name==="SEC_USER_AGENT");
  assert.deepEqual(rejected.map(x=>x.productId).sort(),[
    "sec-company-identity-match","sec-filing-freshness"
  ]);
  assert.ok(rejected.every(x=>x.reason==="invalid_http_header_value"));
});

test("fetch-compatible declared SEC identities remain permitted",()=>{
  const value="x402-product-1.0 ops@example.com\tcomment";
  assert.equal(new Headers({"user-agent":value}).get("user-agent"),value);
  assert.deepEqual(validateEnv("SEC_USER_AGENT",value),{ok:true,reason:null});
});
