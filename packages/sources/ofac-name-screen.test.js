"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {parseCsv,normalizeName,scoreName,createOfacNameAdapter}=require("./ofac-name-screen");
function response(text,status=200){return{status,ok:status>=200&&status<300,async text(){return text;}};}
test("CSV parser handles quoted commas",()=>assert.deepEqual(parseCsv('1,"DOE, JOHN",Individual\n'),[["1","DOE, JOHN","Individual"]]));
test("name normalization removes accents",()=>assert.equal(normalizeName("José García"),"JOSE GARCIA"));
test("exact score is 100",()=>assert.equal(scoreName("ACME LLC","ACME LLC"),100));
test("adapter screens aliases deterministically",async()=>{
 const sdn='1,"DOE, John",Individual,TEST,,,,,,,,remark\n2,"ACME HOLDINGS",Entity,TEST,,,,,,,,\n';
 const alt='1,,aka,"JOHN DOE",\n';
 const a=createOfacNameAdapter({fetchImpl:async url=>response(url.endsWith("SDN.CSV")?sdn:alt)});
 const r=await a.lookup({name:"JOHN DOE",minScore:90,limit:3});
 assert.equal(r.available,true);assert.equal(r.totalCandidatesAboveThreshold,1);assert.equal(r.candidates[0].matchedOn,"alias");assert.equal(r.candidates[0].score,100);
});
test("source failure throws SOURCE_HTTP_ERROR",async()=>{
 const a=createOfacNameAdapter({fetchImpl:async()=>response("",503)});
 await assert.rejects(()=>a.lookup({name:"Example",minScore:90}),(e)=>e.code==="SOURCE_HTTP_ERROR");
});


function sdnRow(name){return '1,"'+name+'",Individual,TEST,,,,,,,,remark\n';}

test("OFAC cache refreshes both list files at TTL instead of screening forever against a stale SDN list",async()=>{
 let now=0,sdnLoads=0,calls=0;
 const adapter=createOfacNameAdapter({
  cacheTtlMs:1000,nowMs:()=>now,
  fetchImpl:async url=>{
   calls++;
   if(url.endsWith("SDN.CSV"))return response(sdnRow(++sdnLoads===1?"BOB JONES":"ALICE SMITH"));
   return response("");
  }
 });
 assert.equal((await adapter.lookup({name:"ALICE SMITH",minScore:100})).totalCandidatesAboveThreshold,0);
 now=999;
 assert.equal((await adapter.lookup({name:"ALICE SMITH",minScore:100})).totalCandidatesAboveThreshold,0);
 assert.equal(calls,2,"fresh lookup must not redownload");
 now=1000;
 assert.equal((await adapter.lookup({name:"ALICE SMITH",minScore:100})).totalCandidatesAboveThreshold,1);
 assert.equal(calls,4,"expired cache must fetch SDN and ALT together");
});

test("concurrent OFAC lookups coalesce a single download and share a complete snapshot",async()=>{
 let calls=0;
 const adapter=createOfacNameAdapter({
  nowMs:()=>100,cacheTtlMs:1000,
  fetchImpl:async url=>{
   calls++;
   await new Promise(resolve=>setImmediate(resolve));
   return response(url.endsWith("SDN.CSV")?sdnRow("ALICE SMITH"):"");
  }
 });
 const results=await Promise.all(Array.from({length:12},()=>adapter.lookup({name:"ALICE SMITH",minScore:100})));
 assert.equal(calls,2,"each file must be downloaded once for concurrent lookups");
 assert.ok(results.every(r=>r.totalCandidatesAboveThreshold===1));
});

test("expired OFAC cache fails closed on HTTP error and retries without returning stale screening",async()=>{
 let now=0,failing=false,calls=0;
 const adapter=createOfacNameAdapter({
  nowMs:()=>now,cacheTtlMs:1000,
  fetchImpl:async url=>{
   calls++;
   if(failing&&url.endsWith("SDN.CSV"))return response("",503);
   return response(url.endsWith("SDN.CSV")?sdnRow(failing?"OLD PERSON":"ALICE SMITH"):"");
  }
 });
 assert.equal((await adapter.lookup({name:"ALICE SMITH",minScore:100})).totalCandidatesAboveThreshold,1);
 now=1000;failing=true;
 await assert.rejects(()=>adapter.lookup({name:"ALICE SMITH",minScore:100}),e=>e.code==="SOURCE_HTTP_ERROR");
 failing=false;
 assert.equal((await adapter.lookup({name:"ALICE SMITH",minScore:100})).totalCandidatesAboveThreshold,1);
 assert.equal(calls,6,"failed refresh must not poison later attempts");
});

test("an empty SDN response is never cached as a successful screening snapshot",async()=>{
 let empty=true,calls=0;
 const adapter=createOfacNameAdapter({
  nowMs:()=>0,cacheTtlMs:1000,
  fetchImpl:async url=>{
   calls++;
   return response(url.endsWith("SDN.CSV")?(empty?"":sdnRow("ALICE SMITH")):"");
  }
 });
 await assert.rejects(()=>adapter.lookup({name:"ALICE SMITH",minScore:100}),e=>e.code==="SOURCE_CONTRACT_INVALID");
 empty=false;
 assert.equal((await adapter.lookup({name:"ALICE SMITH",minScore:100})).totalCandidatesAboveThreshold,1);
 assert.equal(calls,4,"empty response must be retried, not cached forever");
});

test("OFAC cache age is bounded to one day and rejects invalid TTL settings",()=>{
 for(const ttl of [0,-1,999,86400001,NaN,Infinity,1.5]){
  assert.throws(()=>createOfacNameAdapter({cacheTtlMs:ttl}),e=>e.code==="INVALID_INPUT");
 }
});
