"use strict";
const {writeBatch,compileBatch}=require("../packages/application-factory/generator");
const recipes=require("../packages/application-factory/recipes.json");
function main(args){
  if(args.length===1&&args[0]==="--check"){
    const built=compileBatch(recipes);
    return {ok:true,mode:"validate-only",editions:built.map(({id,digest})=>({id,digest})),releaseApproved:false};
  }
  if(args.length!==1||args[0].startsWith("--"))throw new Error("USAGE: node scripts/build-application-factory.js <new-output-directory> | --check");
  return writeBatch(recipes,args[0]);
}
if(require.main===module)console.log(JSON.stringify(main(process.argv.slice(2)),null,2));
module.exports={main};
