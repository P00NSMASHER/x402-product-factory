"use strict";

const fs=require("node:fs");
const path=require("node:path");
const {NETWORK,USDC,PAY_TO}=require("../packages/x402/payment");

const ROOT=path.resolve(__dirname,"..");
const SPEC_DIR=path.join(ROOT,"specs");
const OUTPUTS=Object.freeze({
  discovery:path.join(ROOT,"generated","product-discovery-contracts.json"),
  cases:path.join(ROOT,"generated","product-contract-cases.json"),
  docs:path.join(ROOT,"docs","PRODUCT_CATALOG.generated.md")
});

function specFiles(){
  return fs.readdirSync(SPEC_DIR)
    .filter(name=>/^\d{3}-.+\.json$/.test(name))
    .sort();
}

function loadSpecs(){
  return specFiles().map(name=>JSON.parse(fs.readFileSync(path.join(SPEC_DIR,name),"utf8")));
}

function amountAtomic(price){
  const match=String(price).match(/^(\d+)\.(\d{3})$/);
  if(!match) throw new Error("invalid price_usdc: "+price);
  return String(BigInt(match[1])*1000000n+BigInt(match[2])*1000n);
}

function openApiParameter(input,exampleQuery){
  const schema={};
  for(const key of ["type","minLength","maxLength","pattern","minimum","maximum","default"]){
    if(input[key]!==undefined) schema[key]=input[key];
  }
  const parameter={
    name:input.name,
    in:"query",
    required:input.required===true,
    schema
  };
  if(Object.prototype.hasOwnProperty.call(exampleQuery,input.name)){
    parameter.example=exampleQuery[input.name];
  }
  return parameter;
}

function discoveryContract(spec){
  const operation={
    operationId:spec.discovery.operation_id,
    summary:spec.discovery.summary,
    description:spec.discovery.description,
    tags:spec.discovery.openapi_tags,
    parameters:spec.api.inputs.map(input=>openApiParameter(input,spec.api.example_query)),
    "x-payment-info":{
      price:{mode:"fixed",currency:"USD",amount:Number(spec.economics.price_usdc).toFixed(6)},
      protocols:[{x402:{}}],
      network:NETWORK,
      payTo:PAY_TO
    },
    responses:{
      200:{description:"Completed paid result."},
      400:{description:"Invalid input; payment is not settled."},
      402:{description:"Payment required or terminally invalid."},
      502:{description:"Required source unavailable; payment is not settled."},
      503:{description:"Payment state unresolved; retry the same payment authorization."}
    }
  };
  if(spec.api.input_rule) operation["x-input-rule"]=spec.api.input_rule;

  return {
    number:spec.number,
    id:spec.id,
    resource:{
      path:spec.api.path,
      method:spec.api.method,
      description:spec.discovery.resource_description,
      serviceName:spec.discovery.service_name,
      tags:spec.discovery.search_tags,
      price:"$"+spec.economics.price_usdc,
      accepts:[{
        scheme:"exact",
        network:NETWORK,
        amount:amountAtomic(spec.economics.price_usdc),
        asset:USDC,
        payTo:PAY_TO,
        maxTimeoutSeconds:60,
        extra:{name:"USD Coin",version:"2"}
      }],
      extensions:{
        bazaar:{
          info:{
            input:{type:"http",method:spec.api.method,queryParams:spec.api.example_query},
            output:{type:"json",example:{decision:spec.api.outputs.decisions[0],paid:true}}
          }
        }
      }
    },
    openapi:{[spec.api.method.toLowerCase()]:operation}
  };
}

function contractCase(spec){
  return {
    number:spec.number,
    id:spec.id,
    method:spec.api.method,
    path:spec.api.path,
    price_usdc:spec.economics.price_usdc,
    valid_query:spec.api.example_query,
    invalid_query:{},
    success_decision:spec.api.outputs.decisions[0],
    expectations:{
      unpaid_status:402,
      unpaid_calls_service:false,
      unpaid_calls_network:false,
      invalid_input_status:400,
      invalid_input_calls_network:false,
      required_source_failure_status:502,
      required_source_failure_settles:false,
      payment_unresolved_status:503,
      retry_same_payment:true,
      paid_success_status:200,
      paid_success_verifies_before_settlement:true
    }
  };
}

function buildDiscovery(specs=loadSpecs()){
  return {schema_version:1,products:specs.map(discoveryContract)};
}

function buildCases(specs=loadSpecs()){
  return {schema_version:1,products:specs.map(contractCase)};
}

function buildDocs(specs=loadSpecs()){
  const lines=[
    "# Generated Product Catalog",
    "",
    "Generated from `specs/*.json`. Do not hand-edit.",
    "",
    "| # | Product | Buyer task | Route | Price | Decisions |",
    "| --- | --- | --- | --- | ---: | --- |"
  ];
  for(const spec of specs){
    lines.push(
      "| "+spec.number+
      " | "+spec.discovery.service_name+
      " | "+spec.buyer.task.replaceAll("|","\\|")+
      " | `"+spec.api.method+" "+spec.api.path+"`"+
      " | $"+spec.economics.price_usdc+
      " | "+spec.api.outputs.decisions.join(", ")+" |"
    );
  }
  for(const spec of specs){
    lines.push(
      "",
      "## "+spec.number+" — "+spec.discovery.service_name,
      "",
      spec.discovery.description,
      "",
      "**Sources:** "+spec.sources.map(source=>source.authority).join("; ")+".",
      "",
      "**Decision rules:**",
      ...spec.decision.rules.map(rule=>"- "+rule),
      "",
      "**Failure behavior:** "+spec.failure_behavior.invalid_input+" "+spec.failure_behavior.required_source_failure+" "+spec.failure_behavior.payment_unresolved,
      "",
      "**Economics:** price $"+spec.economics.price_usdc+
        "; post-allowance margin floor "+spec.economics.post_allowance_margin_floor_pct+
        "% before unknown hosting/failure/refund/maintenance costs.",
      "",
      "**Demand:** "+spec.buyer.expected_purchase_frequency.status+"."
    );
  }
  return lines.join("\n")+"\n";
}

function serializeJson(value){ return JSON.stringify(value,null,2)+"\n"; }

function generated(){
  return {
    discovery:serializeJson(buildDiscovery()),
    cases:serializeJson(buildCases()),
    docs:buildDocs()
  };
}

function write(){
  const values=generated();
  for(const [key,file] of Object.entries(OUTPUTS)){
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,values[key],"utf8");
  }
  return values;
}

function check(){
  const values=generated();
  for(const [key,file] of Object.entries(OUTPUTS)){
    const actual=fs.existsSync(file)?fs.readFileSync(file,"utf8"):"";
    if(actual!==values[key]){
      const error=new Error("generated standard artifact is stale: "+path.relative(ROOT,file));
      error.code="GENERATED_STANDARD_ARTIFACT_STALE";
      throw error;
    }
  }
  return values;
}

function main(){
  const mode=process.argv.includes("--check")?"check":"write";
  const values=mode==="check"?check():write();
  console.log(JSON.stringify({
    ok:true,
    mode,
    products:loadSpecs().length,
    outputs:Object.fromEntries(Object.entries(OUTPUTS).map(([key,file])=>[key,path.relative(ROOT,file).replaceAll("\\","/")])),
    bytes:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,Buffer.byteLength(value)]))
  },null,2));
}

if(require.main===module) main();

module.exports={
  ROOT,SPEC_DIR,OUTPUTS,specFiles,loadSpecs,amountAtomic,openApiParameter,
  discoveryContract,contractCase,buildDiscovery,buildCases,buildDocs,generated,write,check
};
