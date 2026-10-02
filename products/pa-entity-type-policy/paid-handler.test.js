"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {encodeHeader}=require("../../packages/x402/payment");
const {AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument,createPaidEntityTypePolicyHandler}=require("./paid-handler");
function response(body,status=200){return{status,ok:status>=200&&status<300,async json(){return body;}};}
const sig=()=>encodeHeader({x402Version:2,payload:{signed:true}});
const query=()=>({company:"OpenAI OpCo",allowedKinds:"llc,corporation"});

test("Product 021 advertises 2000 atomic / $0.002",()=>{
  const d=productPaymentDocument("https://example.test");
  assert.equal(AMOUNT_ATOMIC,"2000");assert.equal(PRICE,"$0.002");assert.equal(d.resource.url,"https://example.test"+RESOURCE_PATH);assert.equal(d.accepts[0].amount,"2000");
});
test("unpaid request returns 402 before source work",async()=>{
  let c=0;const h=createPaidEntityTypePolicyHandler({publicApiBase:"https://example.test",service:{async check(){c++;}},fetchImpl:async()=>response({})});
  const r=await h({query:query(),event:{headers:{}}});assert.equal(r.statusCode,402);assert.equal(c,0);
});
test("invalid allowedKinds is rejected before verification",async()=>{
  let network=0;const h=createPaidEntityTypePolicyHandler({publicApiBase:"https://example.test",service:{async check(){throw new Error("should not run");}},fetchImpl:async()=>{network++;return response({});}});
  const r=await h({query:{company:"OpenAI",allowedKinds:"bank"},event:{headers:{"payment-signature":sig()}}});
  assert.equal(r.statusCode,400);assert.equal(network,0);
});
test("valid policy result verifies then settles",async()=>{
  const urls=[];const h=createPaidEntityTypePolicyHandler({
    publicApiBase:"https://example.test",
    service:{async check(){return{decision:"policy_match",registrationKind:"llc",sourceFailures:[],chargeable:true};}},
    fetchImpl:async url=>{urls.push(url);return url.endsWith("/verify")?response({isValid:true}):response({success:true,transaction:"0x21"});}
  });
  const r=await h({query:query(),event:{headers:{"payment-signature":sig()}}});
  assert.equal(r.statusCode,200);assert.deepEqual(urls.map(x=>x.split("/").pop()),["verify","settle"]);assert.equal(JSON.parse(r.body).paid,true);
});
test("registry outage does not settle",async()=>{
  const urls=[];const h=createPaidEntityTypePolicyHandler({
    publicApiBase:"https://example.test",
    service:{async check(){return{decision:"human_review",sourceFailures:[{source:"pa_registry",detail:"timeout"}],chargeable:false};}},
    fetchImpl:async url=>{urls.push(url);return response({isValid:true});}
  });
  const r=await h({query:query(),event:{headers:{"payment-signature":sig()}}});
  assert.equal(r.statusCode,502);assert.equal(urls.length,1);assert.ok(urls[0].endsWith("/verify"));
});
