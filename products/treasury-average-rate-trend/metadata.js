"use strict";
const {requirements}=require("../../packages/x402/payment");
const {AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument}=require("./paid-handler");
const OPERATION_ID="getTreasuryAverageRateTrend";

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
    summary:"Compare latest Treasury average rate with prior month",
    description:"Select one official U.S. Treasury Fiscal Data monthly average-interest-rate category, compare the latest observation with the prior month, and return rising, falling, unchanged, or human_review using a caller minimum change in basis points. This is a two-point monthly direction signal using averages on outstanding Treasury debt, not a long-term trend determination, live market yield, forecast, monetary-policy prediction, or investment recommendation.",
    tags:["Treasury","Interest Rates","Trend","Macro"],
    parameters:[
      {name:"security",in:"query",required:true,schema:{type:"string",minLength:2,maxLength:100},example:"Total Marketable"},
      {name:"minChangeBps",in:"query",required:false,schema:{type:"integer",minimum:1,maximum:1000,default:1},example:1}
    ],
    "x-payment-info":{
      price:{mode:"fixed",currency:"USD",amount:"0.003000"},
      protocols:[{x402:{}}],
      network:"eip155:8453",
      payTo:"0x708f7b52b56eafd7fc1de65fc7752ed732914021"
    },
    responses:{
      200:{description:"Completed paid Treasury trend decision."},
      400:{description:"Invalid input; payment is not settled."},
      402:{description:"Payment required or terminally invalid."},
      502:{description:"Treasury Fiscal Data unavailable; payment is not settled."},
      503:{description:"Payment state unresolved; retry the same payment authorization."}
    }
  }};
}

function llmsText(base){
  const root=base.replace(/\/$/,"");
  return [
    "# Treasury Average Rate Trend x402",
    "",
    "Endpoint: GET "+root+RESOURCE_PATH+"?security=Total%20Marketable&minChangeBps=1",
    "Price: $0.003 USDC on Base via x402.",
    "Source: U.S. Treasury Fiscal Data — Average Interest Rates on U.S. Treasury Securities.",
    "Compares latest monthly rate with the previous month.",
    "Decisions: rising, falling, unchanged, human_review.",
    "This is a two-point monthly direction signal, not a long-term trend determination, live market yield, forecast, monetary-policy prediction, or investment advice.",
    "On HTTP 503 retry the same PAYMENT-SIGNATURE."
  ].join("\n");
}

module.exports={OPERATION_ID,catalogResource,openApiPath,llmsText};
