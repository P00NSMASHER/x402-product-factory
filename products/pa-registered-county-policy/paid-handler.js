"use strict";
const {encodeHeader,decodePayment,requirements,paymentDocument,paymentRequiredResponse,verifyPayment,settleSamePayment}=require("../../packages/x402/payment");
const {validateRegisteredCountyPolicyInput}=require("./service");
const AMOUNT_ATOMIC="2000",PRICE="$0.002",RESOURCE_PATH="/api/pa-registered-county-policy";

function header(event,name){const wanted=name.toLowerCase();for(const[k,v]of Object.entries(event?.headers||{}))if(k.toLowerCase()===wanted&&v!=null)return String(v);}
function json(statusCode,body,headers={}){return{statusCode,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*","access-control-expose-headers":"PAYMENT-REQUIRED, PAYMENT-RESPONSE, x402-settled, x402-price, x402-network, x402-asset, x402-pay-to, Retry-After",...headers},body:JSON.stringify(body)};}
function temporary(reason){return json(503,{error:reason,paymentState:"unresolved",retrySamePayment:true},{"Retry-After":"2"});}
function productPaymentDocument(base){base=base.replace(/\/$/,"");return paymentDocument({
 resourceUrl:base+RESOURCE_PATH,amountAtomic:AMOUNT_ATOMIC,
 description:"Resolve a Pennsylvania business to one strong registry entity and compare its source-published registered county with a caller-supplied Pennsylvania county allowlist. Returns policy_match, policy_mismatch, company_not_found, or human_review. This is a caller-defined workflow policy check only; it does not prove physical operations, headquarters location, service area, residency, local ownership, tax situs, good standing, authority, or legal compliance.",
 serviceName:"PA Registered County Policy",
 tags:["pennsylvania-business-registry","registered-county","local-vendor-policy","procurement-policy","human-review"],
 inputExample:{type:"http",method:"GET",queryParams:{company:"OpenAI OpCo",allowedCounties:"Dauphin,Schuylkill"}},
 outputExample:{type:"json",example:{decision:"policy_match",registeredCounty:"Dauphin",paid:true}}
});}
function createPaidRegisteredCountyPolicyHandler({service,publicApiBase,fetchImpl=fetch}){
 if(!service||typeof service.check!=="function")throw new TypeError("service.check() is required");
 const req=requirements(AMOUNT_ATOMIC),doc=productPaymentDocument(publicApiBase);
 return async function handle({query={},event={}}={}){
  const signature=header(event,"payment-signature")??header(event,"x-payment");
  if(!signature)return paymentRequiredResponse({document:doc,price:PRICE});
  let payload;try{payload=decodePayment(signature);}catch(error){
   const reason=error?.message==="payment_header_too_large"?"payment_header_too_large":error?.message==="invalid_payment_payload"?"invalid_payment_payload":"invalid_payment_header";
   return paymentRequiredResponse({reason,document:doc,price:PRICE});
  }
  let normalized;try{normalized=validateRegisteredCountyPolicyInput({company:query.company??"",allowedCounties:query.allowedCounties??""});}
  catch(error){return json(400,{error:"invalid_request",detail:error?.message||"invalid_input"});}
  const verification=await verifyPayment({paymentPayload:payload,paymentRequirements:req,fetchImpl});
  if(verification.kind==="unresolved")return temporary(verification.reason);
  if(verification.kind==="terminal")return paymentRequiredResponse({reason:verification.reason,document:doc,price:PRICE});
  let result;try{result=await service.check(normalized);}catch{return json(502,{error:"required_source_unavailable",chargeable:false});}
  if(result?.chargeable!==true||(Array.isArray(result?.sourceFailures)&&result.sourceFailures.length))return json(502,{error:"required_source_unavailable",sourceFailures:result?.sourceFailures||[],checkedAt:result?.checkedAt??null,chargeable:false});
  const settlement=await settleSamePayment({paymentPayload:payload,paymentRequirements:req,fetchImpl});
  if(settlement.kind==="unresolved")return temporary(settlement.reason);
  if(settlement.kind==="terminal")return paymentRequiredResponse({reason:settlement.reason,document:doc,price:PRICE});
  return json(200,{...result,paid:true,price:PRICE},{"PAYMENT-RESPONSE":encodeHeader(settlement.receipt),"x402-settled":"true"});
 };
}
module.exports={AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument,createPaidRegisteredCountyPolicyHandler};
