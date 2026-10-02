"use strict";

const POLICY=Object.freeze({censusMaxDistanceMiles:0.25});

function finiteNumber(value){return typeof value==="number"&&Number.isFinite(value);}

function assessBusinessAddress(evidence,checkedAt=new Date().toISOString()){
  const registry=evidence?.registry||{};
  const address=evidence?.address||{};
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

  if(address.available!==true){
    checks.address={status:"review",reason:"ADDRESS_EVIDENCE_UNAVAILABLE"};
    reasonCodes.push("ADDRESS_EVIDENCE_UNAVAILABLE");
  }else if(address.suppliedMatched!==true||address.registryMatched!==true){
    checks.address={status:"review",reason:"ADDRESS_NOT_BOTH_GEOCODED"};
    reasonCodes.push("ADDRESS_NOT_BOTH_GEOCODED");
  }else if(address.sameStreetNumber!==true){
    checks.address={status:"review",reason:"ADDRESS_STREET_NUMBER_MISMATCH"};
    reasonCodes.push("ADDRESS_STREET_NUMBER_MISMATCH");
  }else if(address.sameZip!==true){
    checks.address={status:"review",reason:"ADDRESS_ZIP_MISMATCH"};
    reasonCodes.push("ADDRESS_ZIP_MISMATCH");
  }else if(!finiteNumber(address.distanceMiles)){
    checks.address={status:"review",reason:"ADDRESS_DISTANCE_UNAVAILABLE"};
    reasonCodes.push("ADDRESS_DISTANCE_UNAVAILABLE");
  }else if(address.distanceMiles>POLICY.censusMaxDistanceMiles){
    checks.address={status:"review",reason:"ADDRESS_DISTANCE_EXCEEDS_THRESHOLD",distanceMiles:address.distanceMiles};
    reasonCodes.push("ADDRESS_DISTANCE_EXCEEDS_THRESHOLD");
  }else{
    checks.address={status:"pass",reason:"ADDRESS_MATCH",distanceMiles:address.distanceMiles};
  }

  return {
    decision:reasonCodes.length===0?"match":"human_review",
    reasonCodes,
    checks,
    matchedEntity:registry.entity??null,
    policy:{
      registryStrongMatchRequired:true,
      censusSamePrimaryStreetNumberRequired:true,
      censusSameZipRequired:true,
      censusMaxDistanceMiles:POLICY.censusMaxDistanceMiles,
      automaticReject:false
    },
    checkedAt
  };
}

module.exports={POLICY,assessBusinessAddress};
