"use strict";
const assert=require("node:assert/strict");
const {createEntityTypePolicyService}=require("./service");
const {createPaRegistryAdapter}=require("../../packages/sources/live-pa-identity");
async function main(){
  const service=createEntityTypePolicyService({registry:createPaRegistryAdapter()});
  const r=await service.check({company:"OpenAI OpCo",allowedKinds:"llc,corporation"});
  console.log(JSON.stringify({decision:r.decision,reasonCode:r.reasonCode,registrationKind:r.registrationKind,registrationType:r.registrationType,matchedEntity:r.matchedEntity,sourceFailures:r.sourceFailures},null,2));
  assert.equal(r.decision,"policy_match");assert.equal(r.registrationKind,"llc");assert.deepEqual(r.sourceFailures,[]);
}
main().catch(e=>{console.error(e);process.exit(1);});
