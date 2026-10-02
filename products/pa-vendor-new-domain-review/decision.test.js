"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {assessPaVendorNewDomain}=require("./decision");

const entity={businessName:"Openai Opco, Llc",filingNumber:"1"};
const reg=(overrides={})=>({
  available:true,strongMatch:true,ambiguous:false,candidateCount:1,entity,...overrides
});
const rdap=(overrides={})=>({
  available:true,registered:true,domain:"openai.com",nameAligned:true,
  events:{registration:"2007-01-19T19:28:24Z"},...overrides
});

test("aligned established domain returns established_domain_match",()=>{
  const r=assessPaVendorNewDomain(
    {registry:reg(),rdap:rdap()},
    {minDomainAgeDays:90,now:"2026-10-02T12:00:00Z"}
  );
  assert.equal(r.decision,"established_domain_match");
  assert.equal(r.registrationDate,"2007-01-19");
  assert.ok(r.domainAgeDays>90);
});

test("aligned young domain returns recent_domain_review",()=>{
  const r=assessPaVendorNewDomain(
    {registry:reg(),rdap:rdap({events:{registration:"2026-09-20T00:00:00Z"}})},
    {minDomainAgeDays:90,now:"2026-10-02T12:00:00Z"}
  );
  assert.equal(r.decision,"recent_domain_review");
  assert.equal(r.domainAgeDays,12);
});

test("registered unrelated domain is explicit domain_mismatch",()=>{
  const r=assessPaVendorNewDomain(
    {registry:reg(),rdap:rdap({nameAligned:false})},
    {minDomainAgeDays:90,now:"2026-10-02T12:00:00Z"}
  );
  assert.equal(r.decision,"domain_mismatch");
});

test("unregistered domain is explicit",()=>{
  const r=assessPaVendorNewDomain(
    {registry:reg(),rdap:rdap({registered:false,nameAligned:false,events:{}})},
    {minDomainAgeDays:90,now:"2026-10-02T12:00:00Z"}
  );
  assert.equal(r.decision,"unregistered_domain");
});

test("no PA entity skips domain conclusion",()=>{
  const r=assessPaVendorNewDomain(
    {registry:reg({strongMatch:false,candidateCount:0,entity:null}),rdap:null},
    {minDomainAgeDays:90,now:"2026-10-02T12:00:00Z"}
  );
  assert.equal(r.decision,"company_not_found");
});

test("ambiguous registry identity requires human review",()=>{
  const r=assessPaVendorNewDomain(
    {registry:reg({strongMatch:false,ambiguous:true,candidateCount:2}),rdap:null},
    {minDomainAgeDays:90,now:"2026-10-02T12:00:00Z"}
  );
  assert.equal(r.decision,"human_review");
});
