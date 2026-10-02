"use strict";

const {requirements}=require("../../packages/x402/payment");
const {AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument}=require("./paid-handler");
const OPERATION_ID="checkSecFilingFreshness";

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
    summary:"Check SEC filing freshness for a public filer",
    description:"Resolve a U.S. public filer by ticker or CIK and determine whether SEC EDGAR contains a matching filing inside a caller-selected freshness window. Optional form filtering is exact (for example 8-K, 10-Q, 10-K). Returns recent_filing, no_recent_filing, or company_not_found. The endpoint reports metadata only and does not interpret filing contents or provide investment advice.",
    tags:["SEC","EDGAR","Filing Freshness","Company Data"],
    parameters:[
      {name:"ticker",in:"query",required:false,schema:{type:"string",minLength:1,maxLength:12},example:"AAPL"},
      {name:"cik",in:"query",required:false,schema:{type:"string"},example:"320193"},
      {name:"form",in:"query",required:false,schema:{type:"string",maxLength:20},example:"8-K"},
      {name:"maxAgeDays",in:"query",required:false,schema:{type:"integer",minimum:1,maximum:365,default:30},example:30}
    ],
    "x-input-rule":"Provide exactly one of ticker or cik.",
    "x-payment-info":{
      price:{mode:"fixed",currency:"USD",amount:"0.005000"},
      protocols:[{x402:{}}],
      network:"eip155:8453",
      payTo:"0x708f7b52b56eafd7fc1de65fc7752ed732914021"
    },
    responses:{
      200:{description:"Completed paid SEC freshness decision."},
      400:{description:"Invalid input; payment is not settled."},
      402:{description:"Payment required or terminally invalid."},
      502:{description:"SEC EDGAR unavailable or invalid source contract; payment is not settled."},
      503:{description:"Payment state unresolved; retry the same payment authorization."}
    }
  }};
}

function llmsText(base){
  base=base.replace(/\/$/,"");
  return [
    "# SEC Filing Freshness Check x402",
    "",
    "Purpose: determine whether a public filer has a matching SEC EDGAR filing inside a requested freshness window.",
    "Endpoint: GET "+base+RESOURCE_PATH+"?ticker=AAPL&maxAgeDays=30",
    "Price: $0.005 USDC on Base via x402.",
    "Input: exactly one of ticker or cik; optional exact form filter and maxAgeDays 1-365.",
    "Decisions: recent_filing, no_recent_filing, company_not_found.",
    "Source: U.S. Securities and Exchange Commission EDGAR public APIs.",
    "This service reports filing metadata only. It does not interpret filing contents and is not investment advice.",
    "On HTTP 503 retry the same PAYMENT-SIGNATURE."
  ].join("\n");
}

module.exports={OPERATION_ID,catalogResource,openApiPath,llmsText};
