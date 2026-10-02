"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {encodeHeader}=require("../../packages/x402/payment");
const {
  AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,
  productPaymentDocument,createPaidVendorDomainContinuityHandler
}=require("./paid-handler");

function response(body,status=200){
  return{status,ok:status>=200&&status<300,async json(){return body;}};
}
const sig=()=>encodeHeader({x402Version:2,payload:{signed:true}});
const query=()=>({
  company:"OpenAI OpCo",domain:"openai.com",minExpirationDays:"180",minStableDays:"30"
});

test("Product 020 terms are $0.006 / 6000 atomic",()=>{
  const d=productPaymentDocument("https://example.test/");
  assert.equal(PRICE,"$0.006");
  assert.equal(AMOUNT_ATOMIC,"6000");
  assert.equal(d.resource.url,"https://example.test"+RESOURCE_PATH);
  assert.equal(d.accepts[0].amount,"6000");
});

test("unpaid request returns 402 before source work",async()=>{
  let calls=0;
  const h=createPaidVendorDomainContinuityHandler({
    publicApiBase:"https://example.test",
    service:{async check(){calls++;return{};}},
    fetchImpl:async()=>response({})
  });
  const r=await h({query:query(),event:{headers:{}}});
  assert.equal(r.statusCode,402);assert.equal(calls,0);
});

test("invalid stability threshold is rejected before verification",async()=>{
  let network=0;
  const h=createPaidVendorDomainContinuityHandler({
    publicApiBase:"https://example.test",
    service:{async check(){throw new Error("should not run");}},
    fetchImpl:async()=>{network++;return response({});}
  });
  const r=await h({
    query:{...query(),minStableDays:"0"},
    event:{headers:{"payment-signature":sig()}}
  });
  assert.equal(r.statusCode,400);assert.equal(network,0);
});

test("stable completed result verifies then settles",async()=>{
  const urls=[];
  const h=createPaidVendorDomainContinuityHandler({
    publicApiBase:"https://example.test",
    service:{async check(){return{
      decision:"stable_domain",reasonCodes:[],sourceFailures:[],chargeable:true
    };}},
    fetchImpl:async url=>{
      urls.push(url);
      return url.endsWith("/verify")
        ?response({isValid:true})
        :response({success:true,transaction:"0x020"});
    }
  });
  const r=await h({query:query(),event:{headers:{"payment-signature":sig()}}});
  assert.equal(r.statusCode,200);
  assert.deepEqual(urls.map(x=>x.split("/").pop()),["verify","settle"]);
  assert.equal(JSON.parse(r.body).decision,"stable_domain");
});

test("completed continuity review is chargeable",async()=>{
  const urls=[];
  const h=createPaidVendorDomainContinuityHandler({
    publicApiBase:"https://example.test",
    service:{async check(){return{
      decision:"human_review",
      reasonCodes:["DOMAIN_EXPIRATION_RUNWAY_BELOW_THRESHOLD"],
      sourceFailures:[],chargeable:true
    };}},
    fetchImpl:async url=>{
      urls.push(url);
      return url.endsWith("/verify")
        ?response({isValid:true})
        :response({success:true,transaction:"0x020b"});
    }
  });
  const r=await h({query:query(),event:{headers:{"payment-signature":sig()}}});
  assert.equal(r.statusCode,200);assert.equal(urls.length,2);
});

test("source failure after verification never settles",async()=>{
  const urls=[];
  const h=createPaidVendorDomainContinuityHandler({
    publicApiBase:"https://example.test",
    service:{async check(){return{
      decision:"human_review",sourceFailures:[{source:"rdap",detail:"SOURCE_TIMEOUT"}],chargeable:false
    };}},
    fetchImpl:async url=>{urls.push(url);return response({isValid:true});}
  });
  const r=await h({query:query(),event:{headers:{"payment-signature":sig()}}});
  assert.equal(r.statusCode,502);assert.equal(urls.length,1);
});
