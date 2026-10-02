"use strict";

const STATIC_GET_PATHS=Object.freeze([
  "/api/_healthcheck",
  "/.well-known/x402",
  "/.well-known/x402.json",
  "/.well-known/x402-catalog.json",
  "/openapi.json",
  "/product-index.json",
  "/llms.txt"
]);

function createAppDeployRouteMap(runtime){
  if(!runtime||typeof runtime.handle!=="function"||!Array.isArray(runtime.stagingProducts)){
    throw new TypeError("factory runtime is required");
  }

  const routes={};

  for(const path of STATIC_GET_PATHS){
    routes["GET "+path]=[
      async ({query={},event={}}={})=>
        runtime.handle({method:"GET",path,query,event})
    ];
  }

  for(const product of runtime.stagingProducts){
    const routeKey=product.method+" "+product.path;
    if(routes[routeKey]) throw new Error("duplicate AppDeploy route "+routeKey);
    routes[routeKey]=[
      async ({query={},event={}}={})=>
        runtime.handle({method:product.method,path:product.path,query,event})
    ];

    const optionsKey="OPTIONS "+product.path;
    if(routes[optionsKey]) throw new Error("duplicate AppDeploy route "+optionsKey);
    routes[optionsKey]=[
      async ({query={},event={}}={})=>
        runtime.handle({method:"OPTIONS",path:product.path,query,event})
    ];
  }

  return routes;
}

module.exports={STATIC_GET_PATHS,createAppDeployRouteMap};
