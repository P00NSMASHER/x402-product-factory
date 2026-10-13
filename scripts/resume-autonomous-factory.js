'use strict';
// Offline bounded work queue: recover missed six-hour builds using a PRIVATE persistent directory.
const {planRecovery,runRecovery}=require('../packages/application-factory/autonomy/supervisor');
function main(argv=process.argv.slice(2)){
 if(!Array.isArray(argv))throw Error('USAGE_INVALID');
 const args=Object.create(null);let planOnly=false;
 for(let i=0;i<argv.length;i++){
  const arg=argv[i];
  if(arg==='--plan-only'){
   if(planOnly)throw Error('USAGE_INVALID');
   planOnly=true;continue;
  }
  if(!['--output','--at','--window-cycles'].includes(arg)||Object.hasOwn(args,arg)||
     !argv[i+1]||argv[i+1].startsWith('--'))throw Error('USAGE_INVALID');
  args[arg]=argv[++i];
 }
 if(!args['--output'])throw Error('PRIVATE_OUTPUT_REQUIRED');
 const windowCycles=args['--window-cycles']===undefined?8:Number(args['--window-cycles']);
 const options={outputRoot:args['--output'],windowCycles,
   ...(args['--at']?{at:args['--at']}:{})};
 return planOnly?planRecovery(options):runRecovery(options);
}
if(require.main===module){
 try{
  const result=main();
  console.log(JSON.stringify(result,null,2));
  if(result.failed)process.exitCode=1;
 }catch{
  console.error('Recovery blocked an unsafe or invalid operation. Check the private directory, verified cycle receipts and source integrity.');
  process.exitCode=1;
 }
}
module.exports={main};
