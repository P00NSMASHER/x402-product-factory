"use strict";

const TREASURY_API =
  "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates";
const SOURCE_TIMEOUT_MS = 10000;

async function fetchJson(fetchImpl,url,init={},timeoutMs=SOURCE_TIMEOUT_MS){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(url,{...init,signal:controller.signal});
    if(!response||response.ok!==true){
      const error=new Error("treasury_http_"+(response?.status??"unknown"));
      error.code="SOURCE_HTTP_ERROR";
      throw error;
    }
    return await response.json();
  }finally{clearTimeout(timer);}
}

function normalizeSecurity(value){
  return String(value||"").trim().replace(/\s+/g," ");
}

function createTreasuryAverageRatesAdapter({fetchImpl=fetch,timeoutMs=SOURCE_TIMEOUT_MS}={}){
  async function rows(){
    const url=new URL(TREASURY_API);
    url.searchParams.set("fields","record_date,security_type_desc,security_desc,avg_interest_rate_amt");
    url.searchParams.set("sort","-record_date");
    url.searchParams.set("page[size]","300");

    const payload=await fetchJson(fetchImpl,url.toString(),{
      headers:{
        accept:"application/json",
        "user-agent":"x402-product-0.1 https://github.com/P00NSMASHER/permitplate-nyc"
      }
    },timeoutMs);

    const data=Array.isArray(payload?.data)?payload.data:null;
    if(!data||data.length===0){
      const error=new Error("treasury_no_data");
      error.code="SOURCE_CONTRACT_INVALID";
      throw error;
    }
    return data;
  }

  function chooseDescription(data,wanted){
    const needle=wanted.toLowerCase();
    const exactDescriptions=[...new Set(data
      .map(row=>String(row?.security_desc??"").trim())
      .filter(desc=>desc&&desc.toLowerCase()===needle)
    )];
    if(exactDescriptions.length>0){
      return {
        found:true,
        ambiguous:exactDescriptions.length>1,
        descriptions:exactDescriptions,
        selected:exactDescriptions.length===1?exactDescriptions[0]:null
      };
    }

    const containsDescriptions=[...new Set(data
      .map(row=>String(row?.security_desc??"").trim())
      .filter(desc=>desc&&desc.toLowerCase().includes(needle))
    )];
    return {
      found:containsDescriptions.length>0,
      ambiguous:containsDescriptions.length>1,
      descriptions:containsDescriptions,
      selected:containsDescriptions.length===1?containsDescriptions[0]:null
    };
  }

  function normalizeRow(row){
    const raw=row?.avg_interest_rate_amt;
    const rate=raw==null||raw===""?null:Number(raw);
    return {
      recordDate:String(row?.record_date??""),
      securityDescription:row?.security_desc??null,
      securityType:row?.security_type_desc??null,
      averageInterestRatePercent:Number.isFinite(rate)?rate:null
    };
  }

  return {
    async lookup({security}){
      const wanted=normalizeSecurity(security);
      if(wanted.length<2||wanted.length>100){
        const error=new Error("invalid_security");
        error.code="INVALID_INPUT";
        throw error;
      }

      const data=await rows();
      const recordDate=String(data[0]?.record_date??"");
      if(!/^\d{4}-\d{2}-\d{2}$/.test(recordDate)){
        const error=new Error("treasury_record_date_invalid");
        error.code="SOURCE_CONTRACT_INVALID";
        throw error;
      }

      const latest=data.filter(row=>String(row?.record_date??"")===recordDate);
      const choice=chooseDescription(latest,wanted);
      const matches=choice.descriptions.map(description=>{
        const row=latest.find(item=>String(item?.security_desc??"").trim()===description);
        return normalizeRow(row);
      });

      return {
        available:true,
        recordDate,
        query:wanted,
        matchCount:matches.length,
        ambiguous:choice.ambiguous,
        found:choice.found,
        selected:matches.length===1?matches[0]:null,
        matches,
        provenance:{
          source:"U.S. Treasury Fiscal Data — Average Interest Rates on U.S. Treasury Securities",
          url:TREASURY_API,
          frequency:"monthly"
        }
      };
    },

    async history({security,points=2}){
      const wanted=normalizeSecurity(security);
      if(wanted.length<2||wanted.length>100){
        const error=new Error("invalid_security");
        error.code="INVALID_INPUT";
        throw error;
      }
      const count=Number(points);
      if(!Number.isSafeInteger(count)||count<2||count>24){
        const error=new Error("invalid_history_points");
        error.code="INVALID_INPUT";
        throw error;
      }

      const data=await rows();
      const choice=chooseDescription(data,wanted);
      if(!choice.found||choice.ambiguous||!choice.selected){
        return {
          available:true,
          query:wanted,
          found:choice.found,
          ambiguous:choice.ambiguous,
          matchDescriptions:choice.descriptions,
          points:[],
          provenance:{
            source:"U.S. Treasury Fiscal Data — Average Interest Rates on U.S. Treasury Securities",
            url:TREASURY_API,
            frequency:"monthly"
          }
        };
      }

      const selectedRows=data
        .filter(row=>String(row?.security_desc??"").trim()===choice.selected)
        .map(normalizeRow)
        .filter(row=>/^\d{4}-\d{2}-\d{2}$/.test(row.recordDate))
        .sort((a,b)=>b.recordDate.localeCompare(a.recordDate));

      const distinct=[];
      const seen=new Set();
      for(const row of selectedRows){
        if(seen.has(row.recordDate))continue;
        seen.add(row.recordDate);
        distinct.push(row);
        if(distinct.length>=count)break;
      }

      return {
        available:true,
        query:wanted,
        found:true,
        ambiguous:false,
        matchDescriptions:[choice.selected],
        points:distinct,
        provenance:{
          source:"U.S. Treasury Fiscal Data — Average Interest Rates on U.S. Treasury Securities",
          url:TREASURY_API,
          frequency:"monthly"
        }
      };
    },

    async compare({leftSecurity,rightSecurity}){
      const left=normalizeSecurity(leftSecurity);
      const right=normalizeSecurity(rightSecurity);
      for(const value of [left,right]){
        if(value.length<2||value.length>100){
          const error=new Error("invalid_security");
          error.code="INVALID_INPUT";
          throw error;
        }
      }
      if(left.toLowerCase()===right.toLowerCase()){
        const error=new Error("securities_must_differ");
        error.code="INVALID_INPUT";
        throw error;
      }

      const data=await rows();
      const recordDate=String(data[0]?.record_date??"");
      if(!/^\d{4}-\d{2}-\d{2}$/.test(recordDate)){
        const error=new Error("treasury_record_date_invalid");
        error.code="SOURCE_CONTRACT_INVALID";
        throw error;
      }
      const latest=data.filter(row=>String(row?.record_date??"")===recordDate);

      function resolve(wanted){
        const choice=chooseDescription(latest,wanted);
        const selected=choice.selected
          ? normalizeRow(latest.find(row=>String(row?.security_desc??"").trim()===choice.selected))
          : null;
        return {
          query:wanted,
          found:choice.found,
          ambiguous:choice.ambiguous,
          matchDescriptions:choice.descriptions,
          selected
        };
      }

      return {
        available:true,
        recordDate,
        left:resolve(left),
        right:resolve(right),
        provenance:{
          source:"U.S. Treasury Fiscal Data — Average Interest Rates on U.S. Treasury Securities",
          url:TREASURY_API,
          frequency:"monthly"
        }
      };
    }
  };
}

module.exports={TREASURY_API,normalizeSecurity,createTreasuryAverageRatesAdapter};
