"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {normalizeRegistrationKind,assessEntityTypePolicy}=require("./decision");

test("normalizes common PA registration types",()=>{
  assert.equal(normalizeRegistrationKind("Foreign Limited Liability Company"),"llc");
  assert.equal(normalizeRegistrationKind("Domestic Business Corporation"),"corporation");
  assert.equal(normalizeRegistrationKind("Limited Partnership"),"limited_partnership");
  assert.equal(normalizeRegistrationKind("Limited Liability Partnership"),"llp");
  assert.equal(normalizeRegistrationKind("Professional Corporation"),"professional_corporation");
});
test("allowed normalized kind returns policy_match",()=>{
  const r=assessEntityTypePolicy({available:true,strongMatch:true,ambiguous:false,entity:{registrationType:"Foreign Limited Liability Company"}},["llc"]);
  assert.equal(r.decision,"policy_match");assert.equal(r.registrationKind,"llc");
});
test("known nonallowed kind returns policy_mismatch",()=>{
  const r=assessEntityTypePolicy({available:true,strongMatch:true,ambiguous:false,entity:{registrationType:"Domestic Business Corporation"}},["llc"]);
  assert.equal(r.decision,"policy_mismatch");assert.equal(r.reasonCode,"ENTITY_TYPE_NOT_ALLOWED");
});
test("no entity returns company_not_found",()=>{
  const r=assessEntityTypePolicy({available:true,strongMatch:false,ambiguous:false,entity:null},["llc"]);
  assert.equal(r.decision,"company_not_found");
});
test("ambiguous registry evidence requires human review",()=>{
  const r=assessEntityTypePolicy({available:true,strongMatch:false,ambiguous:true,entity:{registrationType:"LLC"}},["llc"]);
  assert.equal(r.decision,"human_review");
});
