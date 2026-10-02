"use strict";
const test=require("node:test");const assert=require("node:assert/strict");
const {assessBusinessDomain}=require("./decision");
const BASE={registry:{available:true,strongMatch:true,entity:{businessName:"OpenAI OpCo LLC"}},rdap:{available:true,registered:true,nameAligned:true}};
const clone=v=>JSON.parse(JSON.stringify(v));
test("passing identity/domain evidence returns match",()=>assert.equal(assessBusinessDomain(clone(BASE)).decision,"match"));
test("unregistered domain requires review",()=>{const e=clone(BASE);e.rdap.registered=false;assert.ok(assessBusinessDomain(e).reasonCodes.includes("DOMAIN_NOT_CONFIRMED_REGISTERED"));});
test("name mismatch requires review",()=>{const e=clone(BASE);e.rdap.nameAligned=false;assert.ok(assessBusinessDomain(e).reasonCodes.includes("DOMAIN_BUSINESS_NAME_MISMATCH"));});
test("weak registry match requires review",()=>{const e=clone(BASE);e.registry.strongMatch=false;assert.equal(assessBusinessDomain(e).decision,"human_review");});
