"use strict";
function assessBusinessDomain(evidence,checkedAt=new Date().toISOString()){
  const registry=evidence?.registry||{};
  const rdap=evidence?.rdap||{};
  const checks={};
  const reasonCodes=[];

  if(registry.available!==true){
    checks.registry={status:"review",reason:"PA_REGISTRY_UNAVAILABLE"};
    reasonCodes.push("PA_REGISTRY_UNAVAILABLE");
  }else if(registry.strongMatch!==true){
    checks.registry={status:"review",reason:"PA_REGISTRY_MATCH_UNCERTAIN"};
    reasonCodes.push("PA_REGISTRY_MATCH_UNCERTAIN");
  }else{
    checks.registry={status:"pass",reason:"PA_REGISTRY_STRONG_MATCH"};
  }

  if(rdap.available!==true){
    checks.rdap={status:"review",reason:"RDAP_EVIDENCE_UNAVAILABLE"};
    reasonCodes.push("RDAP_EVIDENCE_UNAVAILABLE");
  }else if(rdap.registered!==true){
    checks.rdap={status:"review",reason:"DOMAIN_NOT_CONFIRMED_REGISTERED"};
    reasonCodes.push("DOMAIN_NOT_CONFIRMED_REGISTERED");
  }else if(rdap.nameAligned!==true){
    checks.rdap={status:"review",reason:"DOMAIN_BUSINESS_NAME_MISMATCH"};
    reasonCodes.push("DOMAIN_BUSINESS_NAME_MISMATCH");
  }else{
    checks.rdap={status:"pass",reason:"DOMAIN_REGISTERED_AND_NAME_ALIGNED"};
  }

  return {
    decision:reasonCodes.length===0?"match":"human_review",
    reasonCodes,
    checks,
    matchedEntity:registry.entity??null,
    policy:{registryStrongMatchRequired:true,rdapRegisteredRequired:true,domainNameAlignmentRequired:true,automaticReject:false},
    checkedAt
  };
}
module.exports={assessBusinessDomain};
