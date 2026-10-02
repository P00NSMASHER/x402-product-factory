"use strict";

const {managedProducts,buildCatalog,buildOpenApi,buildProductIndex,buildLlmsText}=require("../packages/discovery/generator");
const {createPaRegistryAdapter,createCensusAddressAdapter,createRdapAdapter}=require("../packages/sources/live-pa-identity");
const {createSecFilingsAdapter}=require("../packages/sources/sec-filings");
const {createTreasuryAverageRatesAdapter}=require("../packages/sources/treasury-average-rates");
const {createOfacNameAdapter}=require("../packages/sources/ofac-name-screen");
const {SERVICE_MODULES,PAID_HANDLER_MODULES}=require("../generated/product-modules");

const PREFLIGHT_HEADERS=Object.freeze({
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"GET, OPTIONS",
  "access-control-allow-headers":"PAYMENT-SIGNATURE, X-PAYMENT, Content-Type, Accept",
  "access-control-expose-headers":"PAYMENT-REQUIRED, PAYMENT-RESPONSE, x402-settled, x402-price, x402-network, x402-asset, x402-pay-to, Retry-After",
  "cache-control":"no-store"
});

function json(statusCode,body,headers={}){
  return {
    statusCode,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store",
      "access-control-allow-origin":"*",
      ...headers
    },
    body:JSON.stringify(body)
  };
}

function plain(statusCode,body,headers={}){
  return {
    statusCode,
    headers:{
      "content-type":"text/plain; charset=utf-8",
      "cache-control":"public, max-age=300",
      "access-control-allow-origin":"*",
      ...headers
    },
    body:String(body)
  };
}

function defaultAdapters({fetchImpl=fetch,secUserAgent}={}){
  return {
    registry:createPaRegistryAdapter({fetchImpl}),
    address:createCensusAddressAdapter({fetchImpl}),
    rdap:createRdapAdapter({fetchImpl}),
    sec:createSecFilingsAdapter({fetchImpl,userAgent:secUserAgent}),
    treasury:createTreasuryAverageRatesAdapter({fetchImpl}),
    ofac:createOfacNameAdapter({fetchImpl})
  };
}

function chooseFactory(moduleExports,{kind,productId}){
  const entries=Object.entries(moduleExports||{}).filter(([,value])=>typeof value==="function");
  const matches=entries.filter(([name])=>
    kind==="service"
      ? /^create.*Service$/.test(name)
      : /^createPaid.*Handler$/.test(name)
  );
  if(matches.length!==1){
    throw new Error(
      productId+" runtime "+kind+" factory discovery expected exactly one match, found "+matches.map(([name])=>name).join(",")
    );
  }
  return matches[0][1];
}

function discoverRuntimeWiring(products=managedProducts()){
  const wiring={};
  for(const product of products){
    const serviceModule=SERVICE_MODULES[product.id];
    const handlerModule=PAID_HANDLER_MODULES[product.id];
    if(!serviceModule) throw new Error(product.id+" runtime service module missing");
    if(!handlerModule) throw new Error(product.id+" runtime paid-handler module missing");
    wiring[product.id]={
      createService:chooseFactory(serviceModule,{kind:"service",productId:product.id}),
      createPaidHandler:chooseFactory(handlerModule,{kind:"handler",productId:product.id})
    };
  }
  return wiring;
}

function createFactoryRuntime({
  publicApiBase,
  fetchImpl=fetch,
  secUserAgent,
  adapters,
  now=()=>new Date().toISOString()
}={}){
  if(typeof publicApiBase!=="string"||!/^https:\/\//.test(publicApiBase)){
    throw new TypeError("https publicApiBase is required");
  }
  const base=publicApiBase.replace(/\/$/,"");
  const a=adapters||defaultAdapters({fetchImpl,secUserAgent});
  const products=managedProducts();
  const wiring=discoverRuntimeWiring(products);
  const services={};
  const routes=new Map();

  for(const product of products){
    const item=wiring[product.id];
    const service=item.createService({
      registry:a.registry,
      address:a.address,
      rdap:a.rdap,
      sec:a.sec,
      treasury:a.treasury,
      ofac:a.ofac,
      now
    });
    services[product.id]=service;
    routes.set(
      product.method+" "+product.path,
      item.createPaidHandler({
        service,
        publicApiBase:base,
        fetchImpl
      })
    );
  }

  async function handle({method="GET",path="/",query={},event={}}={}){
    const verb=String(method).toUpperCase();
    if(verb==="OPTIONS"&&products.some(product=>product.path===path)){
      return {
        statusCode:204,
        headers:{...PREFLIGHT_HEADERS},
        body:""
      };
    }
    if(verb==="GET"&&path==="/api/_healthcheck"){
      return json(200,{
        ok:true,
        service:"x402-product-factory",
        stagingProductCount:products.length,
        stagingProducts:products.map(p=>p.id)
      });
    }
    if(verb==="GET"&&(path==="/.well-known/x402"||path==="/.well-known/x402.json"||path==="/.well-known/x402-catalog.json")){
      return json(200,buildCatalog(base),{"cache-control":"public, max-age=300"});
    }
    if(verb==="GET"&&path==="/openapi.json"){
      return json(200,buildOpenApi(base),{"cache-control":"public, max-age=300"});
    }
    if(verb==="GET"&&path==="/product-index.json"){
      return json(200,buildProductIndex(base),{"cache-control":"public, max-age=300"});
    }
    if(verb==="GET"&&path==="/llms.txt"){
      return plain(200,buildLlmsText(base));
    }
    const handler=routes.get(verb+" "+path);
    if(!handler)return json(404,{error:"not_found"});
    return await handler({query,event});
  }

  return {
    base,
    adapters:a,
    wiring,
    services,
    routes,
    handle,
    stagingProducts:products
  };
}

module.exports={
  PREFLIGHT_HEADERS,
  defaultAdapters,
  chooseFactory,
  discoverRuntimeWiring,
  createFactoryRuntime
};
