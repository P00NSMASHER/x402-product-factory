'use strict';
// Synthetically manufacture and route real, distinct app versions without a hosted deployment.
const path=require('node:path');
const {rehearseSyntheticVersions}=require('../packages/application-factory/deploy/versioned');
function main(args=process.argv.slice(2)){
 if(!Array.isArray(args)||args.length!==8)throw Error('USAGE_INVALID');
 const allowed=new Set(['--document','--quote','--inventory','--output']),params=Object.create(null);
 for(let i=0;i<args.length;i+=2){
  const key=args[i],value=args[i+1];
  if(!allowed.has(key)||Object.hasOwn(params,key)||typeof value!=='string'||
     !path.isAbsolute(value))throw Error('USAGE_INVALID');
  params[key]=value;
 }
 if(Object.keys(params).length!==4)throw Error('USAGE_INVALID');
 return rehearseSyntheticVersions({baselineRoots:{document:params['--document'],
  quote:params['--quote'],inventory:params['--inventory']},outputRoot:params['--output']});
}
if(require.main===module){
 try{console.log(JSON.stringify(main(),null,2));}
 catch(error){const code=typeof error?.message==='string'&&/^VERSION_[A-Z_]+$/.test(error.message)?error.message:'VERSION_UNKNOWN';console.error('Versioned local rehearsal blocked: '+code+'. No external deployment.');process.exitCode=1;}
}
module.exports={main};
