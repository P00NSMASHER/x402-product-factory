"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {createAppDeployPublicAdapters}=require("./appdeploy-public");
const {createPaRegistryAdapter,createCensusAddressAdapter}=require("./live-pa-identity");

function response(body,status=200){
  return {ok:status>=200&&status<300,status,async json(){return body;}};
}

function paRows(){
  return [{
    business_name:"Example LLC",
    filing_number:"123",
    typeofbusinessregistration:"Limited Liability Company",
    address_line1:"100 Market St",
    address_line2:null,
    city:"Pottsville",
    state:"PA",
    zip:"17901",
    creationdate:"2020-01-01T00:00:00.000"
  }];
}

function censusRaw(){
  return {
    result:{
      addressMatches:[{
        matchedAddress:"100 MARKET ST, POTTSVILLE, PA, 17901",
        coordinates:{x:-76.19,y:40.68},
        geographies:{}
      }]
    }
  };
}

test("compatibility adapters now use only authoritative public sources",async()=>{
  const seen=[];
  const fetchImpl=async(url)=>{
    const value=String(url);
    seen.push(value);
    if(value.startsWith("https://data.pa.gov/")) return response(paRows());
    if(value.startsWith("https://geocoding.geo.census.gov/")) return response(censusRaw());
    if(value==="https://data.iana.org/rdap/dns.json"){
      return response({services:[[["com"],["https://rdap.example/"]]]});
    }
    if(value==="https://rdap.example/domain/example.com"){
      return response({
        events:[{eventAction:"registration",eventDate:"1995-08-14T00:00:00Z"}],
        entities:[]
      });
    }
    return response({},404);
  };

  const a=createAppDeployPublicAdapters({fetchImpl});
  const registry=await a.registry.lookup({company:"Example LLC"});
  assert.equal(registry.strongMatch,true);

  const address=await a.address.compare({
    suppliedAddress:"100 Market St, Pottsville, PA 17901",
    registryAddress:"100 Market St, Pottsville, PA, 17901"
  });
  assert.equal(address.sameStreetNumber,true);
  assert.equal(address.sameZip,true);
  assert.equal(address.distanceMiles,0);

  const rdap=await a.rdap.lookup({domain:"example.com"});
  assert.equal(rdap.available,true);
  assert.equal(rdap.registered,true);

  assert.ok(seen.some(url=>url.startsWith("https://data.pa.gov/")));
  assert.ok(seen.some(url=>url.startsWith("https://geocoding.geo.census.gov/")));
  assert.ok(seen.includes("https://data.iana.org/rdap/dns.json"));
  assert.ok(seen.includes("https://rdap.example/domain/example.com"));
  assert.equal(seen.some(url=>/api-v2\.appdeploy\.ai/.test(url)),false);
});

test("ambiguous strong registry candidates fail closed",async()=>{
  const rows=[
    {business_name:"Example LLC",filing_number:"1",typeofbusinessregistration:"LLC",address_line1:"1 A St",city:"Pottsville",state:"PA",zip:"17901"},
    {business_name:"Example Inc",filing_number:"2",typeofbusinessregistration:"Corporation",address_line1:"2 A St",city:"Pottsville",state:"PA",zip:"17901"}
  ];
  const a=createAppDeployPublicAdapters({fetchImpl:async()=>response(rows)});
  const registry=await a.registry.lookup({company:"Example"});
  assert.equal(registry.strongMatch,false);
  assert.equal(registry.strongCandidateCount,2);
});

test("source aborts normalize to SOURCE_TIMEOUT",async()=>{
  const aborted=new Error("aborted");
  aborted.name="AbortError";
  aborted.code=20;
  const adapter=createPaRegistryAdapter({
    fetchImpl:async()=>{throw aborted;},
    timeoutMs:1
  });
  await assert.rejects(
    ()=>adapter.lookup({company:"OpenAI OpCo"}),
    error=>error?.code==="SOURCE_TIMEOUT"&&error?.message==="source_timeout"
  );
});

test("incomplete Census contracts throw SOURCE_CONTRACT_INVALID",async()=>{
  const adapter=createCensusAddressAdapter({
    fetchImpl:async()=>response({result:{addressMatches:[{matchedAddress:null,coordinates:{x:-76.19,y:40.68}}]}})
  });
  await assert.rejects(
    ()=>adapter.compare({
      suppliedAddress:"100 Market St, Pottsville, PA 17901",
      registryAddress:"100 Market St, Pottsville, PA 17901"
    }),
    error=>error?.code==="SOURCE_CONTRACT_INVALID"&&error?.message==="census_contract_incomplete"
  );
});
