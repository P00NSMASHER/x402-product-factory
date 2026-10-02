"use strict";
const assert=require("node:assert/strict");
const {createRdapAdapter}=require("../../packages/sources/live-pa-identity");
const {createDomainLastChangedService}=require("./service");
async function main(){
 const service=createDomainLastChangedService({rdap:createRdapAdapter()});
 const r=await service.check({domain:"openai.com",maxAgeDays:730});
 console.log(JSON.stringify({decision:r.decision,reasonCodes:r.reasonCodes,lastChangedDate:r.lastChangedDate,ageDays:r.ageDays,maxAgeDays:r.maxAgeDays,events:r.evidence?.events,source:r.evidence?.provenance?.source,sourceFailures:r.sourceFailures},null,2));
 if(r.sourceFailures?.length){console.log("TRANSIENT_SOURCE_BLOCKED",JSON.stringify(r.sourceFailures));return;}
 assert.equal(r.chargeable,true);assert.equal(r.evidence.available,true);assert.equal(r.evidence.registered,true);assert.ok(["recently_changed","stable_since_window","human_review"].includes(r.decision));
}
main().catch(e=>{console.error(e);process.exit(1);});
