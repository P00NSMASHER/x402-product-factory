'use strict';
const path=require('node:path');
const {planCrossBackfill,runCrossBackfill}=require('../packages/application-factory/autonomy/cross-backfill');
function main(argv=process.argv.slice(2)){
 if(!Array.isArray(argv)||!['--plan','--run'].includes(argv[0])||
    argv.length<3||(argv.length-1)%2)throw Error('USAGE_INVALID');
 const mode=argv[0],args=Object.create(null);
 for(let i=1;i<argv.length;i+=2){
  if(!['--output','--at','--window-cycles','--max-builds'].includes(argv[i])||
    Object.hasOwn(args,argv[i])||typeof argv[i+1]!=='string'||!argv[i+1])
   throw Error('USAGE_INVALID');
  args[argv[i]]=argv[i+1];
 }
 if(!args['--output']||!path.isAbsolute(args['--output']))throw Error('USAGE_INVALID');
 for(const [name,max] of [['--window-cycles',8],['--max-builds',2]]){
  if(args[name]!==undefined&&!new RegExp('^[1-'+max+']$').test(args[name]))throw Error('USAGE_INVALID');
 }
 const options={at:args['--at']||new Date().toISOString(),
  outputRoot:args['--output'],
  windowCycles:args['--window-cycles']===undefined?8:Number(args['--window-cycles']),
  maxBuilds:args['--max-builds']===undefined?2:Number(args['--max-builds'])};
 return mode==='--plan'?planCrossBackfill(options):runCrossBackfill(options);
}
if(require.main===module){
 try{console.log(JSON.stringify(main(),null,2));}
 catch{console.error('Private late-build recovery refused unsafe state or proof; no external action.');process.exitCode=1;}
}
module.exports={main};
