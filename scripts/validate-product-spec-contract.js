"use strict";

// Shared fail-closed gate for compiler inputs. This is deliberately dependency-free
// and runs before either generator may create deployable artifacts.
const registry=require("../product-registry.json");

function invalid(message){
  const error=new Error("invalid product specification: "+message);
  error.code="PRODUCT_SPEC_CONTRACT_INVALID";
  throw error;
}

function must(condition,message){
  if(!condition)invalid(message);
}

function unique(seen,value,label){
  must(typeof value==="string"&&value.length>0,label+" is required");
  must(!seen.has(value),"duplicate "+label+": "+value);
  seen.add(value);
}

function validateSpecSet(specs,{filenames=null,productRegistry=registry}={}){
  must(Array.isArray(specs)&&specs.length>0,"at least one specification is required");
  if(filenames!==null)must(Array.isArray(filenames)&&filenames.length===specs.length,"filename count mismatch");
  must(Array.isArray(productRegistry?.products),"product registry missing");
  const byNumber=new Map(productRegistry.products.map(item=>[item.number,item]));
  const seenNumbers=new Set(),seenIds=new Set(),seenPaths=new Set(),seenOperations=new Set();
  const registryPaths=new Map();
  for(const item of productRegistry.products){
    must(typeof item.path==="string","registry product path missing");
    const previous=registryPaths.get(item.path);
    must(!previous||previous===item.number,"registry route collision: "+item.path);
    registryPaths.set(item.path,item.number);
  }

  for(let i=0;i<specs.length;i+=1){
    const spec=specs[i];
    must(spec&&typeof spec==="object"&&!Array.isArray(spec),"spec "+i+" must be an object");
    const number=spec.number,id=spec.id;
    must(spec.schema_version===1,"unsupported schema_version at "+i);
    must(/^\d{3}$/.test(number||""),"bad product number at "+i);
    must(/^[-a-z0-9]+$/.test(id||""),"bad product id for "+number);
    must(Number(number)<25,"Product 025+ demand freeze is active: "+number);
    unique(seenNumbers,number,"product number");
    unique(seenIds,id,"product id");
    if(filenames)must(filenames[i]===number+"-"+id+".json","filename does not match identity: "+filenames[i]);
    const canonical=byNumber.get(number);
    must(canonical,"unregistered product "+number);
    must(canonical.id===id,"registry id mismatch for "+number);

    const api=spec.api,discovery=spec.discovery,econ=spec.economics,launch=spec.launch;
    must(api&&discovery&&econ&&launch&&spec.implementation&&spec.decision,"missing contract sections for "+number);
    must(api.method==="GET"&&api.method===canonical.method,"unsupported/mismatched method for "+number);
    must(typeof api.path==="string"&&/^\/api\/[a-z0-9-]+$/.test(api.path),"unsafe route for "+number);
    must(api.path===canonical.path,"registry route mismatch for "+number);
    must(registryPaths.get(api.path)===number,"route owned by another product: "+api.path);
    unique(seenPaths,api.path,"route path");
    must(/^[A-Za-z][A-Za-z0-9]+$/.test(discovery.operation_id||""),"unsafe operation id for "+number);
    unique(seenOperations,discovery.operation_id,"operation id");
    must(Array.isArray(discovery.search_tags)&&discovery.search_tags.length>=1&&discovery.search_tags.length<=5,
      "search tag count outside Bazaar bounds for "+number);
    must(new Set(discovery.search_tags).size===discovery.search_tags.length,"duplicate search tag for "+number);

    must(/^\d+\.\d{3}$/.test(econ.price_usdc||""),"noncanonical USDC price for "+number);
    must(BigInt(econ.price_usdc.replace(".",""))>0n,"nonpositive USDC price for "+number);
    must(econ.price_usdc===canonical.price_usdc,"registry price mismatch for "+number);
    must(launch.current_status===canonical.status,"registry status mismatch for "+number);
    must(launch.release_gate===canonical.release_gate,"registry release gate mismatch for "+number);
    must(spec.implementation.handler_template==="standard-x402-get-v1","unsupported handler for "+number);
    must(spec.implementation.service_module==="products/"+id+"/service.js","unsafe service path for "+number);
    must(spec.decision.implementation==="products/"+id+"/decision.js","unsafe decision path for "+number);
    must(/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(spec.implementation.input_validator_export||""),
      "unsafe validator export for "+number);
    must(spec.failure_behavior?.automatic_reject===false,"automatic rejection is not allowed for "+number);
    must(Array.isArray(api.outputs?.decisions)&&api.outputs.decisions.length>0,"missing decisions for "+number);
    must(new Set(api.outputs.decisions).size===api.outputs.decisions.length,"duplicate decisions for "+number);
    must(Array.isArray(canonical.decision_values)&&
      api.outputs.decisions.length===canonical.decision_values.length&&
      api.outputs.decisions.every(v=>canonical.decision_values.includes(v)),
      "registry decision mismatch for "+number);

    must(Array.isArray(api.inputs)&&api.inputs.length>0,"missing inputs for "+number);
    const inputNames=new Set();
    for(const input of api.inputs){
      must(input&&/^[A-Za-z][A-Za-z0-9]*$/.test(input.name||""),"unsafe input name for "+number);
      unique(inputNames,input.name,"input name for "+number);
      must(["string","integer","number","boolean"].includes(input.type),"unsupported input type for "+number);
    }
    must(api.example_query&&typeof api.example_query==="object"&&!Array.isArray(api.example_query),
      "invalid example_query for "+number);
    for(const key of Object.keys(api.example_query)){
      must(inputNames.has(key),"undeclared example input "+key+" for "+number);
    }
    must(Array.isArray(spec.sources)&&spec.sources.length>0,"missing source evidence for "+number);
    const sources=new Set();
    for(const source of spec.sources)unique(sources,source?.id,"source id for "+number);
  }
  return specs;
}

module.exports={validateSpecSet};
