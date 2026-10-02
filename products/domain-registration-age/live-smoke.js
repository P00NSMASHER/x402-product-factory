"use strict";
const assert=require("node:assert/strict");
const {createRdapAdapter}=require("../../packages/sources/live-pa-identity");
const {createDomainAgeService}=require("./service");
async function main(){
 const service=createDomainAgeService({rdap:createRdapAdapter()});
 const r=await service.check({domain:"openai.com",minAgeDays:90});
 console.log(JSON.stringify({decision:r.decision,reasonCodes:r.reasonCodes,registrationDate:r.registrationDate,ageDays:r.ageDays,minAgeDays:r.minAgeDays,registered:r.evidence?.registered,events:r.evidence?.events,source:r.evidence?.provenance?.source},null,2));
 if(Array.isArray(r.sourceFailures)&&r.sourceFailures.length){console.log("TRANSIENT_SOURCE_BLOCKED",JSON.stringify(r.sourceFailures));return;}
 assert.equal(r.chargeable,true);assert.equal(r.evidence.available,true);assert.equal(r.evidence.registered,true);assert.ok(r.registrationDate);assert.ok(["established","recent_registration"].includes(r.decision));
}
main().catch(e=>{console.error(e);process.exit(1);});
