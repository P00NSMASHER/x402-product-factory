"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {encodeHeader}=require("../../packages/x402/payment");
const {AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,productPaymentDocument,createPaidDomainExpirationHandler}=require("./paid-handler");
function response(body,status=200){return{status,ok:status>=200&&status<300,async json(){return body;}};}
const sig=()=>encodeHeader({x402Version:2,payload:{signed:true}});
const query=()=>({domain:"openai.com",horizonDays:"60"});
test("Product 011 terms are $0.002 / 2000 atomic",()=>{const d=productPaymentDocument("https://example.test");assert.equal(PRICE,"$0.002");assert.equal(AMOUNT_ATOMIC,"2000");assert.equal(d.resource.url,"https://example.test"+RESOURCE_PATH);});
test("unpaid returns 402 before RDAP work",async()=>{let c=0;const h=createPaidDomainExpirationHandler({publicApiBase:"https://example.test",service:{async check(){c++;}},fetchImpl:async()=>response({})});const r=await h({query:query(),event:{headers:{}}});assert.equal(r.statusCode,402);assert.equal(c,0);});
test("valid payment verifies then settles after result",async()=>{const urls=[];const h=createPaidDomainExpirationHandler({publicApiBase:"https://example.test",service:{async check(){return{decision:"not_expiring_soon",sourceFailures:[],chargeable:true};}},fetchImpl:async url=>{urls.push(url);return url.endsWith("/verify")?response({isValid:true}):response({success:true,transaction:"0x011"});}});const r=await h({query:query(),event:{headers:{"payment-signature":sig()}}});assert.equal(r.statusCode,200);assert.deepEqual(urls.map(x=>x.split("/").pop()),["verify","settle"]);});
test("RDAP source failure does not settle",async()=>{const urls=[];const h=createPaidDomainExpirationHandler({publicApiBase:"https://example.test",service:{async check(){return{decision:"human_review",sourceFailures:[{source:"rdap",detail:"SOURCE_HTTP_ERROR"}],chargeable:false};}},fetchImpl:async url=>{urls.push(url);return response({isValid:true});}});const r=await h({query:query(),event:{headers:{"payment-signature":sig()}}});assert.equal(r.statusCode,502);assert.equal(urls.length,1);});
