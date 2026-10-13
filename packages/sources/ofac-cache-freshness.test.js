"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {
  OFAC_BASE,DEFAULT_OFAC_CACHE_TTL_MS,MAX_OFAC_CACHE_TTL_MS,
  createOfacNameAdapter
}=require("./ofac-name-screen");

const T0=Date.parse("2026-10-12T12:00:00.000Z");
const SDN_ONE="100,EXAMPLE COMPANY,Entity,TEST,,,,,,,,\n";
const SDN_TWO="200,SECOND COMPANY,Entity,TEST,,,,,,,,\n";
const SDN_OTHER="300,OTHER COMPANY,Entity,TEST,,,,,,,,\n";
const ALT_ONE="100,,aka,EXAMPLE ALIAS,\n";
function response(contents,status=200){
  return {status,ok:status>=200&&status<300,async text(){return contents}};
}
function fixtureSource(initial=SDN_ONE){
  const events=[],state={sdn:initial,alt:ALT_ONE,failSdn:false,failAlt:false};
  const fetchImpl=async (url)=>{
    const type=String(url).endsWith("/SDN.CSV")?"SDN":
      String(url).endsWith("/ALT.CSV")?"ALT":"UNKNOWN";
    events.push(type);
    if(type==="UNKNOWN")throw new Error("unapproved fixture source");
    return response(type==="SDN"?state.sdn:state.alt,
      type==="SDN"&&state.failSdn||type==="ALT"&&state.failAlt?503:200);
  };
  return {state,events,fetchImpl};
}
function adapter(source,clock,ttl=1000){
  return createOfacNameAdapter({
    fetchImpl:source.fetchImpl,now:()=>clock.ms,cacheTtlMs:ttl
  });
}
test("one-hour default, six-hour maximum and bounded cache configuration",()=>{
  assert.equal(DEFAULT_OFAC_CACHE_TTL_MS,3600000);
  assert.equal(MAX_OFAC_CACHE_TTL_MS,21600000);
  for(const cacheTtlMs of [-1,0,1.25,Infinity,MAX_OFAC_CACHE_TTL_MS+1]){
    assert.throws(()=>createOfacNameAdapter({cacheTtlMs}),
      e=>e.code==="ADAPTER_CONTRACT_INVALID");
  }
  assert.throws(()=>createOfacNameAdapter({now:Date.now()}),
    e=>e.code==="ADAPTER_CONTRACT_INVALID");
});
test("lookup preserves primary and alias matching with measurable local cache age",async()=>{
  const source=fixtureSource(),clock={ms:T0},a=adapter(source,clock);
  const first=await a.lookup({name:"EXAMPLE ALIAS",minScore:90,limit:3});
  assert.equal(first.available,true);
  assert.equal(first.candidates.length,1);
  assert.equal(first.candidates[0].matchedOn,"alias");
  assert.equal(first.candidates[0].score,100);
  assert.deepEqual(first.provenance.files,["SDN.CSV","ALT.CSV"]);
  assert.equal(first.provenance.localDatasetRetrievedAtUtc,
    "2026-10-12T12:00:00.000Z");
  assert.equal(first.provenance.localDatasetCacheAgeMs,0);
  assert.equal(first.provenance.providerPublicationVerified,false);
  clock.ms+=500;
  const second=await a.lookup({name:"EXAMPLE COMPANY",minScore:90});
  assert.equal(second.candidates[0].matchedOn,"primary");
  assert.equal(second.provenance.localDatasetCacheAgeMs,500);
  assert.deepEqual(source.events,["SDN","ALT"]);
  assert.equal(first.totalCandidatesAboveThreshold,1);
});
test("cache TTL forces atomic SDN and ALT reload at the exact expiry boundary",async()=>{
  const source=fixtureSource(),clock={ms:T0},a=adapter(source,clock);
  assert.equal((await a.lookup({name:"SECOND COMPANY"})).totalCandidatesAboveThreshold,0);
  source.state.sdn=SDN_TWO;
  source.state.alt="";
  clock.ms+=999;
  assert.equal((await a.lookup({name:"SECOND COMPANY"})).totalCandidatesAboveThreshold,0);
  assert.deepEqual(source.events,["SDN","ALT"]);
  clock.ms+=1;
  const updated=await a.lookup({name:"SECOND COMPANY"});
  assert.equal(updated.totalCandidatesAboveThreshold,1);
  assert.equal(updated.provenance.localDatasetRetrievedAtUtc,
    "2026-10-12T12:00:01.000Z");
  assert.deepEqual(source.events,["SDN","ALT","SDN","ALT"]);
});
test("upstream failure after expiration refuses the old valid snapshot and recovers on retry",async()=>{
  const source=fixtureSource(),clock={ms:T0},a=adapter(source,clock);
  assert.equal((await a.lookup({name:"EXAMPLE COMPANY"})).totalCandidatesAboveThreshold,1);
  clock.ms+=1000;
  source.state.failAlt=true;
  await assert.rejects(()=>a.lookup({name:"EXAMPLE COMPANY"}),
    err=>err.code==="SOURCE_HTTP_ERROR");
  assert.equal(source.events.length,4);
  source.state.failAlt=false;
  source.state.sdn=SDN_TWO;
  source.state.alt="";
  const recovered=await a.lookup({name:"SECOND COMPANY"});
  assert.equal(recovered.totalCandidatesAboveThreshold,1);
  assert.deepEqual(source.events,["SDN","ALT","SDN","ALT","SDN","ALT"]);
});
test("an empty initial SDN response never becomes a successful cached negative screen",async()=>{
  const source=fixtureSource(""),clock={ms:T0},a=adapter(source,clock);
  source.state.alt="";
  await assert.rejects(()=>a.lookup({name:"EXAMPLE COMPANY"}),
    e=>e.code==="SOURCE_CONTRACT_INVALID");
  source.state.sdn=SDN_ONE;
  source.state.alt=ALT_ONE;
  const after=await a.lookup({name:"EXAMPLE COMPANY"});
  assert.equal(after.totalCandidatesAboveThreshold,1);
  assert.equal(source.events.length,4);
});
test("a zero-record refresh invalidates prior data, no stale fallback is permitted",async()=>{
  const source=fixtureSource(),clock={ms:T0},a=adapter(source,clock);
  assert.equal((await a.lookup({name:"EXAMPLE COMPANY"})).totalCandidatesAboveThreshold,1);
  clock.ms+=1000;
  source.state.sdn="";source.state.alt="";
  await assert.rejects(()=>a.lookup({name:"EXAMPLE COMPANY"}),
    e=>e.code==="SOURCE_CONTRACT_INVALID");
  source.state.sdn=SDN_OTHER;
  const third=await a.lookup({name:"OTHER COMPANY"});
  assert.equal(third.totalCandidatesAboveThreshold,1);
  assert.equal(source.events.length,6);
});
test("concurrent cache misses and expired refreshes make one pair of OFAC fetches",async()=>{
  const clock={ms:T0},events=[];
  let release=null;
  const gate=new Promise(resolve=>{release=resolve});
  let hold=false;
  const fetchImpl=async url=>{
    const kind=String(url).endsWith("/SDN.CSV")?"SDN":"ALT";
    events.push(kind);
    if(hold)await gate;
    return response(kind==="SDN"?SDN_ONE:ALT_ONE);
  };
  const a=createOfacNameAdapter({fetchImpl,now:()=>clock.ms,cacheTtlMs:1000});
  const initial=await Promise.all([
    a.lookup({name:"EXAMPLE COMPANY"}),
    a.lookup({name:"EXAMPLE ALIAS"}),
    a.lookup({name:"EXAMPLE COMPANY"})
  ]);
  assert.equal(initial.length,3);
  assert.deepEqual(events,["SDN","ALT"]);
  clock.ms+=1000;hold=true;
  const waiting=[
    a.lookup({name:"EXAMPLE COMPANY"}),
    a.lookup({name:"EXAMPLE ALIAS"}),
    a.lookup({name:"EXAMPLE COMPANY"})
  ];
  await Promise.resolve();
  assert.deepEqual(events,["SDN","ALT","SDN","ALT"]);
  release();
  const result=await Promise.all(waiting);
  assert.equal(result.length,3);
  assert.equal(events.length,4);
});
test("a backward or invalid source clock never approves evidence from the last dataset",async()=>{
  const source=fixtureSource(),clock={ms:T0},a=adapter(source,clock);
  await a.lookup({name:"EXAMPLE COMPANY"});
  clock.ms=T0-1;
  await assert.rejects(()=>a.lookup({name:"EXAMPLE COMPANY"}),
    e=>e.code==="SOURCE_CONTRACT_INVALID");
  clock.ms=Infinity;
  await assert.rejects(()=>a.lookup({name:"EXAMPLE COMPANY"}),
    e=>e.code==="SOURCE_CONTRACT_INVALID");
  clock.ms=T0+3000;
  assert.equal((await a.lookup({name:"EXAMPLE COMPANY"})).totalCandidatesAboveThreshold,1);
});
test("expiry during scoring refuses a too-old response rather than claiming fresh screening",async()=>{
  const source=fixtureSource(),clock={ms:T0},a=adapter(source,clock);
  await a.lookup({name:"EXAMPLE COMPANY"});
  // One call to load() sees a valid snapshot; a later call to clock() sees
  // it expire while the response is assembled.
  let reads=0;
  const rapid=createOfacNameAdapter({
    fetchImpl:source.fetchImpl,cacheTtlMs:100,
    now:()=>T0+(++reads===3?101:reads>3?101:0)
  });
  await assert.rejects(()=>rapid.lookup({name:"EXAMPLE COMPANY"}),
    e=>e.code==="SOURCE_CONTRACT_INVALID");
  assert.equal(source.events.length,4);
});
