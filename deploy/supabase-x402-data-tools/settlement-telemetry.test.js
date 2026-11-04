"use strict";

// Executes the checked-in Supabase handler's real post-payment control flow
// with mocked facilitator/source boundaries and no network, Deno, or payments.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const SOURCE=fs.readFileSync(path.join(__dirname,"index.ts"),"utf8");
const START=SOURCE.indexOf("async function handlePaid(");
const END=SOURCE.indexOf("\nDeno.serve(",START);
assert.ok(START!==-1&&END>START,"Supabase handlePaid boundary must be discoverable");

const TYPED=SOURCE.slice(START,END);
const HANDLER=TYPED
  .replace(/async function handlePaid\(\s*request: Request,\s*url: URL,\s*base: string,\s*route: RouteDef,\s*\)/,
    "async function handlePaid(request,url,base,route)")
  .replace(/\blet (\w+): any;/g,"let $1;")
  .replace(/catch \(error: any\)/g,"catch (error)");
assert.ok(HANDLER.startsWith("async function handlePaid(request,url,base,route)"),
  "handler signature extraction must not silently drift");
assert.ok(!/\blet \w+: any;|catch \(error: any\)/.test(HANDLER),"unconverted TS annotation");

const TX="0x"+"A".repeat(64);
const PAYER="0x"+"B".repeat(40);
const SUCCESS_RECEIPT={success:true,transaction:TX,payer:PAYER,network:"eip155:8453"};

function harness({
  signature="signed-payment-secret",
  badHeader=false,
  verify={status:200,body:{isValid:true}},
  sourceResult={decision:"ok"},
  sourceError=null,
  settle={ok:true,receipt:SUCCESS_RECEIPT},
  throwOnLog=false
}={}){
  const events=[],calls={verify:0,source:0,settle:0,challenges:0};
  const mocks={
    console:{info(line){
      if(throwOnLog)throw new Error("log transport down");
      events.push(JSON.parse(line));
    }},
    NETWORK:"eip155:8453",
    PRICE:"$0.005",
    AMOUNT:"5000",
    decodePayment(value){
      if(badHeader)throw new Error("invalid_payment_header");
      return {signature:value};
    },
    facilitator:async(action)=>{
      assert.equal(action,"verify");
      calls.verify+=1;
      if(verify instanceof Error)throw verify;
      return verify;
    },
    settleSamePayment:async()=>{
      calls.settle+=1;
      return settle;
    },
    paymentRequired:()=>{
      calls.challenges+=1;
      return {status:402};
    },
    json:(body,status=200,headers={})=>({body,status,headers}),
    utf8ToB64:value=>Buffer.from(value,"utf8").toString("base64")
  };
  const handlePaid=vm.runInNewContext(HANDLER+"\nhandlePaid;",mocks,{timeout:1000});
  const request={headers:{get(name){
    return name==="payment-signature"?signature:null;
  }}};
  const route={
    path:"/api/domain-rdap",
    execute:async()=>{
      calls.source+=1;
      if(sourceError)throw sourceError;
      return sourceResult;
    }
  };
  const invoke=()=>handlePaid(
    request,
    new URL("https://seller.example/functions/v1/x402-data-tools/api/domain-rdap?private-input=not-for-logs"),
    "https://seller.example/functions/v1/x402-data-tools",
    route
  );
  return {invoke,events,calls};
}

test("only a successful verified and settled request emits telemetry",async()=>{
  const h=harness();
  const result=await h.invoke();
  assert.equal(result.status,200);
  assert.equal(result.body.paid,true);
  assert.equal(result.headers["x402-settled"],"true");
  assert.deepEqual(h.calls,{verify:1,source:1,settle:1,challenges:0});
  assert.equal(h.events.length,1);
  const event=h.events[0];
  assert.equal(event.event,"x402_settlement_succeeded");
  assert.equal(event.schema_version,2);
  assert.equal(event.route,"/api/domain-rdap");
  assert.equal(event.product_id,"domain-rdap");
  assert.equal(event.listed_price_usdc,"0.005");
  assert.equal(event.expected_amount_atomic_usdc,"5000");
  assert.equal(Object.hasOwn(event,"amount_usd"),false);
  assert.equal(event.network,"eip155:8453");
  assert.equal(event.transaction,TX.toLowerCase());
  assert.equal(event.payer,PAYER.toLowerCase());
  assert.equal(event.evidence_source,"facilitator_settle_response");
  assert.equal(event.onchain_verified,false);
  assert.equal(event.external_buyer_verified,false);
  assert.equal(event.eligible_for_revenue_scoreboard,false);
  assert.ok(!Number.isNaN(Date.parse(event.settled_at)));
  const logged=JSON.stringify(event);
  assert.ok(!logged.includes("signed-payment-secret"));
  assert.ok(!logged.includes("private-input"));
});

test("missing or malformed authorization returns a challenge with no log",async()=>{
  for(const options of [{signature:null},{badHeader:true}]){
    const h=harness(options);
    const result=await h.invoke();
    assert.equal(result.status,402);
    assert.equal(h.events.length,0);
    assert.equal(h.calls.source,0);
    assert.equal(h.calls.settle,0);
  }
});

test("verification failure and outage do not log a settlement",async()=>{
  for(const verify of [
    {status:200,body:{isValid:false,invalidReason:"invalid"}},
    new Error("facilitator timed out")
  ]){
    const h=harness({verify});
    const result=await h.invoke();
    assert.ok([402,503].includes(result.status));
    assert.equal(h.events.length,0);
    assert.equal(h.calls.source,0);
    assert.equal(h.calls.settle,0);
  }
});

test("source failure cannot generate a settled event",async()=>{
  const h=harness({sourceError:Object.assign(new Error("source unavailable"),{status:502})});
  const result=await h.invoke();
  assert.equal(result.status,502);
  assert.equal(result.body.chargeable,false);
  assert.equal(h.events.length,0);
  assert.equal(h.calls.settle,0);
});

test("terminal or unresolved settlement never counts as success",async()=>{
  for(const settle of [
    {ok:false,terminal:true,reason:"invalid_payment"},
    {ok:false,terminal:false,reason:"settlement_unknown"}
  ]){
    const h=harness({settle});
    const result=await h.invoke();
    assert.ok([402,503].includes(result.status));
    assert.equal(h.events.length,0);
    assert.equal(h.calls.settle,1);
  }
});

test("receipt fields are fail-closed when malformed or on another network",async()=>{
  const h=harness({settle:{
    ok:true,
    receipt:{success:true,transaction:"not-a-hash",payer:"bad-wallet",network:"eip155:1"}
  }});
  assert.equal((await h.invoke()).status,200);
  assert.equal(h.events.length,1);
  assert.equal(h.events[0].transaction,null);
  assert.equal(h.events[0].payer,null);
  assert.equal(h.events[0].network,null);
  assert.equal(h.events[0].eligible_for_revenue_scoreboard,false);
});

test("telemetry transport failure cannot turn a paid 200 into HTTP 500",async()=>{
  const h=harness({throwOnLog:true});
  const response=await h.invoke();
  assert.equal(response.status,200);
  assert.equal(response.body.paid,true);
  assert.equal(response.headers["x402-settled"],"true");
  assert.equal(h.calls.settle,1);
});
