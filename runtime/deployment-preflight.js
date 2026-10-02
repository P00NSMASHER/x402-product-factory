"use strict";

const {managedProducts}=require("../packages/discovery/generator");
const {hasContactEmail}=require("../packages/sources/sec-filings");

function validateEnv(name,value){
  if(typeof value!=="string"||!value.trim()){
    return {ok:false,reason:"missing"};
  }
  if(name==="SEC_USER_AGENT"&&!hasContactEmail(value)){
    return {ok:false,reason:"must_include_contact_email"};
  }
  return {ok:true,reason:null};
}

function checkDeploymentPrereqs(env={}){
  const missing=[];
  const checked=[];
  for(const product of managedProducts()){
    const required=Array.isArray(product.required_env)?product.required_env:[];
    for(const name of required){
      const result=validateEnv(name,env[name]);
      checked.push({productId:product.id,name,ok:result.ok,reason:result.reason});
      if(!result.ok){
        missing.push({
          productId:product.id,
          productNumber:product.number,
          name,
          reason:result.reason,
          requirement:Array.isArray(product.deployment_requirements)
            ? product.deployment_requirements.join("; ")
            : null
        });
      }
    }
  }
  return {
    ready:missing.length===0,
    stagedProductCount:managedProducts().length,
    checked,
    missing
  };
}

if(require.main===module){
  const result=checkDeploymentPrereqs(process.env);
  console.log(JSON.stringify(result,null,2));
  if(!result.ready) process.exitCode=2;
}

module.exports={validateEnv,checkDeploymentPrereqs};
