"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {TREASURY_API,createTreasuryAverageRatesAdapter} = require("./treasury-average-rates");

function response(data, totalPages, next) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {data, meta: {"total-pages": totalPages}, links: {next}};
    }
  };
}
function row(date, security="Treasury Bills", rate="4.250") {
  return {record_date:date, security_type_desc:"Marketable",security_desc:security,avg_interest_rate_amt:rate};
}

test("historical Treasury lookup retrieves second month across the 300-row page boundary",async()=>{
  const calls=[];
  const first=[row("2026-09-30","Total Marketable","3.75"),...Array.from({length:299},()=>row("2026-09-30"))];
  const adapter=createTreasuryAverageRatesAdapter({fetchImpl:async url=>{
    calls.push(url);
    const parsed=new URL(url);
    assert.equal(parsed.origin,new URL(TREASURY_API).origin,"paginate only within official Treasury origin");
    assert.equal(parsed.pathname,new URL(TREASURY_API).pathname);
    const page=parsed.searchParams.get("page[number]")||"1";
    if(page==="1")return response(first,2,"https://attacker.invalid/steal");
    if(page==="2")return response([row("2026-08-31","Total Marketable","3.70")],2,null);
    throw new Error("unbounded page fetch "+page);
  }});
  const result=await adapter.history({security:"Total Marketable",points:2});
  assert.equal(calls.length,2);
  assert.deepEqual(result.points.map(x=>x.recordDate),["2026-09-30","2026-08-31"]);
  assert.deepEqual(result.points.map(x=>x.averageInterestRatePercent),[3.75,3.70]);
  assert.equal(result.found,true);
});

test("incomplete history refuses to present a partial answer when pagination budget is exhausted",async()=>{
  const calls=[];
  const first=[row("2026-09-30","Total Marketable"),...Array.from({length:299},()=>row("2026-09-30"))];
  const adapter=createTreasuryAverageRatesAdapter({fetchImpl:async url=>{
    calls.push(url);
    return response(first,20,"https://other.example/page");
  }});
  await assert.rejects(()=>adapter.history({security:"Total Marketable",points:2}),
    error=>error.code==="SOURCE_CONTRACT_INVALID");
  assert.equal(calls.length,5,"cap remote pagination at five source requests");
});

test("single complete page remains one request and does not invent missing months",async()=>{
  const calls=[];
  const adapter=createTreasuryAverageRatesAdapter({fetchImpl:async url=>{
    calls.push(url);
    return response([row("2026-09-30","Total Marketable")],1,null);
  }});
  const result=await adapter.history({security:"Total Marketable",points:2});
  assert.equal(calls.length,1);
  assert.equal(result.points.length,1,"true source absence is distinct from a truncated page");
});

test("two months on first page do not trigger unnecessary requests",async()=>{
  let calls=0;
  const adapter=createTreasuryAverageRatesAdapter({fetchImpl:async()=>{
    calls++;
    return response([row("2026-09-30","Total Marketable"),row("2026-08-31","Total Marketable")],3,"https://elsewhere.invalid");
  }});
  const result=await adapter.history({security:"Total Marketable",points:2});
  assert.equal(calls,1);
  assert.equal(result.points.length,2);
});
