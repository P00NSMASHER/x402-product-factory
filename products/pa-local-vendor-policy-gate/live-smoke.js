"use strict";
const assert=require("node:assert/strict");
const {createLocalVendorPolicyService}=require("./service");
const {createPaRegistryAdapter}=require("../../packages/sources/live-pa-identity");
async function main(){
 const s=createLocalVendorPolicyService({registry:createPaRegistryAdapter()});
 const r=await s.check({company:"OpenAI OpCo",allowedKinds:"llc,corporation",allowedCounties:"Dauphin,Schuylkill",minAgeDays:"30"});
 console.log(JSON.stringify({decision:r.decision,reasonCodes:r.reasonCodes,checks:r.checks,matchedEntity:r.matchedEntity,sourceFailures:r.sourceFailures},null,2));
 assert.equal(r.decision,"proceed");assert.deepEqual(r.reasonCodes,[]);assert.deepEqual(r.sourceFailures,[]);
}
main().catch(e=>{console.error(e);process.exit(1);});
