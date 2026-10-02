"use strict";

const fs=require("node:fs");
const path=require("node:path");
const registry=require("../product-registry.json");
const {buildDeploymentBundle,sha256}=require("../packages/discovery/bundle");
const {buildAppDeployRuntimeBundle}=require("./build-appdeploy-runtime-bundle");
const {buildAppDeployEntrypoint}=require("./build-appdeploy-entrypoint");

const ROOT=path.resolve(__dirname,"..");
const DEFAULT_BASE="https://candidate.example";

function expectedAtomic(priceUsdc){
  const n=Number(priceUsdc);
  if(!Number.isFinite(n)||n<0)throw new Error("invalid registry price "+priceUsdc);
  return String(Math.round(n*1_000_000));
}

function parseJsonFile(bundle,name){
  return JSON.parse(bundle.files[name]);
}

function buildReleaseBundle(publicApiBase=DEFAULT_BASE){
  const base=String(publicApiBase).replace(/\/$/,"");
  if(!/^https:\/\//.test(base))throw new Error("publicApiBase must use https");

  const deployment=buildDeploymentBundle(base);
  const runtimeBundle=buildAppDeployRuntimeBundle();
  const runtimeFileName="factory-runtime-bundle.js";
  const runtimeSha256=sha256(runtimeBundle.source);
  const appDeployEntrypoint=buildAppDeployEntrypoint(base);
  const appDeployEntrypointFileName="appdeploy-backend-index.ts";
  const appDeployEntrypointSha256=sha256(appDeployEntrypoint.source);
  const appDeployFileMap={
    schema_version:1,
    files:[
      {
        target_path:"backend/index.ts",
        source_file:appDeployEntrypointFileName,
        sha256:appDeployEntrypointSha256
      },
      {
        target_path:"backend/factory-runtime-bundle.js",
        source_file:runtimeFileName,
        sha256:runtimeSha256
      }
    ]
  };
  const appDeployFileMapFileName="appdeploy-deploy-files.json";
  const appDeployFileMapContent=JSON.stringify(appDeployFileMap,null,2)+"\n";
  const appDeployFileMapSha256=sha256(appDeployFileMapContent);
  const catalog=parseJsonFile(deployment,"x402-catalog.json");
  const openapi=parseJsonFile(deployment,"openapi.json");
  const productIndex=parseJsonFile(deployment,"product-index.json");
  const bundleManifest=parseJsonFile(deployment,"bundle-manifest.json");

  if(catalog.resources.length!==productIndex.products.length)throw new Error("catalog product-count drift");
  if(Object.keys(openapi.paths).length!==productIndex.products.length)throw new Error("OpenAPI product-count drift");
  if(bundleManifest.product_count!==productIndex.products.length)throw new Error("bundle manifest product-count drift");

  for(let i=0;i<productIndex.products.length;i++){
    const p=productIndex.products[i];
    const resource=catalog.resources[i];
    if(resource.resource!==base+p.path)throw new Error(p.id+" resource path drift");
    if(resource.method!==p.method)throw new Error(p.id+" method drift");
    if(resource.price!=="$"+p.price_usdc)throw new Error(p.id+" price drift");
    if(!Array.isArray(resource.accepts)||resource.accepts.length!==1)throw new Error(p.id+" must expose one accepts entry");

    const accept=resource.accepts[0];
    if(accept.amount!==expectedAtomic(p.price_usdc))throw new Error(p.id+" atomic amount drift");
    if(accept.network!=="eip155:8453")throw new Error(p.id+" network drift");
    if(String(accept.asset).toLowerCase()!=="0x833589fcd6edb6e08f4c7c32d4f71b54bda02913")throw new Error(p.id+" asset drift");
    if(String(accept.payTo).toLowerCase()!=="0x708f7b52b56eafd7fc1de65fc7752ed732914021")throw new Error(p.id+" payTo drift");
    if(!openapi.paths[p.path])throw new Error(p.id+" OpenAPI path missing");
    if(!Array.isArray(p.required_env))throw new Error(p.id+" required_env missing from product index");
    if(!Array.isArray(p.deployment_requirements))throw new Error(p.id+" deployment_requirements missing from product index");
  }

  const releaseManifest={
    schema_version:2,
    public_api_base:base,
    registry_version:registry.version,
    product_count:productIndex.products.length,
    products:productIndex.products,
    discovery_bundle_manifest:bundleManifest,
    runtime_bundle:{
      name:runtimeFileName,
      sha256:runtimeSha256,
      module_count:runtimeBundle.moduleCount,
      entries:runtimeBundle.entries
    },
    appdeploy_entrypoint:{
      name:appDeployEntrypointFileName,
      sha256:appDeployEntrypointSha256,
      total_route_count:appDeployEntrypoint.totalRouteCount,
      paid_route_count:appDeployEntrypoint.paidRouteCount,
      options_route_count:appDeployEntrypoint.optionsRouteCount,
      static_route_count:appDeployEntrypoint.staticRouteCount
    },
    appdeploy_deploy_files:{
      name:appDeployFileMapFileName,
      sha256:appDeployFileMapSha256,
      targets:appDeployFileMap.files
    }
  };

  return {
    catalog,
    openapi,
    llms:deployment.files["llms.txt"],
    productIndex,
    bundleManifest,
    manifest:releaseManifest,
    runtimeBundle,
    appDeployEntrypoint,
    appDeployFileMap,
    canonicalFiles:{
      ...deployment.files,
      [runtimeFileName]:runtimeBundle.source,
      [appDeployEntrypointFileName]:appDeployEntrypoint.source,
      [appDeployFileMapFileName]:appDeployFileMapContent
    }
  };
}

function writeReleaseBundle(outDir,publicApiBase=DEFAULT_BASE){
  const bundle=buildReleaseBundle(publicApiBase);
  fs.mkdirSync(outDir,{recursive:true});

  for(const [name,content] of Object.entries(bundle.canonicalFiles)){
    fs.writeFileSync(path.join(outDir,name),content,"utf8");
  }
  fs.writeFileSync(
    path.join(outDir,"release-manifest.json"),
    JSON.stringify(bundle.manifest,null,2)+"\n"
  );

  return bundle;
}

if(require.main===module){
  const outDir=process.argv[2]||path.join(ROOT,"generated");
  const base=process.argv[3]||process.env.PUBLIC_API_BASE||DEFAULT_BASE;
  const bundle=writeReleaseBundle(outDir,base);
  console.log(JSON.stringify({
    ok:true,
    outDir,
    productCount:bundle.manifest.product_count,
    products:bundle.manifest.products.map(p=>p.number+" "+p.id),
    paths:Object.keys(bundle.openapi.paths),
    files:[...Object.keys(bundle.canonicalFiles),"release-manifest.json"].sort()
  },null,2));
}

module.exports={expectedAtomic,buildReleaseBundle,writeReleaseBundle};
