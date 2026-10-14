'use strict';
// Operator-only, offline integration for an existing CI run. Never changes a task or schedule.
const {planBackfill,runBackfill}=require('../packages/application-factory/autonomy/backfill');
function main(argv=process.argv.slice(2)){
 if(!Array.isArray(argv))throw Error('USAGE_INVALID');
 let planOnly=false;const args=Object.create(null);
 for(let i=0;i<argv.length;i++){
  const key=argv[i];
  if(key==='--plan-only'){if(planOnly)throw Error('USAGE_INVALID');planOnly=true;continue;}
  if(!['--output','--at','--max-builds','--window-cycles'].includes(key)||
     Object.hasOwn(args,key)||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('USAGE_INVALID');
  args[key]=argv[++i];
 }
 if(!args['--output'])throw Error('PRIVATE_OUTPUT_REQUIRED');
 const options={outputRoot:args['--output'],
  ...(args['--at']?{at:args['--at']}:{})};
 if(args['--max-builds']!==undefined)options.maxBuilds=Number(args['--max-builds']);
 if(args['--window-cycles']!==undefined)options.windowCycles=Number(args['--window-cycles']);
 return planOnly?planBackfill(options):runBackfill(options);
}
if(require.main===module){
 try{console.log(JSON.stringify(main(),null,2));}
 catch{console.error('Missed-cycle recovery blocked unsafe state or unverified package acceptance. No external operation executed.');process.exitCode=1;}
}
module.exports={main};
