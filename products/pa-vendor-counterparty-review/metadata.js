"use strict";

const {requirements}=require("../../packages/x402/payment");
const {AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument}=require("./paid-handler");
const OPERATION_ID="reviewPennsylvaniaVendorCounterparty";

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
    summary:"Review a Pennsylvania vendor counterparty before automated intake",
    description:"Resolve a supplied Pennsylvania company name to one unique strong Department of State legal-entity match, screen the resolved legal name against current OFAC SDN primary names and aliases, verify the supplied domain through authoritative RDAP, require legal-name/domain alignment, and compare registration age against a caller threshold. Returns proceed or human_review. Proceed only means the configured review triggers were not hit; it is not legal/compliance approval, sanctions clearance, fraud scoring, credit approval, good-standing certification, or proof of domain ownership/control.",
    tags:["Vendor Intake","Counterparty Review","Pennsylvania Business Registry","OFAC","Domain Age","RDAP","Human Review"],
    parameters:[
      {name:"company",in:"query",required:true,schema:{type:"string",minLength:2,maxLength:120},example:"OpenAI OpCo"},
      {name:"domain",in:"query",required:true,schema:{type:"string",minLength:3,maxLength:253},example:"openai.com"},
      {name:"minScore",in:"query",required:false,schema:{type:"integer",minimum:70,maximum:100,default:90},example:90},
      {name:"minDomainAgeDays",in:"query",required:false,schema:{type:"integer",minimum:1,maximum:3650,default:90},example:90}
    ],
    "x-payment-info":{
      price:{mode:"fixed",currency:"USD",amount:"0.010000"},
      protocols:[{x402:{}}],
      network:"eip155:8453",
      payTo:"0x708f7b52b56eafd7fc1de65fc7752ed732914021"
    },
    responses:{
      200:{description:"Completed paid counterparty review. Decision is proceed or human_review."},
      400:{description:"Invalid input; payment not settled."},
      402:{description:"Payment required or terminally invalid."},
      502:{description:"PA registry, OFAC, or authoritative RDAP source unavailable; payment not settled."},
      503:{description:"Payment unresolved; retry the same authorization."}
    }
  }};
}

function llmsText(base){
  return [
    "# PA Vendor Counterparty Review x402",
    "",
    "Endpoint: GET "+base.replace(/\/$/,"")+RESOURCE_PATH+"?company=OpenAI%20OpCo&domain=openai.com&minScore=90&minDomainAgeDays=90",
    "Price: $0.010 USDC on Base via x402.",
    "Sources: Pennsylvania Department of State via data.pa.gov; current U.S. Treasury OFAC SDN/ALT files; IANA RDAP bootstrap plus authoritative registry RDAP.",
    "The service resolves the Pennsylvania legal entity first, screens that legal name against OFAC candidates, aligns the domain against the legal name, and checks domain registration age.",
    "Decision: proceed or human_review.",
    "Proceed only means configured review triggers were not hit; it is not sanctions clearance, legal/compliance approval, fraud scoring, or proof of domain ownership/control.",
    "On HTTP 503 retry the same PAYMENT-SIGNATURE."
  ].join("\n");
}

module.exports={OPERATION_ID,catalogResource,openApiPath,llmsText};
