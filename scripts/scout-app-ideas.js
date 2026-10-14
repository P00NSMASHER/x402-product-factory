'use strict';
// Source-controlled leads -> auto-reserved exact future UTC slots -> full independent packaged tests.
const path=require('node:path');
const {loadScoutedLeads,inspectScout}=require('../packages/application-factory/autonomy/scout');
const {runCycle}=require('../packages/application-factory/autonomy/loop');
const EPOCH=Date.parse('2026-10-13T00:00:00Z'),SLOT=21600000;
function main(args=process.argv.slice(2)){
 if(args.length===0||(args.length===1&&args[0]==='--check'))return inspectScout();
 if(args.length!==3||args[0]!=='--build'||args[1]!=='--output'||
    !path.isAbsolute(args[2]))throw Error('USAGE_INVALID');
 const rows=loadScoutedLeads().filter(x=>x.status==='admitted-unverified');
 const results=[];
 for(const row of rows){
  const report=runCycle({at:new Date(EPOCH+row.cycle*SLOT).toISOString(),outputRoot:args[2]});
  if(report.planned!==1||report.accepted!==1||report.failed!==0||
     report.ideaDigest!==row.digest||report.verification!=='executed-packaged-workflow'||
     report.realCustomers!==null||report.collectedRevenue!==null||
     report.releaseApproved!==false||report.paymentsSent!==0||report.transmittedMessages!==0)
    throw Error('SCOUT_PREVIEW_INVALID');
  results.push({cycle:row.cycle,id:row.recipe.id,
   artifact:report.artifacts[0].artifact,reused:report.reused,
   verification:report.verification,readinessScore:row.readinessScore});
 }
 return {kind:'unverified-scout-manufacturing',accepted:results.length,failed:0,results,
  verifiedPackages:results.length,independentMarketEvidence:false,marketValidated:false,
  realCustomers:null,collectedRevenue:null,paymentsSent:0,transmittedMessages:0,releaseApproved:false};
}
if(require.main===module){try{console.log(JSON.stringify(main(),null,2));}
 catch{console.error('Scout rejected unsafe source, duplicate workflow, or unverified package. No outside action was performed.');process.exitCode=1;}}
module.exports={main};
