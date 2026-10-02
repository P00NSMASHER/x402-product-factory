"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {canonicalCompanyName,assessSecCompanyIdentity}=require("./decision");

test("canonical name removes punctuation and common corporate suffixes",()=>{
  assert.equal(canonicalCompanyName("Apple Inc."),"APPLE");
  assert.equal(canonicalCompanyName("Meta Platforms, Inc."),"META PLATFORMS");
  assert.equal(canonicalCompanyName("AT&T Company"),"AT AND T");
});

test("matching SEC identity returns match",()=>{
  const r=assessSecCompanyIdentity({
    available:true,found:true,company:{name:"Apple Inc.",cik:"0000320193",tickers:["AAPL"]}
  },{expectedCompany:"Apple",checkedAt:"2026-10-02T09:30:00.000Z"});
  assert.equal(r.decision,"match");
  assert.deepEqual(r.reasonCodes,[]);
});

test("resolved but different company name requires human review",()=>{
  const r=assessSecCompanyIdentity({
    available:true,found:true,company:{name:"Apple Inc.",cik:"0000320193"}
  },{expectedCompany:"Microsoft Corporation"});
  assert.equal(r.decision,"human_review");
  assert.ok(r.reasonCodes.includes("SEC_COMPANY_NAME_MISMATCH"));
});

test("completed unresolved ticker returns company_not_found",()=>{
  const r=assessSecCompanyIdentity({available:true,found:false,company:null},{
    expectedCompany:"Example Corp"
  });
  assert.equal(r.decision,"company_not_found");
});

test("source unavailable fails closed to human review",()=>{
  const r=assessSecCompanyIdentity({available:false},{expectedCompany:"Apple"});
  assert.equal(r.decision,"human_review");
  assert.ok(r.reasonCodes.includes("SEC_EVIDENCE_UNAVAILABLE"));
});
