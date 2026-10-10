"use strict";

const fs=require("node:fs");
const path=require("node:path");
const {validateSpecSet}=require("./validate-product-spec-contract");
const {NETWORK,USDC,PAY_TO}=require("../packages/x402/payment");

const ROOT=path.resolve(__dirname,"..");
const SPEC_DIR=path.join(ROOT,"specs");
const GENERATED_DIR=path.join(ROOT,"generated");

const PAYMENT=Object.freeze({
  network:NETWORK,
  asset:USDC,
  payTo:PAY_TO,
  scheme:"exact",
  extra:Object.freeze({name:"USD Coin",version:"2"})
});

function discoverSpecFiles(){
  return fs.readdirSync(SPEC_DIR)
    .filter(name=>/^\d{3}-.+\.json$/.test(name))
    .sort();
}

function loadSpecs(){
  const filenames=discoverSpecFiles();
  const specs=filenames.map(name=>
    JSON.parse(fs.readFileSync(path.join(SPEC_DIR,name),"utf8"))
  );
  return validateSpecSet(specs,{filenames});
}

function fixedSix(value){
  const [whole,fraction=""]=String(value).split(".");
  return whole+"."+fraction.padEnd(6,"0").slice(0,6);
}

function amountAtomic(priceUsdc){
  const [whole,fraction=""]=String(priceUsdc).split(".");
  return String(BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,"0").slice(0,6)));
}

function discoveryProduct(spec){
  return {
    number:spec.number,
    id:spec.id,
    buyer_task:spec.buyer.task,
    operation_id:spec.discovery.operation_id,
    service_name:spec.discovery.service_name,
    summary:spec.discovery.summary,
    description:spec.discovery.description,
    resource_description:spec.discovery.resource_description,
    search_tags:spec.discovery.search_tags,
    openapi_tags:spec.discovery.openapi_tags,
    method:spec.api.method,
    path:spec.api.path,
    price_usdc:spec.economics.price_usdc,
    payment:{
      x402_version:2,
      ...PAYMENT,
      amount_atomic_usdc:amountAtomic(spec.economics.price_usdc)
    },
    inputs:spec.api.inputs,
    example_query:spec.api.example_query,
    outputs:spec.api.outputs,
    sources:spec.sources.map(source=>({
      id:source.id,
      authority:source.authority,
      refresh_policy:source.refresh_policy,
      cache_policy:source.cache_policy,
      freshness_limit_seconds:source.freshness_limit_seconds
    })),
    failure_behavior:spec.failure_behavior,
    input_rule:spec.api.input_rule??null
  };
}

function buildDiscovery(specs=loadSpecs()){
  return {
    schema_version:1,
    generator:"scripts/generate-spec-artifacts.js",
    products:specs.map(discoveryProduct)
  };
}

function contractCasesFor(spec){
  const cases=[
    {
      id:spec.id+":unpaid",
      kind:"payment_required",
      method:spec.api.method,
      path:spec.api.path,
      expected_status:402,
      assertions:["PAYMENT-REQUIRED header present","x402 price matches spec","no source work required"]
    },
    {
      id:spec.id+":invalid-input",
      kind:"invalid_input",
      method:spec.api.method,
      path:spec.api.path,
      expected_status:400,
      assertions:["payment is not settled"]
    },
    {
      id:spec.id+":malformed-payment",
      kind:"malformed_payment",
      method:spec.api.method,
      path:spec.api.path,
      expected_status:402,
      assertions:["invalid payment returns fresh challenge","no source work required"]
    },
    {
      id:spec.id+":verification-terminal",
      kind:"verification_terminal",
      method:spec.api.method,
      path:spec.api.path,
      expected_status:402,
      assertions:["terminal verification returns fresh challenge","no source work required"]
    },
    {
      id:spec.id+":required-source-failure",
      kind:"required_source_failure",
      method:spec.api.method,
      path:spec.api.path,
      expected_status:502,
      assertions:["chargeable=false","payment is not settled"]
    },
    {
      id:spec.id+":source-exception",
      kind:"source_exception",
      method:spec.api.method,
      path:spec.api.path,
      expected_status:502,
      assertions:["chargeable=false","payment is not settled"]
    },
    {
      id:spec.id+":payment-unresolved",
      kind:"payment_unresolved",
      method:spec.api.method,
      path:spec.api.path,
      expected_status:503,
      assertions:["retrySamePayment=true"]
    },
    {
      id:spec.id+":settlement-terminal",
      kind:"settlement_terminal",
      method:spec.api.method,
      path:spec.api.path,
      expected_status:402,
      assertions:["terminal settlement returns fresh challenge"]
    },
    {
      id:spec.id+":success",
      kind:"paid_success",
      method:spec.api.method,
      path:spec.api.path,
      expected_status:200,
      allowed_decisions:spec.api.outputs.decisions,
      assertions:["PAYMENT-RESPONSE header present","x402-settled=true","price matches spec"]
    }
  ];
  return cases.map(item=>({
    ...item,
    price_usdc:spec.economics.price_usdc,
    query:item.kind==="invalid_input"?{}:spec.api.example_query
  }));
}

function buildContractCases(specs=loadSpecs()){
  return {
    schema_version:1,
    generated_from:"specs/*.json",
    cases:specs.flatMap(contractCasesFor)
  };
}

function renderMetadataModule(specs=loadSpecs()){
  const products=Object.fromEntries(specs.map(spec=>[
    spec.id,
    {
      id:spec.id,
      operation_id:spec.discovery.operation_id,
      service_name:spec.discovery.service_name,
      summary:spec.discovery.summary,
      description:spec.discovery.description,
      resource_description:spec.discovery.resource_description,
      search_tags:spec.discovery.search_tags,
      openapi_tags:spec.discovery.openapi_tags,
      method:spec.api.method,
      path:spec.api.path,
      price_usdc:spec.economics.price_usdc,
      amount_atomic_usdc:amountAtomic(spec.economics.price_usdc),
      inputs:spec.api.inputs,
      input_rule:spec.api.input_rule??null,
      example_query:spec.api.example_query,
      decisions:spec.api.outputs.decisions
    }
  ]));
  const productJson=JSON.stringify(products,null,2);
  const paymentJson=JSON.stringify(PAYMENT,null,2);
  return [
    '"use strict";',
    '',
    '// Generated by scripts/generate-spec-artifacts.js. Do not hand-edit.',
    'const PAYMENT=Object.freeze('+paymentJson+');',
    'const PRODUCTS=Object.freeze('+productJson+');',
    '',
    'function normalizeBase(base){',
    '  if(typeof base!=="string"||!base.startsWith("https://"))throw new TypeError("https base URL is required");',
    '  return base.endsWith("/")?base.slice(0,-1):base;',
    '}',
    '',
    'function product(id){',
    '  const value=PRODUCTS[id];',
    '  if(!value)throw new Error("unknown spec product: "+id);',
    '  return value;',
    '}',
    '',
    'function fixedSix(value){',
    '  const [whole,fraction=""]=String(value).split(".");',
    '  return whole+"."+fraction.padEnd(6,"0").slice(0,6);',
    '}',
    '',
    'function paymentRequirements(item){',
    '  return {scheme:PAYMENT.scheme,network:PAYMENT.network,amount:item.amount_atomic_usdc,asset:PAYMENT.asset,payTo:PAYMENT.payTo,maxTimeoutSeconds:60,extra:PAYMENT.extra};',
    '}',
    '',
    'function catalogResource(id,base){',
    '  const item=product(id);',
    '  const normalized=normalizeBase(base);',
    '  return {',
    '    resource:normalized+item.path,',
    '    method:item.method,',
    '    description:item.resource_description,',
    '    price:"$"+item.price_usdc,',
    '    tags:item.search_tags,',
    '    accepts:[paymentRequirements(item)],',
    '    extensions:{bazaar:{info:{input:{type:"http",method:item.method,queryParams:item.example_query},output:{type:"json",example:{decision:item.decisions[0],paid:true}}}}}',
    '  };',
    '}',
    '',
    'function openApiParameter(input,exampleQuery){',
    '  const schema={type:input.type};',
    '  for(const key of ["minLength","maxLength","pattern","minimum","maximum","default"]){',
    '    if(input[key]!==undefined)schema[key]=input[key];',
    '  }',
    '  const parameter={name:input.name,in:"query",required:input.required===true,schema};',
    '  if(Object.prototype.hasOwnProperty.call(exampleQuery,input.name))parameter.example=exampleQuery[input.name];',
    '  return parameter;',
    '}',
    '',
    'function openApiPath(id){',
    '  const item=product(id);',
    '  const operation={',
    '    operationId:item.operation_id,',
    '    summary:item.summary,',
    '    description:item.description,',
    '    tags:item.openapi_tags,',
    '    parameters:item.inputs.map(input=>openApiParameter(input,item.example_query)),',
    '    "x-payment-info":{price:{mode:"fixed",currency:"USD",amount:fixedSix(item.price_usdc)},protocols:[{x402:{}}],network:PAYMENT.network,payTo:PAYMENT.payTo},',
    '    responses:{',
    '      200:{description:"Completed paid product decision."},',
    '      400:{description:"Invalid input; payment is not settled."},',
    '      402:{description:"Payment required or terminally invalid."},',
    '      502:{description:"Required source unavailable; payment is not settled."},',
    '      503:{description:"Payment unresolved; retry the same authorization."}',
    '    }',
    '  };',
    '  if(item.input_rule)operation["x-input-rule"]=item.input_rule;',
    '  return {[item.method.toLowerCase()]:operation};',
    '}',
    '',
    'module.exports={PAYMENT,PRODUCTS,product,fixedSix,paymentRequirements,catalogResource,openApiPath};',
    ''
  ].join("\n");
}


function renderPaidHandlersModule(specs=loadSpecs()){
  for(const spec of specs){
    if(spec.implementation?.handler_template!=="standard-x402-get-v1"){
      throw new Error(spec.id+" unsupported handler template");
    }
  }
  const services=specs.map(spec=>{
    const service="../"+spec.implementation.service_module.replace(/\.js$/,"");
    return "  "+JSON.stringify(spec.id)+":require("+JSON.stringify(service)+")";
  }).join(",\n");
  const validators=specs.map(spec=>
    "  "+JSON.stringify(spec.id)+":SERVICE_MODULES["+JSON.stringify(spec.id)+"]["+JSON.stringify(spec.implementation.input_validator_export)+"]"
  ).join(",\n");
  const modules=specs.map(spec=>
    "  "+JSON.stringify(spec.id)+":moduleFor("+JSON.stringify(spec.id)+")"
  ).join(",\n");
  return [
    '"use strict";',
    '',
    '// Generated by scripts/generate-spec-artifacts.js. Do not hand-edit.',
    'const {createStandardPaidHandler,standardPaymentDocument}=require("../packages/x402/standard-paid-handler");',
    'const METADATA=require("./spec-metadata");',
    '',
    'const SERVICE_MODULES=Object.freeze({',
    services,
    '});',
    '',
    'const VALIDATORS=Object.freeze({',
    validators,
    '});',
    '',
    'function moduleFor(productId){',
    '  const product=METADATA.product(productId);',
    '  const validateInput=VALIDATORS[productId];',
    '  if(typeof validateInput!=="function")throw new Error(productId+" generated input validator missing");',
    '  return Object.freeze({',
    '    source:"spec-generated",',
    '    AMOUNT_ATOMIC:product.amount_atomic_usdc,',
    '    PRICE:"$"+product.price_usdc,',
    '    RESOURCE_PATH:product.path,',
    '    productPaymentDocument(publicApiBase){',
    '      return standardPaymentDocument({product,publicApiBase});',
    '    },',
    '    createPaidSpecHandler({service,publicApiBase,fetchImpl=fetch}){',
    '      return createStandardPaidHandler({product,validateInput,service,publicApiBase,fetchImpl});',
    '    }',
    '  });',
    '}',
    '',
    'const PAID_HANDLER_MODULES=Object.freeze({',
    modules,
    '});',
    '',
    'module.exports={SERVICE_MODULES,VALIDATORS,moduleFor,PAID_HANDLER_MODULES};',
    ''
  ].join("\n");
}

function renderDocs(specs=loadSpecs()){
  const lines=[
    "# Generated product catalogue",
    "",
    "Generated from `specs/*.json` by `scripts/generate-spec-artifacts.js`. Do not hand-edit.",
    ""
  ];
  for(const spec of specs){
    lines.push(
      "## "+spec.number+" "+spec.id,
      "",
      spec.buyer.task,
      "",
      "- Endpoint: `"+spec.api.method+" "+spec.api.path+"`",
      "- Price: **$"+fixedSix(spec.economics.price_usdc)+" USDC**",
      "- Decisions: "+spec.api.outputs.decisions.map(value=>"`"+value+"`").join(", "),
      "- Sources: "+spec.sources.map(source=>source.authority).join("; "),
      "- Purchase frequency: **"+spec.buyer.expected_purchase_frequency.status+"**",
      "- Post-allowance margin floor before unknown hosting/failure/refund/maintenance costs: **"+spec.economics.post_allowance_margin_floor_pct.toFixed(1)+"%**",
      "",
      "### Inputs",
      ""
    );
    for(const input of spec.api.inputs){
      const qualifiers=[];
      if(input.required===true) qualifiers.push("required");
      else if(input.required===false) qualifiers.push("optional");
      else qualifiers.push(String(input.required));
      if(input.default!==undefined) qualifiers.push("default="+input.default);
      if(input.minimum!==undefined) qualifiers.push("min="+input.minimum);
      if(input.maximum!==undefined) qualifiers.push("max="+input.maximum);
      if(input.minLength!==undefined) qualifiers.push("minLength="+input.minLength);
      if(input.maxLength!==undefined) qualifiers.push("maxLength="+input.maxLength);
      lines.push("- `"+input.name+"` ("+input.type+"; "+qualifiers.join(", ")+")");
    }
    lines.push(
      "",
      "### Decision rules",
      "",
      ...spec.decision.rules.map(rule=>"- "+rule),
      "",
      "### Failure behavior",
      "",
      "- Invalid input: "+spec.failure_behavior.invalid_input,
      "- Required source failure: "+spec.failure_behavior.required_source_failure,
      "- Payment unresolved: "+spec.failure_behavior.payment_unresolved,
      "- Automatic reject: **"+String(spec.failure_behavior.automatic_reject)+"**",
      "",
      "### Launch gate",
      "",
      "- Status: `"+spec.launch.current_status+"`",
      "- Release gate: `"+spec.launch.release_gate+"`",
      ...spec.launch.criteria.map(item=>"- "+item),
      ""
    );
  }
  return lines.join("\n")+"\n";
}

const OUTPUTS=Object.freeze({
  discovery:"spec-discovery.json",
  contracts:"spec-contract-cases.json",
  docs:"SPEC_PRODUCTS.md",
  metadata:"spec-metadata.js",
  handlers:"spec-paid-handlers.js"
});

function serializeOutputs(specs=loadSpecs()){
  return {
    [OUTPUTS.discovery]:JSON.stringify(buildDiscovery(specs),null,2)+"\n",
    [OUTPUTS.contracts]:JSON.stringify(buildContractCases(specs),null,2)+"\n",
    [OUTPUTS.docs]:renderDocs(specs),
    [OUTPUTS.metadata]:renderMetadataModule(specs),
    [OUTPUTS.handlers]:renderPaidHandlersModule(specs)
  };
}

function write(){
  const outputs=serializeOutputs();
  fs.mkdirSync(GENERATED_DIR,{recursive:true});
  for(const [name,content] of Object.entries(outputs)){
    fs.writeFileSync(path.join(GENERATED_DIR,name),content,"utf8");
  }
  return outputs;
}

function check(){
  const expected=serializeOutputs();
  for(const [name,content] of Object.entries(expected)){
    const file=path.join(GENERATED_DIR,name);
    const actual=fs.existsSync(file)?fs.readFileSync(file,"utf8"):"";
    if(actual!==content){
      const error=new Error(name+" is stale; run node scripts/generate-spec-artifacts.js");
      error.code="GENERATED_SPEC_ARTIFACT_STALE";
      throw error;
    }
  }
  return expected;
}

function main(){
  const mode=process.argv.includes("--check")?"check":"write";
  const outputs=mode==="check"?check():write();
  const specs=loadSpecs();
  console.log(JSON.stringify({
    ok:true,
    mode,
    products:specs.length,
    contractCases:buildContractCases(specs).cases.length,
    outputs:Object.fromEntries(Object.entries(outputs).map(([name,content])=>[name,Buffer.byteLength(content)]))
  },null,2));
}

if(require.main===module)main();

module.exports={
  PAYMENT,OUTPUTS,discoverSpecFiles,loadSpecs,fixedSix,amountAtomic,
  buildDiscovery,buildContractCases,renderDocs,renderMetadataModule,renderPaidHandlersModule,serializeOutputs,write,check
};
