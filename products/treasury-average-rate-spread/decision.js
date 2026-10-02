"use strict";

function finite(value){return typeof value==="number"&&Number.isFinite(value);}

function assessTreasuryRateSpread(evidence,{toleranceBps=2,checkedAt=new Date().toISOString()}={}){
  const reasonCodes=[];
  const checks={};

  if(evidence?.available!==true){
    reasonCodes.push("TREASURY_EVIDENCE_UNAVAILABLE");
    checks.source={status:"review",reason:"TREASURY_EVIDENCE_UNAVAILABLE"};
  }else{
    for(const side of ["left","right"]){
      const item=evidence?.[side]||{};
      const prefix=side.toUpperCase();
      if(item.found!==true){
        reasonCodes.push(prefix+"_SECURITY_NOT_FOUND");
      }else if(item.ambiguous===true){
        reasonCodes.push(prefix+"_SECURITY_AMBIGUOUS");
      }else if(!item.selected||!finite(item.selected.averageInterestRatePercent)){
        reasonCodes.push(prefix+"_RATE_VALUE_UNAVAILABLE");
      }
    }
    if(reasonCodes.length===0){
      checks.source={status:"pass",reason:"SAME_MONTH_TWO_CATEGORY_EVIDENCE_COMPLETE"};
    }else{
      checks.source={status:"review",reason:reasonCodes[0]};
    }
  }

  let left=null,right=null,spreadBps=null;
  if(reasonCodes.length===0){
    left=evidence.left.selected;
    right=evidence.right.selected;
    if(
      !/^\d{4}-\d{2}-\d{2}$/.test(String(evidence.recordDate??""))||
      left.recordDate!==evidence.recordDate||
      right.recordDate!==evidence.recordDate
    ){
      reasonCodes.push("RECORD_DATE_MISMATCH");
      checks.source={status:"review",reason:"RECORD_DATE_MISMATCH"};
    }else{
      spreadBps=Number(((left.averageInterestRatePercent-right.averageInterestRatePercent)*100).toFixed(3));
    }
  }

  let decision="human_review";
  if(reasonCodes.length===0){
    if(Math.abs(spreadBps)<=toleranceBps)decision="within_tolerance";
    else if(spreadBps>0)decision="left_higher";
    else decision="right_higher";
  }

  return {
    decision,
    reasonCodes,
    checks,
    recordDate:evidence?.recordDate??null,
    left,
    right,
    spreadBps,
    toleranceBps,
    checkedAt,
    policy:{sameRecordDateRequired:true,withinToleranceInclusive:true,automaticReject:false}
  };
}

module.exports={assessTreasuryRateSpread};
