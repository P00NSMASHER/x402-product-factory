"use strict";
const assert=require("node:assert/strict");
const {createRegisteredCountyPolicyService}=require("./service");
const {createPaRegistryAdapter}=require("../../packages/sources/live-pa-identity");
async function main(){
 const s=createRegisteredCountyPolicyService({registry:createPaRegistryAdapter()});
 const r=await s.check({company:"OpenAI OpCo",allowedCounties:"Dauphin,Schuylkill"});
 console.log(JSON.stringify({decision:r.decision,reasonCode:r.reasonCode,registeredCounty:r.registeredCounty,matchedEntity:r.matchedEntity,sourceFailures:r.sourceFailures},null,2));
 assert.equal(r.decision,"policy_match");assert.equal(r.registeredCounty,"Dauphin");assert.deepEqual(r.sourceFailures,[]);
}
main().catch(e=>{console.error(e);process.exit(1);});
