"use strict";
const {requirements}=require("../../packages/x402/payment");
const {AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument}=require("./paid-handler");
const OPERATION_ID="matchPennsylvaniaBusinessAddress";

function catalogResource(base){
  base=base.replace(/\/$/,"");
  const doc=productPaymentDocument(base);
  return {
    resource:base+RESOURCE_PATH,
    method:"GET",
    description:doc.resource.description,
    price:PRICE,
    tags:doc.resource.tags,
    accepts:[requirements(AMOUNT_ATOMIC)],
    extensions:doc.extensions
  };
}

function openApiPath(){
  return {get:{
    operationId:OPERATION_ID,
    summary:"Check a Pennsylvania business address against registry evidence",
    description:"Resolve a Pennsylvania business name to a unique strong registry entity and compare the supplied address with the registry address using U.S. Census geocoding. Returns match or human_review. A match is not proof of physical presence, control, good standing, ownership, authority, fraud risk, sanctions status, creditworthiness, or legal compliance.",
    tags:["Business Address","Pennsylvania Business Registry","Vendor Identity"],
    parameters:[
      {name:"company",in:"query",required:true,schema:{type:"string",minLength:2,maxLength:120},example:"OpenAI OpCo"},
      {name:"address",in:"query",required:true,schema:{type:"string",minLength:5,maxLength:240},example:"600 North Second Street, Suite 401, Harrisburg, PA 17101"}
    ],
    "x-payment-info":{
      price:{mode:"fixed",currency:"USD",amount:"0.003000"},
      protocols:[{x402:{}}],
      network:"eip155:8453",
      payTo:"0x708f7b52b56eafd7fc1de65fc7752ed732914021"
    },
    responses:{
      200:{description:"Completed paid address-consistency result."},
      400:{description:"Invalid input; payment is not settled."},
      402:{description:"Payment required or terminally invalid."},
      502:{description:"Required source unavailable; payment is not settled."},
      503:{description:"Payment state unresolved; retry the same payment authorization."}
    }
  }};
}

module.exports={OPERATION_ID,catalogResource,openApiPath};
