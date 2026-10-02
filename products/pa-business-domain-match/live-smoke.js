"use strict";
const assert=require("node:assert/strict");
const {createBusinessDomainService}=require("./service");
const {createPaRegistryAdapter,createRdapAdapter}=require("../../packages/sources/live-pa-identity");
async function main(){
 const service=createBusinessDomainService({registry:createPaRegistryAdapter(),rdap:createRdapAdapter()});
 const r=await service.check({company:"OpenAI OpCo",domain:"openai.com"});
 console.log(JSON.stringify({decision:r.decision,reasonCodes:r.reasonCodes,matchedEntity:r.matchedEntity,rdap:{available:r.evidence.rdap.available,registered:r.evidence.rdap.registered,nameAligned:r.evidence.rdap.nameAligned,domain:r.evidence.rdap.domain}},null,2));
 if (Array.isArray(r.sourceFailures) && r.sourceFailures.length > 0) {
  console.log("TRANSIENT_SOURCE_BLOCKED", JSON.stringify(r.sourceFailures));
  return;
 }
 assert.equal(r.decision,"match");assert.deepEqual(r.reasonCodes,[]);
}
main().catch(e=>{console.error(e);process.exit(1);});
