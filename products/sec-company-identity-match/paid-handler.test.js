"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {encodeHeader}=require("../../packages/x402/payment");
const {
  AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,
  productPaymentDocument,createPaidSecCompanyIdentityHandler
}=require("./paid-handler");

function response(body,status=200){
  return {status,ok:status>=200&&status<300,async json(){return body;}};
}
const sig=()=>encodeHeader({x402Version:2,payload:{signed:true}});
const query=()=>({company:"Apple",ticker:"AAPL"});

test("Product 013 terms are $0.003 / 3000 atomic",()=>{
  const d=productPaymentDocument("https://example.test");
  assert.equal(PRICE,"$0.003");
  assert.equal(AMOUNT_ATOMIC,"3000");
  assert.equal(d.resource.url,"https://example.test"+RESOURCE_PATH);
  assert.equal(d.accepts[0].amount,"3000");
});

test("unpaid request returns 402 without source work",async()=>{
  let calls=0;
  const h=createPaidSecCompanyIdentityHandler({
    publicApiBase:"https://example.test",
    service:{async check(){calls++;}},
    fetchImpl:async()=>response({})
  });
  const r=await h({query:query(),event:{headers:{}}});
  assert.equal(r.statusCode,402);
  assert.equal(calls,0);
});

test("invalid identity input is rejected before facilitator verification",async()=>{
  let network=0;
  const h=createPaidSecCompanyIdentityHandler({
    publicApiBase:"https://example.test",
    service:{async check(){throw new Error("should not run");}},
    fetchImpl:async()=>{network++;return response({});}
  });
  const r=await h({
    query:{company:"Apple",ticker:"AAPL",cik:"320193"},
    event:{headers:{"payment-signature":sig()}}
  });
  assert.equal(r.statusCode,400);
  assert.equal(network,0);
});

test("valid payment settles only after chargeable SEC identity result",async()=>{
  const urls=[];
  const h=createPaidSecCompanyIdentityHandler({
    publicApiBase:"https://example.test",
    service:{async check(){return{
      decision:"match",reasonCodes:[],sourceFailures:[],chargeable:true,
      company:{name:"Apple Inc.",cik:"0000320193"}
    };}},
    fetchImpl:async url=>{
      urls.push(url);
      if(url.endsWith("/verify"))return response({isValid:true});
      if(url.endsWith("/settle"))return response({success:true,transaction:"0x013"});
      throw new Error("unexpected");
    }
  });
  const r=await h({query:query(),event:{headers:{"payment-signature":sig()}}});
  assert.equal(r.statusCode,200);
  assert.deepEqual(urls.map(x=>x.split("/").pop()),["verify","settle"]);
  assert.equal(JSON.parse(r.body).paid,true);
  assert.equal(r.headers["x402-settled"],"true");
});

test("SEC source failure after verification never settles",async()=>{
  const urls=[];
  const h=createPaidSecCompanyIdentityHandler({
    publicApiBase:"https://example.test",
    service:{async check(){return{
      decision:"human_review",
      sourceFailures:[{source:"sec_edgar",detail:"SEC_USER_AGENT_REQUIRED"}],
      chargeable:false
    };}},
    fetchImpl:async url=>{urls.push(url);return response({isValid:true});}
  });
  const r=await h({query:query(),event:{headers:{"payment-signature":sig()}}});
  assert.equal(r.statusCode,502);
  assert.equal(urls.length,1);
  assert.ok(urls[0].endsWith("/verify"));
});
