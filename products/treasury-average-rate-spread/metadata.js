"use strict";

const {requirements}=require("../../packages/x402/payment");
const {
  AMOUNT_ATOMIC,
  PRICE,
  RESOURCE_PATH,
  productPaymentDocument
}=require("./paid-handler");

const OPERATION_ID="compareTreasuryAverageRateSpread";

function catalogResource(base){
  base=base.replace(/\/$/,"");
  const d=productPaymentDocument(base);
  return {
    resource:base+RESOURCE_PATH,
    method:"GET",
    description:d.resource.description,
    price:PRICE,
    tags:d.resource.tags,
    accepts:[requirements(AMOUNT_ATOMIC)],
    extensions:d.extensions
  };
}

function openApiPath(){
  return {get:{
    operationId:OPERATION_ID,
    summary:"Compare two Treasury average-rate categories",
    description:"Compare the latest official monthly weighted-average interest rates for two Treasury security categories using the same Fiscal Data record date. Returns left_higher, right_higher, within_tolerance, or human_review. spreadBps is left minus right in basis points. This is not a live market yield spread, yield-curve trading signal, forecast, or investment recommendation.",
    tags:["Treasury","Interest Rates","Rate Spread","Macro"],
    parameters:[
      {name:"leftSecurity",in:"query",required:true,schema:{type:"string",minLength:2,maxLength:100},example:"Treasury Bills"},
      {name:"rightSecurity",in:"query",required:true,schema:{type:"string",minLength:2,maxLength:100},example:"Treasury Notes"},
      {name:"toleranceBps",in:"query",required:false,schema:{type:"number",minimum:0,maximum:1000,default:2},example:2}
    ],
    "x-payment-info":{
      price:{mode:"fixed",currency:"USD",amount:"0.003000"},
      protocols:[{x402:{}}],
      network:"eip155:8453",
      payTo:"0x708f7b52b56eafd7fc1de65fc7752ed732914021"
    },
    responses:{
      200:{description:"Completed paid same-month Treasury rate-spread classification."},
      400:{description:"Invalid input; payment not settled."},
      402:{description:"Payment required."},
      502:{description:"Treasury Fiscal Data unavailable; payment not settled."},
      503:{description:"Payment unresolved; retry same authorization."}
    }
  }};
}

function llmsText(base){
  return [
    "# Treasury Average Rate Spread x402",
    "",
    "Endpoint: GET "+base.replace(/\/$/,"")+RESOURCE_PATH+"?leftSecurity=Treasury%20Bills&rightSecurity=Treasury%20Notes&toleranceBps=2",
    "Price: $0.003 USDC on Base via x402.",
    "Source: U.S. Treasury Fiscal Data — Average Interest Rates on U.S. Treasury Securities.",
    "Both categories are resolved from one source response and the same latest monthly record date.",
    "Decisions: left_higher, right_higher, within_tolerance, human_review.",
    "spreadBps = (left monthly average rate - right monthly average rate) * 100.",
    "This is not a live market yield spread, curve-trading signal, forecast, or investment advice.",
    "On HTTP 503 retry the same PAYMENT-SIGNATURE."
  ].join("\n");
}

module.exports={OPERATION_ID,catalogResource,openApiPath,llmsText};
