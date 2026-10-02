"use strict";
const test=require("node:test");const assert=require("node:assert/strict");
const {createBusinessDomainService}=require("./service");
function good(){return{
 registry:{async lookup({company}){return{available:true,strongMatch:true,entity:{businessName:company,filingNumber:"1",registrationType:"LLC",address1:"100 Market St",city:"Pottsville",state:"PA",zip:"17901"}};}},
 rdap:{async lookup({domain}){return{available:true,registered:true,domain};}}
};}
test("service composes matching company and domain",async()=>{
 const s=createBusinessDomainService({...good(),now:()=>"2026-10-02T09:30:00.000Z"});
 const r=await s.check({company:"OpenAI OpCo",domain:"openai.com"});
 assert.equal(r.decision,"match");assert.equal(r.chargeable,true);assert.equal(r.evidence.rdap.nameAligned,true);
});
test("registered unrelated domain is chargeable human review",async()=>{
 const s=createBusinessDomainService(good());
 const r=await s.check({company:"OpenAI OpCo",domain:"example.com"});
 assert.equal(r.decision,"human_review");assert.equal(r.chargeable,true);assert.ok(r.reasonCodes.includes("DOMAIN_BUSINESS_NAME_MISMATCH"));
});
test("RDAP outage is non-chargeable",async()=>{
 const a=good();a.rdap={async lookup(){const e=new Error("timeout");e.code="UPSTREAM_TIMEOUT";throw e;}};
 const r=await createBusinessDomainService(a).check({company:"OpenAI OpCo",domain:"openai.com"});
 assert.equal(r.chargeable,false);assert.equal(r.decision,"human_review");
});
