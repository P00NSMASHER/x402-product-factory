"use strict";

// Pre-settlement source-integrity helper for existing composite PA vendor
// products 016/017/019/020. Does not contact sources or invoke any payments.
const {
  registryContradictions,ofacContradictions,exactDateMs
}=require("./vendor-evidence-contract");

const PUBLIC_CODES=new Set([
  "SOURCE_TIMEOUT","SOURCE_HTTP_ERROR","SOURCE_CONTRACT_INVALID",
  "SOURCE_UNAVAILABLE","INVALID_INPUT"
]);
function safeSourceErrorCode(error){
  return typeof error?.code==="string"&&PUBLIC_CODES.has(error.code)
    ?error.code:"SOURCE_ADAPTER_FAILURE";
}
function markFailure(failures,source,detail){
  if(!["pa_registry","ofac_sdn","rdap"].includes(source)){
    throw new TypeError("unsupported source identity");
  }
  const safe=PUBLIC_CODES.has(detail)||detail==="SOURCE_ADAPTER_FAILURE"||
    detail==="LEGAL_NAME_MISSING"?detail:"SOURCE_CONTRACT_INVALID";
  if(!failures.some(item=>item.source===source)){
    failures.push({source,detail:safe});
  }
}
function registryProblem(registry){
  if(registry?.available!==true)return "SOURCE_UNAVAILABLE";
  if(registry.strongMatch===true){
    if(registry.ambiguous===true||!registry.entity||
       registryContradictions(registry).length){
      return "SOURCE_CONTRACT_INVALID";
    }
    if(typeof registry.entity.businessName!=="string"||
       !registry.entity.businessName.trim())return "LEGAL_NAME_MISSING";
  }
  return null;
}
function ofacProblem(ofac,{legalName,minScore}){
  if(ofac?.available!==true)return "SOURCE_UNAVAILABLE";
  return ofacContradictions(ofac,{legalName,minScore}).length
    ?"SOURCE_CONTRACT_INVALID":null;
}
function rdapProblem(rdap,{profile,now,requestedDomain}){
  if(rdap?.available!==true)return "SOURCE_UNAVAILABLE";
  if(typeof rdap.domain!=="string"||
     rdap.domain.toLowerCase()!==requestedDomain){
    return "SOURCE_CONTRACT_INVALID";
  }
  if(rdap.registered===false)return null;
  if(rdap.registered!==true)return "SOURCE_CONTRACT_INVALID";
  const today=exactDateMs(String(now).slice(0,10));
  if(today===null)return "SOURCE_CONTRACT_INVALID";
  const events=rdap.events;
  if(!events||typeof events!=="object"||Array.isArray(events)){
    return "SOURCE_CONTRACT_INVALID";
  }
  if(profile==="registration_age"){
    // A completed name mismatch is a valid human-review outcome, but a
    // purportedly aligned domain needs usable authoritative registration.
    if(rdap.nameAligned!==true)return null;
    const date=exactDateMs(events.registration??events.registered??null);
    return date===null||date>today?"SOURCE_CONTRACT_INVALID":null;
  }
  if(profile==="continuity"){
    const expiration=exactDateMs(events.expiration??events.expiry??null);
    const changed=exactDateMs(events.lastChanged??null);
    // Expired, but syntactically valid, is a COMPLETED review outcome.
    // LastChanged cannot be in the future or provenance is suspect.
    return expiration===null||changed===null||changed>today
      ?"SOURCE_CONTRACT_INVALID":null;
  }
  throw new TypeError("unsupported RDAP quality profile");
}
function completedOrFailedDecision(result,sourceFailures){
  if(!sourceFailures.length)return result;
  return {
    ...result,
    decision:"human_review",
    reasonCodes:[...new Set([
      ...(result.reasonCodes||[]),"REQUIRED_SOURCE_EVIDENCE_UNAVAILABLE"
    ])]
  };
}
module.exports={
  safeSourceErrorCode,markFailure,registryProblem,
  ofacProblem,rdapProblem,completedOrFailedDecision
};
