"use strict";

const fs=require("node:fs");
const path=require("node:path");

const ROOT=path.resolve(__dirname,"..");
const SPEC_DIR=path.join(ROOT,"specs");
const OUT=path.join(ROOT,"generated","product-spec-index.json");

function discoverSpecFiles(){
  return fs.readdirSync(SPEC_DIR)
    .filter(name=>/^\d{3}-.+\.json$/.test(name))
    .sort();
}

function loadSpecs(){
  return discoverSpecFiles().map(name=>
    JSON.parse(fs.readFileSync(path.join(SPEC_DIR,name),"utf8"))
  );
}

function buildIndex(specs=loadSpecs()){
  return {
    schema_version:1,
    products:specs.map(spec=>({
      number:spec.number,
      id:spec.id,
      buyer_task:spec.buyer.task,
      operation_id:spec.discovery.operation_id,
      service_name:spec.discovery.service_name,
      search_tags:spec.discovery.search_tags,
      method:spec.api.method,
      path:spec.api.path,
      price_usdc:spec.economics.price_usdc,
      decisions:spec.api.outputs.decisions,
      source_ids:spec.sources.map(source=>source.id),
      decision_implementation:spec.decision.implementation,
      decision_parameters:spec.decision.parameters,
      failure_behavior:spec.failure_behavior,
      launch:{
        current_status:spec.launch.current_status,
        release_gate:spec.launch.release_gate
      }
    }))
  };
}

function serialize(index=buildIndex()){
  return JSON.stringify(index,null,2)+"\n";
}

function write(){
  const content=serialize();
  fs.mkdirSync(path.dirname(OUT),{recursive:true});
  fs.writeFileSync(OUT,content,"utf8");
  return content;
}

function check(){
  const expected=serialize();
  const actual=fs.existsSync(OUT)?fs.readFileSync(OUT,"utf8"):"";
  if(actual!==expected){
    const error=new Error("generated product spec index is stale; run node scripts/generate-product-spec-index.js");
    error.code="GENERATED_SPEC_INDEX_STALE";
    throw error;
  }
  return expected;
}

function main(){
  const mode=process.argv.includes("--check")?"check":"write";
  const content=mode==="check"?check():write();
  console.log(JSON.stringify({ok:true,mode,products:buildIndex().products.length,bytes:Buffer.byteLength(content)},null,2));
}

if(require.main===module)main();

module.exports={ROOT,SPEC_DIR,OUT,discoverSpecFiles,loadSpecs,buildIndex,serialize,write,check};
