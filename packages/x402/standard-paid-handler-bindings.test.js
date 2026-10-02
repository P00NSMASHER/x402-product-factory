"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const realPayment=require("./payment");
const {PRODUCTS}=require("../../generated/spec-metadata");
const {
  BINDINGS,
  serviceFactory,
  validator,
  createPaidHandler
}=require("../../generated/spec-runtime-bindings");
const {check:checkRuntimeBindings}=require("../../scripts/generate-spec-runtime-bindings");

const IDS=[
  "pa-vendor-identity-match",
  "pa-business-address-match",
  "pa-business-domain-match",
  "sec-filing-freshness",
  "domain-registration-age"
];

const signature=realPayment.encodeHeader({x402Version:2,payload:{test:true}});

function serviceDouble(){
  let calls=0;
  return {
    service:{
      async check(){
        calls+=1;
        throw new Error("service should not be reached in binding contract tests");
      }
    },
    calls:()=>calls
  };
}

function noVerifyPayment(){
  return {
    ...realPayment,
    async verifyPayment(){
      throw new Error("verification should not be reached");
    },
    async settleSamePayment(){
      throw new Error("settlement should not be reached");
    }
  };
}

function stopAfterValidationPayment(onVerify){
  return {
    ...realPayment,
    async verifyPayment(args){
      onVerify(args);
      return {kind:"unresolved",reason:"stop_after_validation"};
    },
    async settleSamePayment(){
      throw new Error("settlement should not be reached");
    }
  };
}

test("generated runtime bindings are current and resolve all five factories",()=>{
  assert.doesNotThrow(()=>checkRuntimeBindings());
  assert.deepEqual(Object.keys(BINDINGS),IDS);
  for(const id of IDS){
    assert.equal(BINDINGS[id].paid_handler_template,"standard_get_v1");
    assert.equal(typeof serviceFactory(id),"function");
    assert.equal(typeof validator(id),"function");
  }
});

test("all generated paid wrappers emit the spec-driven unpaid 402 without source work",async()=>{
  for(const id of IDS){
    const product=PRODUCTS[id];
    const fake=serviceDouble();
    const handler=createPaidHandler(id,{
      service:fake.service,
      publicApiBase:"https://candidate.example"
    });
    const response=await handler({query:product.example_query});
    assert.equal(response.statusCode,402,id);
    assert.equal(fake.calls(),0,id);
    assert.equal(response.headers["x402-price"],"$"+product.price_usdc,id);

    const document=JSON.parse(
      Buffer.from(response.headers["PAYMENT-REQUIRED"],"base64").toString("utf8")
    );
    assert.equal(document.resource.url,"https://candidate.example"+product.path,id);
    assert.equal(document.resource.serviceName,product.service_name,id);
    assert.equal(document.resource.description,product.resource_description,id);
    assert.deepEqual(document.resource.tags,product.search_tags,id);
    assert.equal(document.accepts[0].amount,product.amount_atomic_usdc,id);
    assert.equal(document.accepts[0].network,"eip155:8453",id);
    assert.equal(document.accepts[0].asset,"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",id);
  }
});

test("all generated wrappers reject empty input before payment verification",async()=>{
  for(const id of IDS){
    const fake=serviceDouble();
    const handler=createPaidHandler(id,{
      service:fake.service,
      publicApiBase:"https://candidate.example",
      payment:noVerifyPayment()
    });
    const response=await handler({
      query:{},
      event:{headers:{"PAYMENT-SIGNATURE":signature}}
    });
    assert.equal(response.statusCode,400,id);
    assert.equal(JSON.parse(response.body).error,"invalid_request",id);
    assert.equal(fake.calls(),0,id);
  }
});

test("all spec example queries pass their real validators before verification",async()=>{
  for(const id of IDS){
    const product=PRODUCTS[id];
    const fake=serviceDouble();
    let verifyCalls=0;
    const handler=createPaidHandler(id,{
      service:fake.service,
      publicApiBase:"https://candidate.example",
      payment:stopAfterValidationPayment(()=>{verifyCalls+=1;})
    });
    const response=await handler({
      query:product.example_query,
      event:{headers:{"PAYMENT-SIGNATURE":signature}}
    });
    assert.equal(response.statusCode,503,id);
    assert.equal(JSON.parse(response.body).error,"stop_after_validation",id);
    assert.equal(verifyCalls,1,id);
    assert.equal(fake.calls(),0,id);
  }
});
