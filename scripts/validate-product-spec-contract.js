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


function moneyMicros(value,label){
  must(typeof value==="string"&&/^\d{1,12}\.\d{6}$/.test(value),
    label+" must use nonnegative six-place USD");
  const [whole,fraction]=value.split(".");
  return BigInt(whole)*1000000n+BigInt(fraction);
}

// Source specifications are not evidence of measured buyer demand or paid hosting.
function validateCommercialClaims(spec,number){
  const frequency=spec.buyer?.expected_purchase_frequency;
  must(frequency&&frequency.status==="unmeasured"&&frequency.value===null&&
    frequency.unit===null&&typeof frequency.measurement_plan==="string"&&
    frequency.measurement_plan.length>=10,
    "purchase frequency cannot claim verified demand for "+number);
  const econ=spec.economics;
  must(econ.incremental_hosting_cost_usd===null,
    "hosting cost must remain unknown without billing evidence for "+number);
  const price=BigInt(econ.price_usdc.replace(".",""))*1000n;
  const fee=moneyMicros(econ.paid_settlement_cost_usd,"settlement cost for "+number);
  const source=moneyMicros(econ.configured_direct_source_fee_usd,"source fee for "+number);
  const target=econ.target_contribution_margin_pct;
  must(typeof target==="number"&&Number.isFinite(target)&&target>=0&&
    target<=100&&Number.isInteger(target*1000),
    "invalid margin target for "+number);
  const expected=Number((price-fee-source)*1000n/price)/10;
  must(typeof econ.post_allowance_margin_floor_pct==="number"&&
    econ.post_allowance_margin_floor_pct===expected,
    "post-allowance margin floor mismatch for "+number);
  const meets=(price-fee-source)*100000n>=price*BigInt(target*1000);
  must(econ.meets_target_before_unknown_costs===meets,
    "margin-target claim inconsistent with costs for "+number);
}

function validateInputExamples(api,number){
  const allowed=new Set([
    "name","type","required","minLength","maxLength","pattern",
    "minimum","maximum","default","comparison","enum"
  ]);
  const grouped=[];
  for(const input of api.inputs){
    must(Object.keys(input).every(k=>allowed.has(k)),
      "unexpected input descriptor for "+number);
    const group=input.required==="exactly_one_of_ticker_or_cik";
    must(typeof input.required==="boolean"||group,
      "invalid input required flag for "+number);
    if(group)grouped.push(input.name);
    for(const key of ["minLength","maxLength"]){
      if(Object.hasOwn(input,key)){
        must(input.type==="string"&&Number.isSafeInteger(input[key])&&
          input[key]>=0&&input[key]<=4096,
          "invalid string bound for "+number);
      }
    }
    if(input.minLength!==undefined&&input.maxLength!==undefined){
      must(input.minLength<=input.maxLength,"inverted string bounds for "+number);
    }
    if(input.pattern!==undefined){
      must(input.type==="string"&&typeof input.pattern==="string"&&
        input.pattern.length>=3&&input.pattern.length<=160&&
        input.pattern.startsWith("^")&&input.pattern.endsWith("$"),
        "unsafe input pattern for "+number);
      try{new RegExp(input.pattern);}catch{invalid("invalid input pattern for "+number);}
    }
    for(const key of ["minimum","maximum"]){
      if(Object.hasOwn(input,key)){
        must(["integer","number"].includes(input.type)&&
          typeof input[key]==="number"&&Number.isFinite(input[key])&&
          (input.type!=="integer"||Number.isSafeInteger(input[key])),
          "invalid numeric bound for "+number);
      }
    }
    if(input.minimum!==undefined&&input.maximum!==undefined){
      must(input.minimum<=input.maximum,"inverted numeric bounds for "+number);
    }
    if(input.enum!==undefined){
      must(input.type==="string"&&Array.isArray(input.enum)&&input.enum.length>=1&&
        input.enum.length<=20&&input.enum.every(v=>typeof v==="string"&&v.length>=1&&v.length<=128)&&
        new Set(input.enum).size===input.enum.length,
        "invalid enum for "+number);
    }
    if(input.comparison!==undefined){
      must(input.type==="string"&&input.comparison==="exact_case_normalized",
        "unsupported comparison rule for "+number);
    }
    const checkValue=(value,kind)=>{
      if(input.type==="string"){
        must(typeof value==="string"&&
          (input.minLength===undefined||value.length>=input.minLength)&&
          (input.maxLength===undefined||value.length<=input.maxLength)&&
          (input.pattern===undefined||new RegExp(input.pattern).test(value)),
          kind+" violates string input constraint for "+number);
      }else if(input.type==="integer"||input.type==="number"){
        must(typeof value==="number"&&Number.isFinite(value)&&
          (input.type!=="integer"||Number.isSafeInteger(value))&&
          (input.minimum===undefined||value>=input.minimum)&&
          (input.maximum===undefined||value<=input.maximum),
          kind+" violates numeric input constraint for "+number);
      }else if(input.type==="boolean"){
        must(typeof value==="boolean",kind+" must be boolean for "+number);
      }
      if(input.enum!==undefined){
        must(input.enum.includes(value),kind+" violates enum for "+number);
      }
    };
    if(Object.hasOwn(input,"default"))checkValue(input.default,"default");
    if(Object.hasOwn(api.example_query,input.name)){
      checkValue(api.example_query[input.name],"example");
    }else if(input.required===true){
      invalid("required example input missing for "+number+": "+input.name);
    }
    if(Object.hasOwn(api.openapi_parameter_examples||{},input.name)){
      const value=api.openapi_parameter_examples[input.name];
      checkValue(value,"OpenAPI parameter example");
      if(Object.hasOwn(api.example_query,input.name)){
        must(api.example_query[input.name]===value,
          "OpenAPI parameter example must match request example for "+number);
      }
    }
  }
  if(api.openapi_parameter_examples!==undefined){
    const examples=api.openapi_parameter_examples;
    must(examples&&typeof examples==="object"&&!Array.isArray(examples) &&
      Object.keys(examples).length>0,
      "invalid OpenAPI parameter examples for "+number);
    const declared=new Set(api.inputs.map(input=>input.name));
    for(const name of Object.keys(examples)){
      must(declared.has(name),"undeclared OpenAPI parameter example for "+number);
    }
  }
  if(api.payment_example_query!==undefined){
    const payment=api.payment_example_query;
    must(payment&&typeof payment==="object"&&!Array.isArray(payment),
      "invalid payment example query for "+number);
    const byName=new Map(api.inputs.map(input=>[input.name,input]));
    for(const [name,value] of Object.entries(payment)){
      const input=byName.get(name);
      must(input,"undeclared payment example input for "+number);
      must(["string","number","boolean"].includes(typeof value),
        "invalid payment example value for "+number);
      if(Object.hasOwn(api.example_query,name)){
        must(String(api.example_query[name])===String(value),
          "payment example differs from API example for "+number);
      }
      let typed=value;
      if(input.type==="number"||input.type==="integer"){
        must(typeof value==="number"||
          (typeof value==="string"&&/^\d+(?:\.\d+)?$/.test(value)),
          "invalid payment numeric example for "+number);
        typed=Number(value);
        must(Number.isFinite(typed)&&
          (input.type!=="integer"||Number.isSafeInteger(typed))&&
          (input.minimum===undefined||typed>=input.minimum)&&
          (input.maximum===undefined||typed<=input.maximum),
          "payment example violates numeric input bounds for "+number);
      }else if(input.type==="string"){
        must(typeof typed==="string"&&
          (input.minLength===undefined||typed.length>=input.minLength)&&
          (input.maxLength===undefined||typed.length<=input.maxLength)&&
          (input.pattern===undefined||new RegExp(input.pattern).test(typed))&&
          (input.enum===undefined||input.enum.includes(typed)),
          "payment example violates string input constraints for "+number);
      }else{
        must(typeof typed==="boolean","payment example must be boolean for "+number);
      }
    }
    for(const name of Object.keys(api.example_query)){
      must(Object.hasOwn(payment,name),"payment example missing API example for "+number);
    }
  }
  if(api.payment_example_output!==undefined){
    const output=api.payment_example_output;
    must(output&&typeof output==="object"&&!Array.isArray(output)&&
      output.paid===true&&api.outputs.decisions.includes(output.decision)&&
      Object.keys(output).every(k=>api.outputs.fields.includes(k))&&
      Object.entries(output).every(([k,v])=>
        (["string","boolean","number"].includes(typeof v)&&
          (typeof v!=="number"||Number.isFinite(v)))||
        (k==="reasonCodes"&&Array.isArray(v)&&v.length<=8&&
          v.every(code=>typeof code==="string"&&/^[A-Z0-9_]{1,80}$/.test(code)))),
      "invalid payment output example for "+number);
  }
  if(grouped.length){
    must(grouped.sort().join(",")==="cik,ticker"&&
      (number==="013"
        ?api.input_rule==="Provide company plus exactly one of ticker or cik."
        :api.input_rule==="Provide exactly one of ticker or cik.")&&
      Number(Object.hasOwn(api.example_query,"ticker"))+
      Number(Object.hasOwn(api.example_query,"cik"))===1,
      "exactly-one input example or rule invalid for "+number);
  }else{
    must(api.input_rule===null||api.input_rule===undefined,
      "unexpected input rule for "+number);
  }
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
    validateCommercialClaims(spec,number);
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
    validateInputExamples(api,number);
    must(Array.isArray(spec.sources)&&spec.sources.length>0,"missing source evidence for "+number);
    const sources=new Set();
    for(const source of spec.sources)unique(sources,source?.id,"source id for "+number);
  }
  return specs;
}

module.exports={validateSpecSet};
