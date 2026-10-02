"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {assessDomainExpiration}=require("./decision");
const BASE={available:true,registered:true,events:{expiration:"2026-11-01T00:00:00Z"}};
test("expiration inside horizon returns expiring_soon",()=>{const r=assessDomainExpiration(BASE,{horizonDays:60,now:"2026-10-02T12:00:00Z"});assert.equal(r.decision,"expiring_soon");assert.equal(r.daysUntilExpiration,30);});
test("expiration beyond horizon returns not_expiring_soon",()=>{const r=assessDomainExpiration({...BASE,events:{expiration:"2027-10-02"}},{horizonDays:60,now:"2026-10-02T12:00:00Z"});assert.equal(r.decision,"not_expiring_soon");});
test("unregistered domain is explicit",()=>assert.equal(assessDomainExpiration({available:true,registered:false,events:{}},{horizonDays:60,now:"2026-10-02T12:00:00Z"}).decision,"unregistered"));
test("missing expiration date requires review",()=>{const r=assessDomainExpiration({available:true,registered:true,events:{}},{horizonDays:60,now:"2026-10-02T12:00:00Z"});assert.equal(r.decision,"human_review");assert.ok(r.reasonCodes.includes("EXPIRATION_DATE_UNAVAILABLE"));});
