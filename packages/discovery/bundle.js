"use strict";

const crypto=require("node:crypto");
const {
  buildCatalog,
  buildOpenApi,
  buildLlmsText,
  buildProductIndex,
  managedProducts,
}=require("./generator");

function stableJson(value){
  return JSON.stringify(value,null,2)+"\n";
}

function sha256(content){
  return crypto.createHash("sha256").update(content,"utf8").digest("hex");
}

function buildDeploymentBundle(base){
  const catalog=stableJson(buildCatalog(base));
  const openapi=stableJson(buildOpenApi(base));
  const llms=buildLlmsText(base)+"\n";
  const products=managedProducts().map(p=>({
    number:p.number,
    id:p.id,
    method:p.method,
    path:p.path,
    price_usdc:p.price_usdc,
    status:p.status,
    required_env:Array.isArray(p.required_env)?p.required_env:[],
    deployment_requirements:Array.isArray(p.deployment_requirements)?p.deployment_requirements:[]
  }));
  const publicIndex=buildProductIndex(base);
  const productIndex=stableJson({
    ...publicIndex,
    products:products.map((product)=>({
      ...publicIndex.products.find((row)=>row.id===product.id),
      required_env:product.required_env,
      deployment_requirements:product.deployment_requirements
    }))
  });

  const files={
    "x402-catalog.json":catalog,
    "openapi.json":openapi,
    "llms.txt":llms,
    "product-index.json":productIndex
  };

  const hashes={};
  for(const [name,content] of Object.entries(files)) hashes[name]=sha256(content);

  const manifest=stableJson({
    schema_version:1,
    base_url:String(base).replace(/\/$/,""),
    generated_products:products.map(p=>p.number),
    product_count:products.length,
    files:Object.entries(hashes).map(([name,sha256])=>({name,sha256}))
  });
  files["bundle-manifest.json"]=manifest;

  return {files,hashes:{...hashes,"bundle-manifest.json":sha256(manifest)},products};
}

module.exports={stableJson,sha256,buildDeploymentBundle};
