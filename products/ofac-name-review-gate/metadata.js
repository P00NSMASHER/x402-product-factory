"use strict";

const {requirements}=require("../../packages/x402/payment");
const {
  AMOUNT_ATOMIC,
  PRICE,
  RESOURCE_PATH,
  productPaymentDocument
}=require("./paid-handler");

const OPERATION_ID="reviewOfacSdnName";

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
    summary:"Run an OFAC SDN name-review screen",
    description:"Screen a person or organization name against current U.S. Treasury OFAC SDN primary names and aliases using deterministic similarity scoring. Returns candidate_found, no_candidate, or human_review. A candidate is a review signal, not a legal sanctions determination. no_candidate is not sanctions clearance, and the endpoint does not perform OFAC 50 Percent Rule ownership analysis.",
    tags:["OFAC","SDN","Name Screening","Human Review"],
    parameters:[
      {
        name:"name",
        in:"query",
        required:true,
        schema:{type:"string",minLength:2,maxLength:160},
        example:"Example LLC"
      },
      {
        name:"minScore",
        in:"query",
        required:false,
        schema:{type:"integer",minimum:70,maximum:100,default:90},
        example:90
      }
    ],
    "x-payment-info":{
      price:{mode:"fixed",currency:"USD",amount:"0.003000"},
      protocols:[{x402:{}}],
      network:"eip155:8453",
      payTo:"0x708f7b52b56eafd7fc1de65fc7752ed732914021"
    },
    responses:{
      200:{description:"Completed paid OFAC name-review result."},
      400:{description:"Invalid name or threshold; payment is not settled."},
      402:{description:"Payment required or terminally invalid."},
      502:{description:"OFAC source unavailable or invalid; payment is not settled."},
      503:{description:"Payment state unresolved; retry the same payment authorization."}
    }
  }};
}

function llmsText(base){
  base=base.replace(/\/$/,"");
  return [
    "# OFAC Name Review Gate x402",
    "",
    "Endpoint: GET "+base+RESOURCE_PATH+"?name=Example%20LLC&minScore=90",
    "Price: $0.003 USDC on Base via x402.",
    "Source: current U.S. Treasury OFAC SDN.CSV and ALT.CSV.",
    "Decisions: candidate_found, no_candidate, or human_review.",
    "A candidate is a review signal only, not a legal sanctions determination.",
    "A no_candidate result is not sanctions clearance.",
    "OFAC 50 Percent Rule ownership analysis is not included.",
    "On HTTP 503 retry the same PAYMENT-SIGNATURE."
  ].join("\n");
}

module.exports={OPERATION_ID,catalogResource,openApiPath,llmsText};
