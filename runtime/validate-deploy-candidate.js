"use strict";

const {managedProducts}=require("../packages/discovery/generator");
const {buildReleaseBundle}=require("../scripts/build-release-bundle");
const {validateNoNestedSellerCalls}=require("../scripts/validate-no-nested-seller-calls");
const {checkDeploymentPrereqs}=require("./deployment-preflight");
const {createFactoryRuntime}=require("./create-runtime");
const {STATIC_GET_PATHS,createAppDeployRouteMap}=require("./appdeploy-bridge");

function inertAdapters(){
  const never=async()=>{
    const error=new Error("deploy_candidate_validation_must_not_call_sources");
    error.code="NO_NETWORK_ALLOWED";
    throw error;
  };
  return {
    registry:{lookup:never},
    address:{compare:never},
    rdap:{lookup:never},
    sec:{lookup:never},
    treasury:{lookup:never,history:never,compare:never},
    ofac:{lookup:never}
  };
}

function validateDeployCandidate({
  publicApiBase="https://candidate.example",
  env={},
}={}){
  const prerequisites=checkDeploymentPrereqs(env);
  const nested=validateNoNestedSellerCalls();
  const products=managedProducts();
  const bundle=buildReleaseBundle(publicApiBase);
  const runtime=createFactoryRuntime({
    publicApiBase,
    adapters:inertAdapters(),
    fetchImpl:async()=>{throw new Error("network forbidden during deploy candidate validation");}
  });
  const routes=createAppDeployRouteMap(runtime);

  const productIds=products.map(p=>p.id);
  const bundleIds=bundle.manifest.products.map(p=>p.id);
  const runtimeIds=runtime.stagingProducts.map(p=>p.id);
  const entrypointIds=bundle.appDeployEntrypoint.productIds;

  const problems=[];
  if(!prerequisites.ready)problems.push("deployment_prerequisites_missing");
  if(!nested.ok)problems.push("nested_seller_calls_present");
  if(JSON.stringify(productIds)!==JSON.stringify(bundleIds))problems.push("bundle_product_drift");
  if(JSON.stringify(productIds)!==JSON.stringify(runtimeIds))problems.push("runtime_product_drift");
  if(JSON.stringify(productIds)!==JSON.stringify(entrypointIds))problems.push("entrypoint_product_drift");

  const expectedRouteCount=STATIC_GET_PATHS.length+2*products.length;
  if(Object.keys(routes).length!==expectedRouteCount)problems.push("appdeploy_route_count_drift");
  if(bundle.appDeployEntrypoint.totalRouteCount!==expectedRouteCount)problems.push("entrypoint_route_count_drift");
  if(bundle.manifest.appdeploy_entrypoint?.total_route_count!==expectedRouteCount)problems.push("entrypoint_manifest_route_count_drift");

  for(const product of products){
    if(!routes[product.method+" "+product.path])problems.push("missing_paid_route:"+product.id);
    if(!routes["OPTIONS "+product.path])problems.push("missing_preflight_route:"+product.id);
    if(!bundle.openapi.paths[product.path])problems.push("missing_openapi_path:"+product.id);
    if(!bundle.catalog.resources.some(r=>new URL(r.resource).pathname===product.path)){
      problems.push("missing_catalog_resource:"+product.id);
    }
  }

  return {
    ready:problems.length===0,
    publicApiBase:String(publicApiBase).replace(/\/$/,""),
    productCount:products.length,
    productIds,
    appDeployRouteCount:Object.keys(routes).length,
    generatedEntrypointRouteCount:bundle.appDeployEntrypoint.totalRouteCount,
    staticRouteCount:STATIC_GET_PATHS.length,
    paidRouteCount:products.length,
    optionsRouteCount:products.length,
    releaseFiles:[...Object.keys(bundle.canonicalFiles),"release-manifest.json"].sort(),
    prerequisites,
    nestedSellerCalls:nested,
    problems
  };
}

if(require.main===module){
  const result=validateDeployCandidate({
    publicApiBase:process.env.PUBLIC_API_BASE||"https://candidate.example",
    env:process.env
  });
  console.log(JSON.stringify(result,null,2));
  if(!result.ready)process.exitCode=2;
}

module.exports={inertAdapters,validateDeployCandidate};
