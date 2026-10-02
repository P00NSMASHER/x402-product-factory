"use strict";

const {managedProducts}=require("../packages/discovery/generator");
const {STATIC_GET_PATHS}=require("../runtime/appdeploy-bridge");

function normalizeBase(base){
  if(typeof base!=="string"||!/^https:\/\//.test(base)){
    throw new TypeError("https public API base is required");
  }
  return base.replace(/\/$/,"");
}

function routeEntry(method,path){
  const key=method+" "+path;
  return [
    "  "+JSON.stringify(key)+":[",
    "    async ({query={},event={}}={}) => {",
    "      const runtime=await getRuntime();",
    "      return runtime.handle({method:"+JSON.stringify(method)+",path:"+JSON.stringify(path)+",query,event});",
    "    }",
    "  ]"
  ].join("\n");
}

function buildAppDeployEntrypoint(base){
  const publicApiBase=normalizeBase(base);
  const products=managedProducts();
  const entries=[];

  for(const path of STATIC_GET_PATHS){
    entries.push(routeEntry("GET",path));
  }
  for(const product of products){
    entries.push(routeEntry(product.method,product.path));
    entries.push(routeEntry("OPTIONS",product.path));
  }

  const source=[
    "import { router, secrets } from '@appdeploy/sdk';",
    "import { createFactoryRuntime } from './factory-runtime-bundle.js';",
    "",
    "const PUBLIC_API_BASE="+JSON.stringify(publicApiBase)+";",
    "let runtimePromise=null;",
    "",
    "async function getRuntime(){",
    "  if(!runtimePromise){",
    "    runtimePromise=(async()=>{",
    "      const names=await secrets.listSecretNames();",
    "      const secUserAgent=names.includes('SEC_USER_AGENT')",
    "        ? await secrets.readSecret('SEC_USER_AGENT')",
    "        : undefined;",
    "      return createFactoryRuntime({",
    "        publicApiBase:PUBLIC_API_BASE,",
    "        secUserAgent",
    "      });",
    "    })();",
    "  }",
    "  try{",
    "    return await runtimePromise;",
    "  }catch(error){",
    "    runtimePromise=null;",
    "    throw error;",
    "  }",
    "}",
    "",
    "export const handler=router({",
    entries.join(",\n"),
    "});",
    ""
  ].join("\n");

  return {
    source,
    publicApiBase,
    productCount:products.length,
    staticRouteCount:STATIC_GET_PATHS.length,
    paidRouteCount:products.length,
    optionsRouteCount:products.length,
    totalRouteCount:STATIC_GET_PATHS.length+2*products.length,
    productIds:products.map(p=>p.id)
  };
}

if(require.main===module){
  const base=process.argv[2]||process.env.PUBLIC_API_BASE||"https://candidate.example";
  const result=buildAppDeployEntrypoint(base);
  process.stdout.write(result.source);
}

module.exports={normalizeBase,routeEntry,buildAppDeployEntrypoint};
