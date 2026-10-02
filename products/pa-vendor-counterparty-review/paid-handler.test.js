"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {encodeHeader}=require("../../packages/x402/payment");
const {
  AMOUNT_ATOMIC,PRICE,RESOURCE_PATH,
  productPaymentDocument,createPaidCounterpartyReviewHandler
}=require("./paid-handler");

function response(body,status=200){
  return{status,ok:status>=200&&status<300,async json(){return body;}};
}
const sig=()=>encodeHeader({x402Version:2,payload:{signed:true}});
const query=()=>({
  company:"OpenAI OpCo",domain:"openai.com",minScore:"90",minDomainAgeDays:"90"
});

test("Product 018 terms are $0.010 / 10000 atomic",()=>{
  const d=productPaymentDocument("https://example.test");
  assert.equal(PRICE,"$0.010");
  assert.equal(AMOUNT_ATOMIC,"10000");
  assert.equal(d.resource.url,"https://example.test"+RESOURCE_PATH);
  assert.equal(d.accepts[0].amount,"10000");
});

test("unpaid request returns 402 without source work",async()=>{
  let calls=0;
  const h=createPaidCounterpartyReviewHandler({
    publicApiBase:"https://example.test",
    service:{async check(){calls++;return{};}},
    fetchImpl:async()=>response({})
  });
  const r=await h({query:query(),event:{headers:{}}});
  assert.equal(r.statusCode,402);assert.equal(calls,0);
});

test("invalid threshold is rejected before payment verification",async()=>{
  let network=0;
  const h=createPaidCounterpartyReviewHandler({
    publicApiBase:"https://example.test",
    service:{async check(){throw new Error("should not run");}},
    fetchImpl:async()=>{network++;return response({});}
  });
  const r=await h({
    query:{...query(),minScore:"101"},
    event:{headers:{"payment-signature":sig()}}
  });
  assert.equal(r.statusCode,400);assert.equal(network,0);
});

test("valid payment verifies, computes, settles, then returns paid result",async()=>{
  const urls=[];
  const h=createPaidCounterpartyReviewHandler({
    publicApiBase:"https://example.test",
    service:{async check(){return{
      decision:"proceed",reasonCodes:[],sourceFailures:[],chargeable:true,
      checkedAt:"2026-10-02T12:00:00.000Z"
    };}},
    fetchImpl:async url=>{
      urls.push(url);
      if(url.endsWith("/verify"))return response({isValid:true});
      if(url.endsWith("/settle"))return response({success:true,transaction:"0x018"});
      throw new Error("unexpected");
    }
  });
  const r=await h({query:query(),event:{headers:{"payment-signature":sig()}}});
  const body=JSON.parse(r.body);
  assert.equal(r.statusCode,200);
  assert.deepEqual(urls.map(x=>x.split("/").pop()),["verify","settle"]);
  assert.equal(body.paid,true);assert.equal(body.price,"$0.010");
  assert.equal(r.headers["x402-settled"],"true");
});

test("completed human-review evidence remains chargeable and settles",async()=>{
  const urls=[];
  const h=createPaidCounterpartyReviewHandler({
    publicApiBase:"https://example.test",
    service:{async check(){return{
      decision:"human_review",
      reasonCodes:["OFAC_CANDIDATE_REQUIRES_REVIEW"],
      sourceFailures:[],chargeable:true
    };}},
    fetchImpl:async url=>{
      urls.push(url);
      return url.endsWith("/verify")
        ?response({isValid:true})
        :response({success:true,transaction:"0x018b"});
    }
  });
  const r=await h({query:query(),event:{headers:{"payment-signature":sig()}}});
  assert.equal(r.statusCode,200);
  assert.equal(JSON.parse(r.body).decision,"human_review");
  assert.equal(urls.length,2);
});

test("source transport failure after verification never settles",async()=>{
  const urls=[];
  const h=createPaidCounterpartyReviewHandler({
    publicApiBase:"https://example.test",
    service:{async check(){return{
      decision:"human_review",
      sourceFailures:[{source:"ofac_sdn",detail:"SOURCE_TIMEOUT"}],
      chargeable:false
    };}},
    fetchImpl:async url=>{urls.push(url);return response({isValid:true});}
  });
  const r=await h({query:query(),event:{headers:{"payment-signature":sig()}}});
  assert.equal(r.statusCode,502);assert.equal(urls.length,1);assert.ok(urls[0].endsWith("/verify"));
});
