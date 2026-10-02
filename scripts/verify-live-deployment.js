"use strict";

const {PAY_TO,NETWORK,USDC}=require("../packages/x402/payment");

const STATIC_PATHS=[
  "/api/_healthcheck",
  "/.well-known/x402",
  "/openapi.json",
  "/product-index.json",
  "/llms.txt"
];

function normalizeBase(base){
  if(typeof base!=="string"||!/^https:\/\//.test(base)){
    throw new TypeError("https base URL is required");
  }
  return base.replace(/\/$/,"");
}

async function readBody(response){
  const text=await response.text();
  try{return {text,json:JSON.parse(text)};}
  catch{return {text,json:null};}
}

function decodeBase64Json(value){
  if(typeof value!=="string"||!value.trim())return null;
  try{
    const normalized=value.replace(/-/g,"+").replace(/_/g,"/");
    return JSON.parse(Buffer.from(normalized,"base64").toString("utf8"));
  }catch{return null;}
}

function exampleUrl(base,resource){
  const url=new URL(resource.resource);
  const params=resource?.extensions?.bazaar?.info?.input?.queryParams;
  if(!params||typeof params!=="object"){
    throw new Error("missing Bazaar example query params for "+resource.resource);
  }
  for(const [key,value] of Object.entries(params)){
    if(value!==undefined&&value!==null)url.searchParams.set(key,String(value));
  }
  if(url.origin!==new URL(base).origin){
    throw new Error("resource origin drift: "+resource.resource);
  }
  return url.toString();
}

function exactRequirement(body){
  if(!body||!Array.isArray(body.accepts)||body.accepts.length!==1)return null;
  return body.accepts[0];
}

async function verifyLiveDeployment({base,fetchImpl=fetch}={}){
  const normalized=normalizeBase(base);
  const problems=[];
  const observations={
    base:normalized,
    static:{},
    products:[]
  };

  async function get(path,init){
    return await fetchImpl(normalized+path,init);
  }

  for(const path of STATIC_PATHS){
    try{
      const response=await get(path,{headers:{accept:path.endsWith(".txt")?"text/plain":"application/json"}});
      const body=await readBody(response);
      observations.static[path]={status:response.status,body:body.json??body.text};
      if(response.status!==200)problems.push("static_status:"+path+":"+response.status);
    }catch(error){
      observations.static[path]={error:error?.message||String(error)};
      problems.push("static_transport:"+path);
    }
  }

  const catalog=observations.static["/.well-known/x402"]?.body;
  const openapi=observations.static["/openapi.json"]?.body;
  const index=observations.static["/product-index.json"]?.body;
  const llms=observations.static["/llms.txt"]?.body;

  if(!catalog||catalog.x402Version!==2||!Array.isArray(catalog.resources)){
    problems.push("catalog_invalid");
  }
  if(!openapi||openapi.openapi!=="3.1.0"||!openapi.paths){
    problems.push("openapi_invalid");
  }
  if(!index||!Array.isArray(index.products)){
    problems.push("product_index_invalid");
  }

  const resources=Array.isArray(catalog?.resources)?catalog.resources:[];
  const indexProducts=Array.isArray(index?.products)?index.products:[];

  if(resources.length!==indexProducts.length){
    problems.push("catalog_index_count_mismatch");
  }
  if(openapi?.paths&&Object.keys(openapi.paths).length!==indexProducts.length){
    problems.push("openapi_index_count_mismatch");
  }

  for(let i=0;i<resources.length;i++){
    const resource=resources[i];
    const indexed=indexProducts[i];
    const path=resource?.resource?new URL(resource.resource).pathname:null;
    const observation={
      id:indexed?.id??null,
      path,
      price:resource?.price??null,
      unpaid:null,
      options:null
    };
    observations.products.push(observation);

    if(!path){
      problems.push("resource_path_missing:"+i);
      continue;
    }
    if(indexed?.path!==path)problems.push("index_resource_path_mismatch:"+path);
    if(!openapi?.paths?.[path])problems.push("openapi_path_missing:"+path);
    if(typeof llms==="string"&&!llms.includes(path))problems.push("llms_path_missing:"+path);

    const expectedAccept=Array.isArray(resource.accepts)?resource.accepts[0]:null;
    if(!expectedAccept)problems.push("catalog_accept_missing:"+path);
    else{
      if(expectedAccept.scheme!=="exact")problems.push("catalog_scheme:"+path);
      if(expectedAccept.network!==NETWORK)problems.push("catalog_network:"+path);
      if(String(expectedAccept.asset).toLowerCase()!==USDC.toLowerCase())problems.push("catalog_asset:"+path);
      if(String(expectedAccept.payTo).toLowerCase()!==PAY_TO.toLowerCase())problems.push("catalog_payto:"+path);
    }

    let url;
    try{url=exampleUrl(normalized,resource);}
    catch(error){
      problems.push("example_input_invalid:"+path);
      observation.unpaid={error:error?.message||String(error)};
      continue;
    }

    try{
      const response=await fetchImpl(url,{headers:{accept:"application/json"}});
      const body=await readBody(response);
      const headerDoc=decodeBase64Json(response.headers?.get?.("payment-required"));
      const accept=exactRequirement(body.json);
      observation.unpaid={
        status:response.status,
        error:body.json?.error??null,
        amount:accept?.amount??null,
        network:accept?.network??null,
        asset:accept?.asset??null,
        payTo:accept?.payTo??null,
        paymentRequiredHeaderValid:Boolean(headerDoc?.accepts?.length)
      };
      if(response.status!==402)problems.push("unpaid_status:"+path+":"+response.status);
      if(!accept)problems.push("unpaid_accept_missing:"+path);
      else{
        if(accept.amount!==expectedAccept?.amount)problems.push("unpaid_amount:"+path);
        if(accept.network!==NETWORK)problems.push("unpaid_network:"+path);
        if(String(accept.asset).toLowerCase()!==USDC.toLowerCase())problems.push("unpaid_asset:"+path);
        if(String(accept.payTo).toLowerCase()!==PAY_TO.toLowerCase())problems.push("unpaid_payto:"+path);
      }
      if(!headerDoc||!Array.isArray(headerDoc.accepts)||headerDoc.accepts.length!==1){
        problems.push("payment_required_header:"+path);
      }
    }catch(error){
      observation.unpaid={error:error?.message||String(error)};
      problems.push("unpaid_transport:"+path);
    }

    try{
      const response=await fetchImpl(normalized+path,{
        method:"OPTIONS",
        headers:{
          origin:"https://agent.example",
          "access-control-request-method":"GET",
          "access-control-request-headers":"PAYMENT-SIGNATURE"
        }
      });
      observation.options={
        status:response.status,
        allowMethods:response.headers?.get?.("access-control-allow-methods")??null,
        allowHeaders:response.headers?.get?.("access-control-allow-headers")??null
      };
      if(response.status!==204)problems.push("options_status:"+path+":"+response.status);
      if(!/GET/i.test(observation.options.allowMethods||""))problems.push("options_get:"+path);
      if(!/PAYMENT-SIGNATURE/i.test(observation.options.allowHeaders||""))problems.push("options_payment_header:"+path);
    }catch(error){
      observation.options={error:error?.message||String(error)};
      problems.push("options_transport:"+path);
    }
  }

  const health=observations.static["/api/_healthcheck"]?.body;
  if(health?.stagingProductCount!==undefined&&health.stagingProductCount!==resources.length){
    problems.push("health_catalog_count_mismatch");
  }

  return {
    ok:problems.length===0,
    verifiedAt:new Date().toISOString(),
    productCount:resources.length,
    network:NETWORK,
    payTo:PAY_TO,
    usdc:USDC,
    observations,
    problems
  };
}

if(require.main===module){
  const base=process.argv[2]||process.env.PUBLIC_API_BASE;
  verifyLiveDeployment({base}).then(result=>{
    console.log(JSON.stringify(result,null,2));
    if(!result.ok)process.exitCode=2;
  }).catch(error=>{
    console.error(error);
    process.exitCode=1;
  });
}

module.exports={
  STATIC_PATHS,
  normalizeBase,
  decodeBase64Json,
  exampleUrl,
  verifyLiveDeployment
};
