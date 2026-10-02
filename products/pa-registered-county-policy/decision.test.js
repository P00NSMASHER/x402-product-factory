"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {PA_COUNTIES,normalizeCountyName,assessRegisteredCountyPolicy}=require("./decision");

const E={available:true,strongMatch:true,ambiguous:false,entity:{businessName:"Example LLC",county:"Dauphin"}};
test("county catalog contains 67 counties",()=>assert.equal(PA_COUNTIES.length,67));
test("county normalization is case-insensitive and accepts County suffix",()=>{assert.equal(normalizeCountyName("SCHUYLKILL"),"Schuylkill");assert.equal(normalizeCountyName("Dauphin County"),"Dauphin");});
test("allowed registered county returns policy_match",()=>{const r=assessRegisteredCountyPolicy(E,["Dauphin","Schuylkill"]);assert.equal(r.decision,"policy_match");assert.equal(r.registeredCounty,"Dauphin");});
test("completed county mismatch returns policy_mismatch",()=>{const r=assessRegisteredCountyPolicy(E,["Schuylkill"]);assert.equal(r.decision,"policy_mismatch");assert.equal(r.reasonCode,"REGISTERED_COUNTY_NOT_ALLOWED");});
test("missing county requires human review",()=>{const r=assessRegisteredCountyPolicy({...E,entity:{...E.entity,county:null}},["Dauphin"]);assert.equal(r.decision,"human_review");assert.equal(r.reasonCode,"REGISTERED_COUNTY_UNAVAILABLE");});
test("no entity returns company_not_found",()=>{const r=assessRegisteredCountyPolicy({...E,entity:null},["Dauphin"]);assert.equal(r.decision,"company_not_found");});
