"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createPaRegistryAdapter}=require("../../packages/sources/live-pa-identity");
const {createOfacNameAdapter}=require("../../packages/sources/ofac-name-screen");
const {registryContradictions,ofacContradictions}=require("./018-source-contract-v2");
const {assessHardenedCounterparty}=require("./018-hardened-decision");
test("actual PA adapter permits one strong match among weaker ranked results",async()=>{
  const rows=[
    {business_name:"Example LLC",filing_number:"REG-1",typeofbusinessregistration:"Limited Liability Company",address_line1:"100 Sample Rd",city:"Pottsville",state:"PA",zip:"17901"},
    {business_name:"Completely Different LLC",filing_number:"REG-2",typeofbusinessregistration:"Limited Liability Company",address_line1:"200 Sample Rd",city:"Pottsville",state:"PA",zip:"17901"}
  ];
  const adapter=createPaRegistryAdapter({
    fetchImpl:async()=>({ok:true,async json(){return rows}}),
    sleepImpl:async()=>{},retryDelayMs:0
  });
  const e=await adapter.lookup({company:"Example LLC"});
  assert.equal(e.strongMatch,true);
  assert.equal(e.ambiguous,false);
  assert.equal(e.candidateCount,2);
  assert.equal(e.strongCandidateCount,1);
  assert.equal(e.identityComplete,true);
  assert.equal(e.matchScore,0);
  assert.deepEqual(registryContradictions(e),[]);
  const p=assessHardenedCounterparty({
    registry:e,
    ofac:{available:true,query:"Example LLC",minScore:90,totalCandidatesAboveThreshold:0,candidates:[]},
    rdap:{available:true,registered:true,nameAligned:true,events:{registration:"2020-01-01"}}
  },{now:"2026-10-02T12:00:00Z"});
  assert.equal(p.decision,"proceed");
  assert.deepEqual(p.synthetic_contract_issue_codes,[]);
});
test("real OFAC adapter returns legal name, threshold, and coherent candidate-list totals",async()=>{
  let calls=0;
  const adapter=createOfacNameAdapter({
    fetchImpl:async url=>{
      calls++;
      const csv=String(url).endsWith("/SDN.CSV")?"12345,Unrelated Example,individual,TEST,,,,,,,,\n":"";
      return {ok:true,async text(){return csv}};
    }
  });
  const e=await adapter.lookup({name:"Example LLC",minScore:90,limit:3});
  assert.equal(e.query,"Example LLC");
  assert.equal(e.minScore,90);
  assert.ok(Number.isSafeInteger(e.totalCandidatesAboveThreshold));
  assert.equal(e.totalCandidatesAboveThreshold,0);
  assert.deepEqual(e.candidates,[]);
  assert.deepEqual(ofacContradictions(e,{legalName:"Example LLC",minScore:90}),[]);
  assert.equal(calls,2);
});
