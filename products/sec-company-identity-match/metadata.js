"use strict";

const {requirements}=require("../../packages/x402/payment");
const {AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument}=require("./paid-handler");

const OPERATION_ID="matchSecPublicCompanyIdentity";

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
    summary:"Match an expected public-company name to SEC ticker/CIK identity",
    description:
      "Resolve exactly one SEC ticker or CIK and compare the supplied expected company name with the authoritative SEC EDGAR company name after conservative corporate-suffix normalization. Returns match, human_review, or company_not_found. A match is an SEC identity-consistency result only; it is not investment advice and does not establish good standing, ownership, authority, fraud/sanctions/credit status, or legal compliance.",
    tags:["SEC","EDGAR","Company Identity"],
    "x-input-rule":"Provide company plus exactly one of ticker or cik.",
    parameters:[
      {name:"company",in:"query",required:true,schema:{type:"string",minLength:2,maxLength:160},example:"Apple"},
      {name:"ticker",in:"query",required:false,schema:{type:"string",minLength:1,maxLength:12},example:"AAPL"},
      {name:"cik",in:"query",required:false,schema:{type:"string",pattern:"^\\d{1,10}$"},example:"320193"}
    ],
    "x-payment-info":{
      price:{mode:"fixed",currency:"USD",amount:"0.003000"},
      protocols:[{x402:{}}],
      network:"eip155:8453",
      payTo:"0x708f7b52b56eafd7fc1de65fc7752ed732914021"
    },
    responses:{
      200:{description:"Completed paid SEC company identity result."},
      400:{description:"Invalid input; payment is not settled."},
      402:{description:"Payment required or terminally invalid."},
      502:{description:"SEC unavailable or deployment SEC_USER_AGENT missing; payment is not settled."},
      503:{description:"Payment state unresolved; retry the same payment authorization."}
    }
  }};
}

function llmsText(base){
  base=base.replace(/\/$/,"");
  return [
    "# SEC Public Company Identity Match x402",
    "",
    "Purpose: check whether an expected company name matches the authoritative SEC EDGAR identity resolved from exactly one ticker or CIK.",
    "Paid endpoint: GET "+base+RESOURCE_PATH+"?company=Apple&ticker=AAPL",
    "Price: $0.003 USDC on Base via x402.",
    "Source: U.S. Securities and Exchange Commission EDGAR.",
    "Returns: match, human_review, or company_not_found.",
    "A match is not investment advice and does not prove good standing, ownership, authority, fraud/sanctions/credit status, or legal compliance.",
    "Deployment must set SEC_USER_AGENT with a declared client identity and contact email.",
    "On HTTP 503 retry the same PAYMENT-SIGNATURE rather than creating a new payment authorization."
  ].join("\n");
}

module.exports={OPERATION_ID,catalogResource,openApiPath,llmsText};
