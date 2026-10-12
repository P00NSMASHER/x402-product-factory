"use strict";

// Offline Product 018 candidate. Registry/OFAC invariants were checked
// against their actual source adapters; this is not wired into runtime.
const {assessCounterpartyReview}=require("../../products/pa-vendor-counterparty-review/decision");
const {REASONS,exactDateMs,contradictoryEvidence}=require("./018-source-contract-v2");
function assessHardenedCounterparty(evidence,{
  minScore=90,minDomainAgeDays=90,now="2026-10-02T12:00:00Z"
}={}){
  const baseline=assessCounterpartyReview(evidence,{minScore,minDomainAgeDays,now});
  const issues=contradictoryEvidence(evidence,{now,minScore});
  if(!issues.length)return {...baseline,hardened_quality_prototype:true,synthetic_contract_issue_codes:[]};
  const reasonCodes=[...new Set([...baseline.reasonCodes,...issues.map(i=>i.code)])];
  const checks={...baseline.checks};
  for(const issue of issues)checks[issue.check]={status:"review",reason:issue.code};
  return {...baseline,decision:"human_review",reasonCodes,checks,
    hardened_quality_prototype:true,
    synthetic_contract_issue_codes:issues.map(i=>i.code)};
}
module.exports={MANUAL_REASON:REASONS,exactDateMs,contradictoryEvidence,assessHardenedCounterparty};
