"use strict";

// Source-contract assertions for Product 018, shared by the staging service
// and offline quality tests. They describe the *actual* PA/OFAC adapter
// result shapes and MUST NOT be used as legal or sanctions clearance.
const REASONS=Object.freeze({
  REGISTRY_CARDINALITY:"PA_REGISTRY_CARDINALITY_INCONSISTENT",
  REGISTRY_STRENGTH:"PA_REGISTRY_STRONG_MATCH_INCONSISTENT",
  OFAC_COUNTS:"OFAC_CANDIDATE_COUNTS_INCONSISTENT",
  OFAC_INCOMPLETE:"OFAC_CANDIDATE_EVIDENCE_INCOMPLETE",
  OFAC_CONTEXT:"OFAC_SCREEN_CONTEXT_INCONSISTENT",
  RDAP_DATE:"DOMAIN_REGISTRATION_DATE_INVALID"
});
function exactDateMs(value){
  if(typeof value!=="string"||
      !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)){
    return null;
  }
  const head=value.slice(0,10);
  const stamp=Date.parse(head+"T00:00:00Z");
  if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==head)return null;
  if(value.length>10&&!Number.isFinite(Date.parse(value)))return null;
  return stamp;
}
function registryContradictions(registry){
  if(registry?.available!==true||registry.strongMatch!==true||
      registry.ambiguous===true||!registry.entity)return [];
  const {candidateCount, strongCandidateCount}=registry;
  const issues=[];
  // PA adapter ranks at most 3 returned entities. Many weak results plus
  // exactly ONE strong match is a VALID unique strong registry resolution.
  if(!Number.isSafeInteger(candidateCount)||candidateCount<1||candidateCount>3){
    issues.push({code:REASONS.REGISTRY_CARDINALITY,check:"registry"});
  }
  if(!Number.isSafeInteger(strongCandidateCount)||strongCandidateCount!==1||
      strongCandidateCount>candidateCount||registry.identityComplete!==true||
      typeof registry.matchScore!=="number"||!Number.isFinite(registry.matchScore)||
      registry.matchScore>1){
    issues.push({code:REASONS.REGISTRY_STRENGTH,check:"registry"});
  }
  return issues;
}
function ofacContradictions(ofac,{legalName,minScore}){
  if(ofac?.available!==true)return [];
  const issues=[],count=ofac.totalCandidatesAboveThreshold;
  const list=ofac.candidates;
  if(!Number.isSafeInteger(count)||!Array.isArray(list)){
    issues.push({code:REASONS.OFAC_INCOMPLETE,check:"ofac"});
  }else if(count<0||list.length>3||list.length>count||
     (count>0&&list.length===0)){
    // The OFAC adapter returns slice(0,3) and the full >=minScore count.
    issues.push({code:REASONS.OFAC_COUNTS,check:"ofac"});
  }
  const expectedName=typeof legalName==="string"?legalName.trim().replace(/\s+/g," "):"";
  if(!expectedName||ofac.query!==expectedName||ofac.minScore!==minScore){
    // A negative screen is meaningful ONLY for the same resolved name and
    // exactly the requested threshold.
    issues.push({code:REASONS.OFAC_CONTEXT,check:"ofac"});
  }
  return issues;
}
function rdapContradictions(rdap,{now}){
  if(rdap?.available!==true||rdap.registered!==true||
     rdap.nameAligned!==true)return [];
  const raw=rdap.events?.registration??rdap.events?.registered??null;
  if(raw===null)return [];
  const date=exactDateMs(raw),today=exactDateMs(String(now).slice(0,10));
  return date===null||today===null||date>today?
    [{code:REASONS.RDAP_DATE,check:"domain"}]:[];
}
function contradictoryEvidence(evidence,{now,minScore=90}){
  const e=evidence||{},legalName=e.registry?.entity?.businessName;
  return [
    ...registryContradictions(e.registry),
    ...ofacContradictions(e.ofac,{legalName,minScore}),
    ...rdapContradictions(e.rdap,{now})
  ];
}
module.exports={REASONS,exactDateMs,registryContradictions,ofacContradictions,rdapContradictions,contradictoryEvidence};
