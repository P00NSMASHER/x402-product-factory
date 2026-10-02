"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {managedProducts}=require("../packages/discovery/generator");
const {createFactoryRuntime}=require("../runtime/create-runtime");
const {verifyLiveDeployment}=require("./verify-live-deployment");

function inertAdapters(){
  const never=async()=>{throw new Error("source should not run during unpaid deployment verification");};
  return {
    registry:{lookup:never},
    address:{compare:never},
    rdap:{lookup:never},
    sec:{lookup:never},
    treasury:{lookup:never,history:never,compare:never},
    ofac:{lookup:never}
  };
}

function runtimeFetch(runtime,{mutate}={}){
  let paymentHeaderRequests=0;
  let calls=0;

  const fetchImpl=async(url,init={})=>{
    calls+=1;
    const headers=init.headers||{};
    for(const [key,value] of Object.entries(headers)){
      if(key.toLowerCase()==="payment-signature"||key.toLowerCase()==="x-payment"){
        if(value)paymentHeaderRequests+=1;
      }
    }

    const parsed=new URL(url);
    const query=Object.fromEntries(parsed.searchParams.entries());
    const response=await runtime.handle({
      method:init.method||"GET",
      path:parsed.pathname,
      query,
      event:{headers}
    });
    let status=response.statusCode;
    let body=response.body;
    let responseHeaders={...(response.headers||{})};

    if(mutate){
      const changed=mutate({url:parsed,init,status,body,headers:responseHeaders});
      if(changed){
        status=changed.status??status;
        body=changed.body??body;
        responseHeaders=changed.headers??responseHeaders;
      }
    }

    const responseBody=[204,205,304].includes(status)?null:body;
    return new Response(responseBody,{status,headers:responseHeaders});
  };

  return {
    fetchImpl,
    stats:()=>({calls,paymentHeaderRequests})
  };
}

test("live verifier passes against the portable runtime without sending payment",async()=>{
  const base="https://candidate.example";
  const runtime=createFactoryRuntime({
    publicApiBase:base,
    adapters:inertAdapters(),
    fetchImpl:async()=>{throw new Error("facilitator/source network must not run");}
  });
  const transport=runtimeFetch(runtime);
  const result=await verifyLiveDeployment({base,fetchImpl:transport.fetchImpl});

  assert.equal(result.ok,true,JSON.stringify(result.problems,null,2));
  assert.equal(result.productCount,managedProducts().length);
  assert.deepEqual(result.problems,[]);
  assert.equal(transport.stats().paymentHeaderRequests,0);

  for(const product of result.observations.products){
    assert.equal(product.unpaid.status,402);
    assert.equal(product.unpaid.paymentRequiredHeaderValid,true);
    assert.equal(product.options.status,204);
  }
});

test("live verifier catches a wrong unpaid payTo",async()=>{
  const base="https://candidate.example";
  const runtime=createFactoryRuntime({
    publicApiBase:base,
    adapters:inertAdapters(),
    fetchImpl:async()=>{throw new Error("network must not run");}
  });

  let changed=false;
  const transport=runtimeFetch(runtime,{
    mutate({url,status,body,headers}){
      if(!changed&&status===402&&url.pathname.startsWith("/api/")){
        const json=JSON.parse(body);
        if(Array.isArray(json.accepts)&&json.accepts[0]){
          json.accepts[0].payTo="0x0000000000000000000000000000000000000001";
          changed=true;
          return {body:JSON.stringify(json),headers};
        }
      }
      return null;
    }
  });

  const result=await verifyLiveDeployment({base,fetchImpl:transport.fetchImpl});
  assert.equal(result.ok,false);
  assert.ok(result.problems.some(x=>x.startsWith("unpaid_payto:")));
  assert.equal(transport.stats().paymentHeaderRequests,0);
});

test("live verifier catches missing resource-level discovery accepts",async()=>{
  const base="https://candidate.example";
  const runtime=createFactoryRuntime({
    publicApiBase:base,
    adapters:inertAdapters(),
    fetchImpl:async()=>{throw new Error("network must not run");}
  });

  const transport=runtimeFetch(runtime,{
    mutate({url,status,body,headers}){
      if(url.pathname==="/.well-known/x402"&&status===200){
        const json=JSON.parse(body);
        json.resources[0].accepts=[];
        return {body:JSON.stringify(json),headers};
      }
      return null;
    }
  });

  const result=await verifyLiveDeployment({base,fetchImpl:transport.fetchImpl});
  assert.equal(result.ok,false);
  assert.ok(result.problems.some(x=>x.startsWith("catalog_accept_missing:")));
});
