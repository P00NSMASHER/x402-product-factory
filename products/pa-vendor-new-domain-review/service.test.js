"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createPaVendorNewDomainService,validatePaVendorNewDomainInput}=require("./service");

test("input defaults domain age threshold to 90 days",()=>{
  assert.deepEqual(
    validatePaVendorNewDomainInput({company:"OpenAI OpCo",domain:"OPENAI.COM"}),
    {company:"OpenAI OpCo",domain:"openai.com",minDomainAgeDays:90}
  );
});

test("service aligns domain against resolved legal name",async()=>{
  let rdapInput=null;
  const service=createPaVendorNewDomainService({
    registry:{async lookup(){return{
      available:true,strongMatch:true,ambiguous:false,candidateCount:1,
      entity:{businessName:"Openai Opco, Llc",filingNumber:"0014879623"}
    };}},
    rdap:{async lookup(input){rdapInput=input;return{
      available:true,registered:true,domain:"openai.com",
      events:{registration:"2007-01-19T19:28:24Z"}
    };}},
    now:()=>"2026-10-02T12:00:00Z"
  });
  const r=await service.check({company:"OpenAI OpCo",domain:"openai.com",minDomainAgeDays:"90"});
  assert.deepEqual(rdapInput,{domain:"openai.com"});
  assert.equal(r.resolvedLegalName,"Openai Opco, Llc");
  assert.equal(r.evidence.rdap.alignedAgainstLegalName,"Openai Opco, Llc");
  assert.equal(r.evidence.rdap.nameAligned,true);
  assert.equal(r.decision,"established_domain_match");
  assert.equal(r.chargeable,true);
});

test("company_not_found skips RDAP and remains completed chargeable evidence",async()=>{
  let rdapCalls=0;
  const service=createPaVendorNewDomainService({
    registry:{async lookup(){return{
      available:true,strongMatch:false,ambiguous:false,candidateCount:0,entity:null
    };}},
    rdap:{async lookup(){rdapCalls++;return{};}}
  });
  const r=await service.check({company:"Missing Company",domain:"example.com"});
  assert.equal(r.decision,"company_not_found");
  assert.equal(r.chargeable,true);
  assert.equal(rdapCalls,0);
});

test("registry outage is non-chargeable and skips RDAP",async()=>{
  let rdapCalls=0;
  const service=createPaVendorNewDomainService({
    registry:{async lookup(){const e=new Error("timeout");e.code="SOURCE_HTTP_ERROR";throw e;}},
    rdap:{async lookup(){rdapCalls++;return{};}}
  });
  const r=await service.check({company:"OpenAI OpCo",domain:"openai.com"});
  assert.equal(r.decision,"human_review");
  assert.equal(r.chargeable,false);
  assert.equal(rdapCalls,0);
});

test("RDAP outage after legal-entity resolution is non-chargeable",async()=>{
  const service=createPaVendorNewDomainService({
    registry:{async lookup(){return{
      available:true,strongMatch:true,ambiguous:false,candidateCount:1,
      entity:{businessName:"Openai Opco, Llc"}
    };}},
    rdap:{async lookup(){const e=new Error("timeout");e.code="SOURCE_HTTP_ERROR";throw e;}}
  });
  const r=await service.check({company:"OpenAI OpCo",domain:"openai.com"});
  assert.equal(r.decision,"human_review");
  assert.equal(r.chargeable,false);
  assert.equal(r.sourceFailures[0].source,"rdap");
});
