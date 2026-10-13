'use strict';
// Offline only: schedule slot => one vetted workflow edition => real packaged execution.
// Does not deploy, send, charge, provision real buyers, or create paid product numbers.
const {planCycle,runCycle}=require('../packages/application-factory/autonomy/loop');
function main(argv=process.argv.slice(2)){
 if(!Array.isArray(argv))throw new Error('USAGE_INVALID');
 const params=Object.create(null);let planOnly=false;
 for(let i=0;i<argv.length;i++){
  const arg=argv[i];
  if(arg==='--plan-only'){
   if(planOnly)throw new Error('USAGE_INVALID');planOnly=true;continue;
  }
  if(!['--output','--at','--batch-size'].includes(arg)||Object.hasOwn(params,arg)||!argv[i+1]||argv[i+1].startsWith('--'))
   throw new Error('USAGE_INVALID');
  params[arg]=argv[++i];
 }
 const at=params['--at']||new Date().toISOString();
 const batchSize=params['--batch-size']===undefined?1:Number(params['--batch-size']);
 if(typeof batchSize!=='number'||!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>2)throw new Error('USAGE_INVALID');
 if(planOnly){
  if(params['--output'])throw new Error('USAGE_INVALID');
  return planCycle({at,batchSize});
 }
 if(!params['--output'])throw new Error('PRIVATE_OUTPUT_REQUIRED');
 return runCycle({at,batchSize,outputRoot:params['--output']});
}
if(require.main===module){
 try{
  const result=main();console.log(JSON.stringify(result,null,2));
  if(result.failed>0)process.exitCode=1;
 }catch(error){
  // Do not leak paths, credentials, private content or HTTP details on a scheduled runner.
  console.error('Autonomous manufacturing rejected invalid input or failed an integrity gate. Use a safe private output directory; inspect offline receipts.');
  process.exitCode=1;
 }
}
module.exports={main};
