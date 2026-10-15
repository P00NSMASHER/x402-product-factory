'use strict';
// Import only independently reverified, source-pinned quote and inventory package history.
const path=require('node:path');
const {restoreCrossCheckpoint}=require('../packages/application-factory/autonomy/cross-checkpoint');
function main(args=process.argv.slice(2)){
 if(!Array.isArray(args)||args.length<4||args.length%2)throw Error('USAGE_INVALID');
 const opts=Object.create(null);
 for(let i=0;i<args.length;i+=2){
  if(!['--source','--output','--max-slots'].includes(args[i])||
    Object.hasOwn(opts,args[i])||typeof args[i+1]!=='string'||!args[i+1])
    throw Error('USAGE_INVALID');
  opts[args[i]]=args[i+1];
 }
 if(!opts['--source']||!opts['--output']||!path.isAbsolute(opts['--source'])||
  !path.isAbsolute(opts['--output']))throw Error('USAGE_INVALID');
 const maxSlots=opts['--max-slots']===undefined?24:Number(opts['--max-slots']);
 if(!/^(?:[1-9]|[12]\d|3[0-2])$/.test(String(maxSlots)))throw Error('USAGE_INVALID');
 return restoreCrossCheckpoint({sourceRoot:opts['--source'],outputRoot:opts['--output'],maxSlots});
}
if(require.main===module){
 try{console.log(JSON.stringify(main(),null,2));}
 catch{console.error('Cross-family checkpoint rejected a stale, corrupt, or unsafe previous run; no external action.');process.exitCode=1;}
}
module.exports={main};
