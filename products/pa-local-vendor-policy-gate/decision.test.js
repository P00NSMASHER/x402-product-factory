"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {assessLocalVendorPolicy}=require("./decision");
const E={available:true,strongMatch:true,ambiguous:false,entity:{businessName:"Example LLC",registrationType:"Domestic Limited Liability Company",county:"Schuylkill",creationDate:"2020-01-01"}};
const opts={allowedKinds:["llc"],allowedCounties:["Schuylkill"],minAgeDays:365,now:"2026-10-02T00:00:00.000Z"};

test("all policy rules passing returns proceed",()=>{const r=assessLocalVendorPolicy(E,opts);assert.equal(r.decision,"proceed");assert.deepEqual(r.reasonCodes,[]);assert.equal(r.checks.entityType.status,"pass");assert.equal(r.checks.county.status,"pass");assert.equal(r.checks.formationAge.status,"pass");});
test("type mismatch yields human_review without automatic reject",()=>{const r=assessLocalVendorPolicy(E,{...opts,allowedKinds:["corporation"]});assert.equal(r.decision,"human_review");assert.ok(r.reasonCodes.includes("ENTITY_TYPE_NOT_ALLOWED"));assert.equal(r.policy.automaticReject,false);});
test("county mismatch yields human_review",()=>{const r=assessLocalVendorPolicy(E,{...opts,allowedCounties:["Dauphin"]});assert.ok(r.reasonCodes.includes("REGISTERED_COUNTY_NOT_ALLOWED"));});
test("age below threshold yields human_review",()=>{const r=assessLocalVendorPolicy(E,{...opts,minAgeDays:36500});assert.ok(r.reasonCodes.includes("FORMATION_AGE_BELOW_THRESHOLD"));});
test("multiple failed policies return all deterministic reasons",()=>{const r=assessLocalVendorPolicy(E,{...opts,allowedKinds:["corporation"],allowedCounties:["Dauphin"],minAgeDays:36500});assert.deepEqual(r.reasonCodes,["ENTITY_TYPE_NOT_ALLOWED","REGISTERED_COUNTY_NOT_ALLOWED","FORMATION_AGE_BELOW_THRESHOLD"]);});
test("missing entity returns company_not_found",()=>{const r=assessLocalVendorPolicy({...E,entity:null},opts);assert.equal(r.decision,"company_not_found");});
