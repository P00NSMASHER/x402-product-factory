"use strict";

// Offline prototype for an evidence-strict Product 018 decision. Intentionally
// not referenced by runtime/create-runtime.js or any paid handler.
const {assessCounterpartyReview}=require("../../products/pa-vendor-counterparty-review/decision");

const MANUAL_REASON=Object.freeze({
  REGISTRY_CARDINALITY:"PA_REGISTRY_CARDINALITY_INCONSISTENT",
  OFAC_COUNTS:"OFAC_CANDIDATE_COUNTS_INCONSISTENT",
  OFAC_INCOMPLETE:"OFAC_CANDIDATE_EVIDENCE_INCOMPLETE",
  RDAP_DATE:"DOMAIN_REGISTRATION_DATE_INVALID"
});
function exactDateMs(value){
  if(typeof value!=="string"||
      !/^\d{4}-\d{2}-\d{2}(?:T[\d:.+-]+Z?)?$/.test(value))return null;
  const head=value.slice(0,10),ms=Date.parse(head+"T00:00:00Z");
  if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==head)return null;
  return ms;
}
function contradictoryEvidence(evidence,{now}){
  const issues=[];
  const registry=evidence?.registry;
  if(registry?.available===true&&registry.strongMatch===true&&
      registry.ambiguous!==true&&registry.entity){
    const count=registry.candidateCount;
    if(count!==undefined&&(!Number.isSafeInteger(count)||count!==1)){
      issues.push({code:MANUAL_REASON.REGISTRY_CARDINALITY,check:"registry"});
    }
  }
  const ofac=evidence?.ofac;
  if(ofac?.available===true){
    const candidateArray=Array.isArray(ofac.candidates)?ofac.candidates:null;
    const total=ofac.totalCandidatesAboveThreshold;
    if(candidateArray===null||!Number.isSafeInteger(total)){
      issues.push({code:MANUAL_REASON.OFAC_INCOMPLETE,check:"ofac"});
    }else if(total<0||(total===0&&candidateArray.length>0)){
      issues.push({code:MANUAL_REASON.OFAC_COUNTS,check:"ofac"});
    }
  }
  const rdap=evidence?.rdap;
  if(rdap?.available===true&&rdap.registered===true&&rdap.nameAligned===true){
    const raw=rdap.events?.registration??rdap.events?.registered??null;
    if(raw!==null){
      const registration=exactDateMs(raw);
      const today=Date.parse(String(now).slice(0,10)+"T00:00:00Z");
      if(registration===null||!Number.isFinite(today)||registration>today){
        issues.push({code:MANUAL_REASON.RDAP_DATE,check:"domain"});
      }
    }
  }
  return issues;
}
function assessHardenedCounterparty(evidence,{
  minScore=90,minDomainAgeDays=90,now="2026-10-02T12:00:00Z"
}={}){
  const baseline=assessCounterpartyReview(evidence,{minScore,minDomainAgeDays,now});
  const issues=contradictoryEvidence(evidence,{now});
  if(!issues.length){
    return {...baseline,hardened_quality_prototype:true,synthetic_contract_issue_codes:[]};
  }
  const reasons=[...new Set([...baseline.reasonCodes,...issues.map(i=>i.code)])];
  const checks={...baseline.checks};
  for(const issue of issues){
    checks[issue.check]={status:"review",reason:issue.code};
  }
  return {
    ...baseline,
    decision:"human_review",
    checks,
    reasonCodes:reasons,
    hardened_quality_prototype:true,
    synthetic_contract_issue_codes:issues.map(i=>i.code)
  };
}
module.exports={MANUAL_REASON,exactDateMs,contradictoryEvidence,assessHardenedCounterparty};
