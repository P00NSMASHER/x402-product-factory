"use strict";

const fs=require("node:fs");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
const registry=require("../product-registry.json");

const REPO_ROOT=path.resolve(__dirname,"..");

function stagingProducts(){
  return registry.products.filter(product=>/staging$/.test(product.status));
}

function discoverReleaseGates(){
  return stagingProducts().map(product=>{
    if(typeof product.release_gate!=="string"||!product.release_gate.trim()){
      throw new Error(product.id+" staging product missing release_gate");
    }
    const file=path.resolve(REPO_ROOT,product.release_gate);
    if(!fs.existsSync(file)){
      throw new Error(product.id+" release gate does not exist: "+product.release_gate);
    }
    return {product,file,relative:product.release_gate};
  });
}

function runReleaseGates(gates=discoverReleaseGates()){
  const results=[];
  for(const gate of gates){
    process.stdout.write("\n=== RELEASE GATE "+gate.product.number+" "+gate.product.id+" ===\n");
    const child=spawnSync(process.execPath,[gate.file],{stdio:"inherit",env:process.env});
    const code=child.status==null?1:child.status;
    results.push({product:gate.product.id,gate:gate.relative,code});
    if(code!==0){
      const error=new Error("release gate failed: "+gate.product.id);
      error.code="RELEASE_GATE_FAILURE";
      error.results=results;
      throw error;
    }
  }
  return results;
}

function main(){
  const gates=discoverReleaseGates();
  if(gates.length===0) throw new Error("no staging release gates discovered");
  const results=runReleaseGates(gates);
  console.log(JSON.stringify({ok:true,releaseGates:results.length},null,2));
}

if(require.main===module) main();

module.exports={REPO_ROOT,stagingProducts,discoverReleaseGates,runReleaseGates};
