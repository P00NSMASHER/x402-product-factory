'use strict';
// Bounded read-only selection or independently executed single cross-family build.
const path=require('node:path');
const {planCrossCycle,runCrossCycle}=require('../packages/application-factory/autonomy/cross-cycle');
function main(argv=process.argv.slice(2)){
 if(!Array.isArray(argv)||!['--plan','--run'].includes(argv[0])||
   argv.length<1||(argv.length-1)%2!==0)throw Error('USAGE_INVALID');
 const mode=argv[0],opts=Object.create(null);
 for(let i=1;i<argv.length;i+=2){
  if(!['--at','--output'].includes(argv[i])||Object.hasOwn(opts,argv[i])||
     typeof argv[i+1]!=='string'||!argv[i+1])throw Error('USAGE_INVALID');
  opts[argv[i]]=argv[i+1];
 }
 if(opts['--output']!==undefined&&!path.isAbsolute(opts['--output']))throw Error('USAGE_INVALID');
 if(mode==='--run'&&!opts['--output'])throw Error('USAGE_INVALID');
 const at=opts['--at']||new Date().toISOString().replace(/\.\d{3}Z$/,'Z');
 return mode==='--run'?
  runCrossCycle({at,outputRoot:opts['--output']}):
  planCrossCycle({at,...(opts['--output']?{outputRoot:opts['--output']}: {})});
}
if(require.main===module){
 try{console.log(JSON.stringify(main(),null,2));}
 catch{console.error('Cross-family director failed a source, acceptance, state, or release boundary; no contact or deployment.');process.exitCode=1;}
}
module.exports={main};
