"use strict";

const {
  encodeHeader,
  decodePayment,
  requirements,
  paymentDocument,
  paymentRequiredResponse,
  verifyPayment,
  settleSamePayment,
}=require("../../packages/x402/payment");
const {validateFilingFreshnessInput}=require("./service");

const AMOUNT_ATOMIC="5000";
const PRICE="$0.005";
const RESOURCE_PATH="/api/sec-filing-freshness";

function header(event,name){
  const wanted=name.toLowerCase();
  for(const [key,value] of Object.entries(event?.headers||{})){
    if(key.toLowerCase()===wanted&&value!=null)return String(value);
  }
}

function json(statusCode,body,headers={}){
  return {
    statusCode,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store",
      "access-control-allow-origin":"*",
      "access-control-expose-headers":"PAYMENT-REQUIRED, PAYMENT-RESPONSE, x402-settled, x402-price, x402-network, x402-asset, x402-pay-to, Retry-After",
      ...headers
    },
    body:JSON.stringify(body)
  };
}

function temporary(reason){
  return json(503,{error:reason,paymentState:"unresolved",retrySamePayment:true},{"Retry-After":"2"});
}

function productPaymentDocument(base){
  base=base.replace(/\/$/,"");
  return paymentDocument({
    resourceUrl:base+RESOURCE_PATH,
    amountAtomic:AMOUNT_ATOMIC,
    description:"Check whether a U.S. public filer has an SEC EDGAR filing matching an optional form filter within a caller-selected freshness window. Returns recent_filing, no_recent_filing, or company_not_found from authoritative SEC metadata; it does not interpret filing contents or provide investment advice.",
    serviceName:"SEC Filing Freshness Check",
    tags:["SEC","EDGAR","filing-freshness","company-data","agent-decision"],
    inputExample:{type:"http",method:"GET",queryParams:{ticker:"AAPL",maxAgeDays:30}},
    outputExample:{type:"json",example:{decision:"recent_filing",maxAgeDays:30,paid:true}}
  });
}

function createPaidSecFilingFreshnessHandler({service,publicApiBase,fetchImpl=fetch}){
  if(!service||typeof service.check!=="function")throw new TypeError("service.check() is required");
  if(typeof publicApiBase!=="string"||!/^https:\/\//.test(publicApiBase))throw new TypeError("https publicApiBase is required");

  const paymentRequirements=requirements(AMOUNT_ATOMIC);
  const document=productPaymentDocument(publicApiBase);

  return async function handle({query={},event={}}={}){
    const signature=header(event,"payment-signature")??header(event,"x-payment");
    if(!signature)return paymentRequiredResponse({document,price:PRICE});

    let payload;
    try{payload=decodePayment(signature);}
    catch(error){
      const reason=error?.message==="payment_header_too_large"?"payment_header_too_large":
        error?.message==="invalid_payment_payload"?"invalid_payment_payload":"invalid_payment_header";
      return paymentRequiredResponse({reason,document,price:PRICE});
    }

    let normalized;
    try{
      normalized=validateFilingFreshnessInput({
        ticker:query.ticker??"",
        cik:query.cik??"",
        form:query.form??"",
        maxAgeDays:query.maxAgeDays??""
      });
    }catch(error){
      return json(400,{error:"invalid_request",detail:error?.message||"invalid_input"});
    }

    const verification=await verifyPayment({paymentPayload:payload,paymentRequirements,fetchImpl});
    if(verification.kind==="unresolved")return temporary(verification.reason);
    if(verification.kind==="terminal")return paymentRequiredResponse({reason:verification.reason,document,price:PRICE});

    let result;
    try{result=await service.check(normalized);}
    catch{return json(502,{error:"required_source_unavailable",chargeable:false});}

    if(result?.chargeable!==true||(Array.isArray(result?.sourceFailures)&&result.sourceFailures.length)){
      return json(502,{
        error:"required_source_unavailable",
        sourceFailures:result?.sourceFailures||[],
        checkedAt:result?.checkedAt??null,
        chargeable:false
      });
    }

    const settlement=await settleSamePayment({paymentPayload:payload,paymentRequirements,fetchImpl});
    if(settlement.kind==="unresolved")return temporary(settlement.reason);
    if(settlement.kind==="terminal")return paymentRequiredResponse({reason:settlement.reason,document,price:PRICE});

    return json(200,{...result,paid:true,price:PRICE},{
      "PAYMENT-RESPONSE":encodeHeader(settlement.receipt),
      "x402-settled":"true"
    });
  };
}

module.exports={AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument,createPaidSecFilingFreshnessHandler};
