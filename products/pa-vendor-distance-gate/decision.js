"use strict";
function finiteNumber(value){return typeof value==="number"&&Number.isFinite(value);}
function assessVendorDistance(evidence,maxDistanceMiles,checkedAt=new Date().toISOString()){
 const registry=evidence?.registry||{},address=evidence?.address||{},entity=registry.entity??null;
 if(registry.available!==true)return{decision:"human_review",reasonCode:"PA_REGISTRY_UNAVAILABLE",distanceMiles:null,maxDistanceMiles,matchedEntity:entity,checkedAt};
 if(!entity)return{decision:"company_not_found",reasonCode:"PA_ENTITY_NOT_FOUND",distanceMiles:null,maxDistanceMiles,matchedEntity:null,checkedAt};
 if(registry.ambiguous===true||registry.strongMatch!==true)return{decision:"human_review",reasonCode:"PA_REGISTRY_MATCH_UNCERTAIN",distanceMiles:null,maxDistanceMiles,matchedEntity:entity,checkedAt};
 if(address.available!==true)return{decision:"human_review",reasonCode:"ADDRESS_EVIDENCE_UNAVAILABLE",distanceMiles:null,maxDistanceMiles,matchedEntity:entity,checkedAt};
 if(address.suppliedMatched!==true)return{decision:"human_review",reasonCode:"ORIGIN_ADDRESS_NOT_GEOCODED",distanceMiles:null,maxDistanceMiles,matchedEntity:entity,checkedAt};
 if(address.registryMatched!==true)return{decision:"human_review",reasonCode:"REGISTRY_ADDRESS_NOT_GEOCODED",distanceMiles:null,maxDistanceMiles,matchedEntity:entity,checkedAt};
 if(!finiteNumber(address.distanceMiles))return{decision:"human_review",reasonCode:"DISTANCE_UNAVAILABLE",distanceMiles:null,maxDistanceMiles,matchedEntity:entity,checkedAt};
 const within=address.distanceMiles<=maxDistanceMiles;
 return{
   decision:within?"within_radius":"outside_radius",
   reasonCode:within?"DISTANCE_AT_OR_BELOW_THRESHOLD":"DISTANCE_ABOVE_THRESHOLD",
   distanceMiles:address.distanceMiles,maxDistanceMiles,
   originMatchedAddress:address.suppliedMatchedAddress??null,
   registryMatchedAddress:address.registryMatchedAddress??null,
   matchedEntity:entity,checkedAt
 };
}
module.exports={assessVendorDistance};
