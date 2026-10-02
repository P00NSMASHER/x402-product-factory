"use strict";
const {encodeHeader,decodePayment,requirements,paymentDocument,paymentRequiredResponse,verifyPayment,settleSamePayment}=require("../../packages/x402/payment");
const {validateDomainAgeInput}=require("./service");
const AMOUNT_ATOMIC="2000",PRICE="$0.002",RESOURCE_PATH="/api/domain-registration-age";
function header(event,name){const wanted=name.toLowerCase();for(const[k,v]of Object.entries(event?.headers||{}))if(k.toLowerCase()===wanted&&v!=null)return String(v);}
function json(statusCode,body,headers={}){return{statusCode,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*","access-control-expose-headers":"PAYMENT-REQUIRED, PAYMENT-RESPONSE, x402-settled, x402-price, x402-network, x402-asset, x402-pay-to, Retry-After",...headers},body:JSON.stringify(body)};}
function temporary(reason){return json(503,{error:reason,paymentState:"unresolved",retrySamePayment:true},{"Retry-After":"2"});}
function productPaymentDocument(base){base=base.replace(/\/$/,"");return paymentDocument({
 resourceUrl:base+RESOURCE_PATH,amountAtomic:AMOUNT_ATOMIC,
 description:"Determine whether a domain's authoritative RDAP registration date is at least a caller-selected age. Returns established, recent_registration, unregistered, or human_review. Domain age is an identity signal, not a fraud, legitimacy, safety, or ownership verdict.",
 serviceName:"Domain Registration Age",
 tags:["domain","rdap","registration-age","vendor-check","human-review"],
 inputExample:{type:"http",method:"GET",queryParams:{domain:"openai.com",minAgeDays:90}},
 outputExample:{type:"json",example:{decision:"established",minAgeDays:90,paid:true}}
});}
function createPaidDomainAgeHandler({service,publicApiBase,fetchImpl=fetch}){
 if(!service||typeof service.check!=="function")throw new TypeError("service.check() is required");
 const req=requirements(AMOUNT_ATOMIC),doc=productPaymentDocument(publicApiBase);
 return async function handle({query={},event={}}={}){
  const signature=header(event,"payment-signature")??header(event,"x-payment");
  if(!signature)return paymentRequiredResponse({document:doc,price:PRICE});
  let payload;try{payload=decodePayment(signature);}catch(error){
   const reason=error?.message==="payment_header_too_large"?"payment_header_too_large":error?.message==="invalid_payment_payload"?"invalid_payment_payload":"invalid_payment_header";
   return paymentRequiredResponse({reason,document:doc,price:PRICE});
  }
  let normalized;try{normalized=validateDomainAgeInput({domain:query.domain??"",minAgeDays:query.minAgeDays??""});}
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
module.exports={AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument,createPaidDomainAgeHandler};
