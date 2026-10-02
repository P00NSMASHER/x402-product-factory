"use strict";

const registry=require("../../product-registry.json");
const {METADATA_MODULES}=require("../../generated/product-modules");

const MODULES=METADATA_MODULES;

function managedProducts(){
  const staging=registry.products.filter(product=>/staging$/.test(product.status));
  for(const product of staging){
    if(!MODULES[product.id]){
      throw new Error(product.id+" staging product missing metadata module");
    }
  }
  return staging;
}

function normalizeBase(base){
  if(typeof base!=="string"||!/^https:\/\//.test(base)){
    throw new TypeError("https base URL is required");
  }
  return base.replace(/\/$/,"");
}

function buildCatalog(base){
  const normalized=normalizeBase(base);
  const products=managedProducts();
  const resources=products.map(product=>{
    const resource=MODULES[product.id].catalogResource(normalized);
    if(!Array.isArray(resource.accepts)||resource.accepts.length===0){
      throw new Error(product.id+" missing resource-level accepts");
    }
    return resource;
  });
  return {
    x402Version:2,
    name:"x402 Product Factory",
    description:"Machine-purchasable decision and verification tools for autonomous agents.",
    resources
  };
}

function buildOpenApi(base){
  const normalized=normalizeBase(base);
  const paths={};
  for(const product of managedProducts()){
    const fragment=MODULES[product.id].openApiPath();
    if(!fragment||typeof fragment!=="object"){
      throw new Error(product.id+" missing OpenAPI fragment");
    }
    paths[product.path]=fragment;
  }
  return {
    openapi:"3.1.0",
    info:{
      title:"x402 Product Factory",
      version:"0.1.0",
      description:"Paid agent decision and verification endpoints sharing hardened x402 payment semantics."
    },
    servers:[{url:normalized}],
    paths
  };
}

function buildProductIndex(base){
  const normalized=normalizeBase(base);
  return {
    schema_version:1,
    base_url:normalized,
    products:managedProducts().map(product=>({
      number:product.number,
      id:product.id,
      method:product.method,
      path:product.path,
      price_usdc:product.price_usdc,
      status:product.status,
      decision_values:Array.isArray(product.decision_values)?product.decision_values:[]
    }))
  };
}

function buildLlmsText(base){
  const normalized=normalizeBase(base);
  const lines=[
    "# x402 Product Factory",
    "",
    "Base URL: "+normalized,
    "Payment network: Base (eip155:8453), USDC via x402.",
    "",
    "Products:"
  ];
  for(const product of managedProducts()){
    const resource=MODULES[product.id].catalogResource(normalized);
    lines.push(
      "- "+product.number+" "+product.id+" — GET "+product.path+" — $"+product.price_usdc+" USDC — "+resource.description
    );
  }
  lines.push(
    "",
    "Payment lifecycle: unpaid requests return HTTP 402; invalid input is rejected before settlement; required-source transport failures do not settle; unresolved settlement returns HTTP 503 and callers should retry the same payment authorization.",
    "Outputs are bounded evidence/workflow signals, not legal, compliance, sanctions, fraud, credit, or investment advice unless a product explicitly states otherwise."
  );
  return lines.join("\n");
}

function validateCompiled(base){
  const catalog=buildCatalog(base);
  const openapi=buildOpenApi(base);
  const products=managedProducts();
  const urls=new Set();
  for(let index=0;index<products.length;index+=1){
    const product=products[index];
    const resource=catalog.resources[index];
    if(urls.has(resource.resource)) throw new Error("duplicate resource URL: "+resource.resource);
    urls.add(resource.resource);
    if(resource.price!=="$"+product.price_usdc) throw new Error(product.id+" price mismatch");
    if(!openapi.paths[product.path]) throw new Error(product.id+" missing compiled OpenAPI path");
  }
  return {
    productCount:products.length,
    ids:products.map(product=>product.id),
    catalog,
    openapi,
    llms:buildLlmsText(base)
  };
}

module.exports={
  MODULES,
  managedProducts,
  buildCatalog,
  buildOpenApi,
  buildProductIndex,
  buildLlmsText,
  validateCompiled
};
