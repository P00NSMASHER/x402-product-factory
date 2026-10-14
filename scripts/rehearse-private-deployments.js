'use strict';
// No token flags, public deployments, environment inheritance, or remote targets.
const path=require('node:path');
const {rehearsePrivateDeployments}=require('../packages/application-factory/deploy/preview');
function main(args=process.argv.slice(2)){
 if(!Array.isArray(args)||args.length!==8)throw Error('USAGE_INVALID');
 const opts={};
 for(let i=0;i<args.length;i+=2){
  if(!['--document','--quote','--inventory','--output'].includes(args[i])||
     Object.hasOwn(opts,args[i])||!path.isAbsolute(args[i+1]||''))throw Error('USAGE_INVALID');
  opts[args[i]]=args[i+1];
 }
 if(Object.keys(opts).length!==4)throw Error('USAGE_INVALID');
 return rehearsePrivateDeployments({sources:{document:opts['--document'],quote:opts['--quote'],
  inventory:opts['--inventory']},outputRoot:opts['--output']});
}
if(require.main===module){
 try{console.log(JSON.stringify(main(),null,2));}
 catch{console.error('Private deployment rehearsal failed a source, role, HTTP or release gate. No hosted deployment occurred.');process.exitCode=1;}
}
module.exports={main};
