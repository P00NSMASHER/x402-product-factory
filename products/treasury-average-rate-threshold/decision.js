"use strict";

function assessTreasuryRateThreshold(evidence,{thresholdPercent,operator="gte",checkedAt=new Date().toISOString()}){
  const threshold=Number(thresholdPercent);
  if(!Number.isFinite(threshold)||threshold<0||threshold>100)throw new Error("invalid_threshold");
  if(!["gte","lte"].includes(operator))throw new Error("invalid_operator");

  const base={
    thresholdPercent:threshold,
    operator,
    recordDate:evidence?.recordDate??null,
    checkedAt,
    selectedRate:evidence?.selected??null
  };

  if(evidence?.available!==true){
    return {...base,decision:"human_review",reasonCodes:["TREASURY_EVIDENCE_UNAVAILABLE"]};
  }
  if(evidence.found!==true){
    return {...base,decision:"human_review",reasonCodes:["TREASURY_SECURITY_NOT_FOUND"]};
  }
  if(evidence.ambiguous===true||evidence.matchCount!==1){
    return {...base,decision:"human_review",reasonCodes:["TREASURY_SECURITY_AMBIGUOUS"]};
  }

  const rawRate=evidence?.selected?.averageInterestRatePercent;
  const rate=
    typeof rawRate==="number"
      ? rawRate
      : typeof rawRate==="string"&&rawRate.trim()!==""
        ? Number(rawRate)
        : NaN;
  if(!Number.isFinite(rate)){
    return {...base,decision:"human_review",reasonCodes:["TREASURY_RATE_UNAVAILABLE"]};
  }

  const met=operator==="gte"?rate>=threshold:rate<=threshold;
  return {
    ...base,
    ratePercent:rate,
    decision:met?"threshold_met":"threshold_not_met",
    reasonCodes:[met?"TREASURY_RATE_THRESHOLD_MET":"TREASURY_RATE_THRESHOLD_NOT_MET"]
  };
}

module.exports={assessTreasuryRateThreshold};
