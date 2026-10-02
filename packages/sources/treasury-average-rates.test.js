"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {TREASURY_API,createTreasuryAverageRatesAdapter}=require("./treasury-average-rates");

function response(body,status=200){return{status,ok:status>=200&&status<300,async json(){return body;}};}

const rows=[
 {record_date:"2026-09-30",security_type_desc:"Marketable",security_desc:"Treasury Bills",avg_interest_rate_amt:"4.123"},
 {record_date:"2026-09-30",security_type_desc:"Marketable",security_desc:"Treasury Notes",avg_interest_rate_amt:"3.456"},
 {record_date:"2026-09-30",security_type_desc:"Marketable",security_desc:"Total Marketable",avg_interest_rate_amt:"3.789"},
 {record_date:"2026-08-31",security_type_desc:"Marketable",security_desc:"Total Marketable",avg_interest_rate_amt:"3.700"}
];

test("exact security match selects one latest-month rate",async()=>{
 const calls=[];
 const a=createTreasuryAverageRatesAdapter({fetchImpl:async url=>{calls.push(url);return response({data:rows});}});
 const r=await a.lookup({security:"Total Marketable"});
 assert.equal(calls.length,1);
 assert.ok(calls[0].startsWith(TREASURY_API));
 assert.equal(r.recordDate,"2026-09-30");
 assert.equal(r.matchCount,1);
 assert.equal(r.selected.averageInterestRatePercent,3.789);
});

test("substring with multiple matches is ambiguous",async()=>{
 const a=createTreasuryAverageRatesAdapter({fetchImpl:async()=>response({data:rows})});
 const r=await a.lookup({security:"Treasury"});
 assert.equal(r.matchCount,2);
 assert.equal(r.ambiguous,true);
 assert.equal(r.selected,null);
});

test("no match is completed found=false",async()=>{
 const a=createTreasuryAverageRatesAdapter({fetchImpl:async()=>response({data:rows})});
 const r=await a.lookup({security:"Nonexistent Security"});
 assert.equal(r.available,true);
 assert.equal(r.found,false);
 assert.equal(r.matchCount,0);
});

test("invalid numeric rate remains null rather than fabricated",async()=>{
 const a=createTreasuryAverageRatesAdapter({fetchImpl:async()=>response({data:[
  {record_date:"2026-09-30",security_type_desc:"Marketable",security_desc:"Total Marketable",avg_interest_rate_amt:"not-a-number"}
 ]})});
 const r=await a.lookup({security:"Total Marketable"});
 assert.equal(r.selected.averageInterestRatePercent,null);
});

test("Treasury transport failure throws source error",async()=>{
 const a=createTreasuryAverageRatesAdapter({fetchImpl:async()=>response({},503)});
 await assert.rejects(()=>a.lookup({security:"Total Marketable"}),e=>e.code==="SOURCE_HTTP_ERROR");
});


test("history returns newest distinct monthly points for one exact security", async () => {
  const adapter=createTreasuryAverageRatesAdapter({
    fetchImpl:async()=>response({
      data:[
        {record_date:"2026-08-31",security_type_desc:"Marketable",security_desc:"Total Marketable",avg_interest_rate_amt:"3.475"},
        {record_date:"2026-08-31",security_type_desc:"Nonmarketable",security_desc:"Total Nonmarketable",avg_interest_rate_amt:"3.200"},
        {record_date:"2026-07-31",security_type_desc:"Marketable",security_desc:"Total Marketable",avg_interest_rate_amt:"3.525"},
        {record_date:"2026-06-30",security_type_desc:"Marketable",security_desc:"Total Marketable",avg_interest_rate_amt:"3.600"}
      ]
    })
  });
  const result=await adapter.history({security:"Total Marketable",points:2});
  assert.equal(result.available,true);
  assert.equal(result.found,true);
  assert.equal(result.ambiguous,false);
  assert.deepEqual(result.points.map(p=>p.recordDate),["2026-08-31","2026-07-31"]);
  assert.deepEqual(result.points.map(p=>p.averageInterestRatePercent),[3.475,3.525]);
});

test("history fails closed on ambiguous contains query", async () => {
  const adapter=createTreasuryAverageRatesAdapter({
    fetchImpl:async()=>response({
      data:[
        {record_date:"2026-08-31",security_type_desc:"Marketable",security_desc:"Treasury Notes",avg_interest_rate_amt:"4.0"},
        {record_date:"2026-08-31",security_type_desc:"Marketable",security_desc:"Treasury Bonds",avg_interest_rate_amt:"4.5"},
        {record_date:"2026-07-31",security_type_desc:"Marketable",security_desc:"Treasury Notes",avg_interest_rate_amt:"4.1"},
        {record_date:"2026-07-31",security_type_desc:"Marketable",security_desc:"Treasury Bonds",avg_interest_rate_amt:"4.6"}
      ]
    })
  });
  const result=await adapter.history({security:"Treasury",points:2});
  assert.equal(result.found,true);
  assert.equal(result.ambiguous,true);
  assert.deepEqual(result.points,[]);
});

test("history validates requested point count", async () => {
  const adapter=createTreasuryAverageRatesAdapter({
    fetchImpl:async()=>response({data:[{record_date:"2026-08-31",security_desc:"Total Marketable",avg_interest_rate_amt:"3.4"}]})
  });
  await assert.rejects(
    ()=>adapter.history({security:"Total Marketable",points:1}),
    error=>error.code==="INVALID_INPUT"
  );
});

test("compare resolves two categories from one latest-month response", async () => {
  let calls=0;
  const adapter=createTreasuryAverageRatesAdapter({
    fetchImpl:async()=>{calls++;return response({data:rows});}
  });
  const result=await adapter.compare({
    leftSecurity:"Treasury Bills",
    rightSecurity:"Treasury Notes"
  });
  assert.equal(calls,1);
  assert.equal(result.recordDate,"2026-09-30");
  assert.equal(result.left.found,true);
  assert.equal(result.left.ambiguous,false);
  assert.equal(result.left.selected.averageInterestRatePercent,4.123);
  assert.equal(result.right.selected.averageInterestRatePercent,3.456);
});

test("compare reports ambiguous category without fabricating a selected row", async () => {
  const adapter=createTreasuryAverageRatesAdapter({
    fetchImpl:async()=>response({data:rows})
  });
  const result=await adapter.compare({
    leftSecurity:"Treasury",
    rightSecurity:"Total Marketable"
  });
  assert.equal(result.left.ambiguous,true);
  assert.equal(result.left.selected,null);
  assert.equal(result.right.selected.averageInterestRatePercent,3.789);
});

test("compare rejects identical categories", async () => {
  const adapter=createTreasuryAverageRatesAdapter({
    fetchImpl:async()=>response({data:rows})
  });
  await assert.rejects(
    ()=>adapter.compare({leftSecurity:"Treasury Bills",rightSecurity:"Treasury Bills"}),
    error=>error.code==="INVALID_INPUT"
  );
});
