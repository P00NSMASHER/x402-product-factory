"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {assessDomainLastChanged}=require("./decision");
const BASE={available:true,registered:true,events:{lastChanged:"2026-09-15T00:00:00Z"}};
test("change inside window returns recently_changed",()=>{const r=assessDomainLastChanged(BASE,{maxAgeDays:30,now:"2026-10-02T12:00:00Z"});assert.equal(r.decision,"recently_changed");assert.equal(r.ageDays,17);});
test("older change returns stable_since_window",()=>{const r=assessDomainLastChanged({...BASE,events:{lastChanged:"2025-01-01"}},{maxAgeDays:90,now:"2026-10-02T12:00:00Z"});assert.equal(r.decision,"stable_since_window");});
test("unregistered is explicit",()=>assert.equal(assessDomainLastChanged({available:true,registered:false,events:{}},{maxAgeDays:90,now:"2026-10-02T12:00:00Z"}).decision,"unregistered"));
test("missing change event requires review",()=>{const r=assessDomainLastChanged({available:true,registered:true,events:{}},{maxAgeDays:90,now:"2026-10-02T12:00:00Z"});assert.equal(r.decision,"human_review");});

test("RDAP database update alone does not count as domain last-changed",()=>{const r=assessDomainLastChanged({available:true,registered:true,events:{lastUpdateOfRdapDatabase:"2026-10-02T12:00:00Z"}},{maxAgeDays:90,now:"2026-10-02T12:00:00Z"});assert.equal(r.decision,"human_review");assert.ok(r.reasonCodes.includes("LAST_CHANGED_DATE_UNAVAILABLE"));});
