"use strict";

const fs=require("node:fs");
const path=require("node:path");
const {buildDeploymentBundle}=require("../packages/discovery/bundle");

function writeDeploymentBundle({base,outputDir}){
  if(typeof base!=="string"||!/^https:\/\//.test(base))throw new TypeError("https base URL is required");
  const dir=path.resolve(outputDir||"dist");
  fs.mkdirSync(dir,{recursive:true});
  const bundle=buildDeploymentBundle(base);
  for(const [name,content] of Object.entries(bundle.files)){
    fs.writeFileSync(path.join(dir,name),content,"utf8");
  }
  return {
    outputDir:dir,
    productCount:bundle.products.length,
    files:Object.keys(bundle.files).sort(),
    manifest:JSON.parse(bundle.files["bundle-manifest.json"])
  };
}

if(require.main===module){
  const base=process.argv[2];
  const outputDir=process.argv[3]||"dist";
  const result=writeDeploymentBundle({base,outputDir});
  console.log(JSON.stringify(result,null,2));
}

module.exports={writeDeploymentBundle};
