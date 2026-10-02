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
