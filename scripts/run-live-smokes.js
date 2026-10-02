"use strict";

const fs=require("node:fs");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const registry=require("../product-registry.json");

const REPO_ROOT=path.resolve(__dirname,"..");

function stagingProducts(){
  return registry.products.filter(product=>/staging$/.test(String(product.status)));
}

function discoverLiveSmokes(){
  return stagingProducts().map(product=>{
    const relative="products/"+product.id+"/live-smoke.js";
    const file=path.resolve(REPO_ROOT,relative);
    if(!fs.existsSync(file)){
      throw new Error(product.id+" staging product missing live-smoke.js");
    }
    return {product,file,relative};
  });
}

function runLiveSmokes(smokes=discoverLiveSmokes()){
  const results=[];
  for(const smoke of smokes){
    process.stdout.write("\n=== LIVE SMOKE "+smoke.product.number+" "+smoke.product.id+" ===\n");
    const child=spawnSync(process.execPath,[smoke.file],{
      stdio:"inherit",
      env:process.env
    });
    const code=child.status==null?1:child.status;
    results.push({product:smoke.product.id,smoke:smoke.relative,code});
    if(code!==0){
      const error=new Error("live smoke failed: "+smoke.product.id);
      error.code="LIVE_SMOKE_FAILURE";
      error.results=results;
      throw error;
    }
  }
  return results;
}

function main(){
  const smokes=discoverLiveSmokes();
  if(smokes.length===0)throw new Error("no staging live smokes discovered");
  const results=runLiveSmokes(smokes);
  console.log(JSON.stringify({ok:true,liveSmokes:results.length},null,2));
}

if(require.main===module)main();

module.exports={REPO_ROOT,stagingProducts,discoverLiveSmokes,runLiveSmokes};
