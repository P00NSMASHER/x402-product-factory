'use strict';
// No network activity: ingest a previously extracted GitHub Actions artifact only after exact-code QA.
const {restoreCheckpoint}=require('../packages/application-factory/autonomy/checkpoint');
function main(args=process.argv.slice(2)){
 if(!Array.isArray(args)||args.length<4||args.length%2!==0)throw Error('USAGE_INVALID');
 const options=Object.create(null),allowed=['--source','--output','--max-cycles'];
 for(let i=0;i<args.length;i+=2){
  if(!allowed.includes(args[i])||Object.hasOwn(options,args[i])||
     typeof args[i+1]!=='string'||!args[i+1]||args[i+1].startsWith('--'))throw Error('USAGE_INVALID');
  options[args[i]]=args[i+1];
 }
 if(!options['--source']||!options['--output'])throw Error('USAGE_INVALID');
 const maxCycles=options['--max-cycles']===undefined?32:Number(options['--max-cycles']);
 return restoreCheckpoint({sourceRoot:options['--source'],outputRoot:options['--output'],maxCycles});
}
if(require.main===module){
 try{console.log(JSON.stringify(main(),null,2));}
 catch{console.error('Checkpoint restore blocked unsafe, incompatible or unverified prior state. No release performed.');process.exitCode=1;}
}
module.exports={main};
