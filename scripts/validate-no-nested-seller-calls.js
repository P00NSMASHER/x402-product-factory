"use strict";

const fs=require("node:fs");
const path=require("node:path");

const ROOT=path.resolve(__dirname,"..");
const SCAN_ROOTS=[
  path.join(ROOT,"packages","sources"),
  path.join(ROOT,"runtime"),
  path.join(ROOT,"products")
];

const FORBIDDEN=[
  {
    name:"nested_appdeploy_seller_call",
    pattern:/api-v2\.appdeploy\.ai\/app\//i,
    detail:"Factory implementation code must call authoritative sources directly, not another seller-owned AppDeploy paid/demo route."
  }
];

function walk(dir,out=[]){
  if(!fs.existsSync(dir))return out;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())walk(full,out);
    else if(entry.isFile()&&entry.name.endsWith(".js"))out.push(full);
  }
  return out;
}

function shouldScan(file){
  const name=path.basename(file);
  if(name.endsWith(".test.js"))return false;
  if(name==="live-smoke.js")return false;
  return true;
}

function validateNoNestedSellerCalls(){
  const violations=[];
  const scanned=[];
  for(const root of SCAN_ROOTS){
    for(const file of walk(root).filter(shouldScan)){
      const rel=path.relative(ROOT,file).replaceAll(path.sep,"/");
      const text=fs.readFileSync(file,"utf8");
      scanned.push(rel);
      for(const rule of FORBIDDEN){
        if(rule.pattern.test(text)){
          violations.push({file:rel,rule:rule.name,detail:rule.detail});
        }
      }
    }
  }
  return {ok:violations.length===0,scannedCount:scanned.length,violations};
}

if(require.main===module){
  const result=validateNoNestedSellerCalls();
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
}

module.exports={validateNoNestedSellerCalls};
