"use strict";

function finiteRate(value){
  const n=typeof value==="number"?value:Number(value);
  return Number.isFinite(n)?n:null;
}

function assessTreasuryRateTrend(evidence,{minChangeBps=1,checkedAt=new Date().toISOString()}={}){
  const threshold=Number(minChangeBps);
  if(!Number.isSafeInteger(threshold)||threshold<1||threshold>1000){
    throw new Error("invalid_min_change_bps");
  }

  const base={
    minChangeBps:threshold,
    latest:null,
    previous:null,
    changePercentPoints:null,
    changeBps:null,
    checkedAt
  };

  if(evidence?.available!==true){
    return {...base,decision:"human_review",reasonCodes:["TREASURY_EVIDENCE_UNAVAILABLE"]};
  }
  if(evidence.found!==true){
    return {...base,decision:"human_review",reasonCodes:["TREASURY_SECURITY_NOT_FOUND"]};
  }
  if(evidence.ambiguous===true){
    return {...base,decision:"human_review",reasonCodes:["TREASURY_SECURITY_AMBIGUOUS"]};
  }
  if(!Array.isArray(evidence.points)||evidence.points.length<2){
    return {...base,decision:"human_review",reasonCodes:["TREASURY_HISTORY_INSUFFICIENT"]};
  }

  const latest=evidence.points[0];
  const previous=evidence.points[1];
  const latestRate=finiteRate(latest?.averageInterestRatePercent);
  const previousRate=finiteRate(previous?.averageInterestRatePercent);
  if(
    latestRate==null||
    previousRate==null||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(latest?.recordDate??""))||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(previous?.recordDate??""))||
    String(latest.recordDate)<=String(previous.recordDate)
  ){
    return {...base,decision:"human_review",reasonCodes:["TREASURY_HISTORY_INVALID"]};
  }

  const delta=latestRate-previousRate;
  const changePercentPoints=Number(delta.toFixed(6));
  const changeBps=Number((delta*100).toFixed(3));

  let decision="unchanged";
  let reason="TREASURY_RATE_UNCHANGED_WITHIN_THRESHOLD";
  if(changeBps>=threshold){
    decision="rising";
    reason="TREASURY_RATE_RISING";
  }else if(changeBps<=-threshold){
    decision="falling";
    reason="TREASURY_RATE_FALLING";
  }

  return {
    ...base,
    latest,
    previous,
    latestRatePercent:latestRate,
    previousRatePercent:previousRate,
    changePercentPoints,
    changeBps,
    decision,
    reasonCodes:[reason]
  };
}

module.exports={assessTreasuryRateTrend};
