'use strict';
// Validate source-controlled idea research, optionally build 3 newest candidates with real packaged acceptance.
// No external communications, real buyers, checkout, deployment, access tokens, or arbitrary code.
const path=require('node:path');
const {buildCandidateCatalog}=require('../packages/application-factory/autonomy/catalog');
const {loadIdeaBacklog}=require('../packages/application-factory/autonomy/ideas');
const {runCycle}=require('../packages/application-factory/autonomy/loop');
const START=Date.parse('2026-10-13T00:00:00Z'),SLOT=21600000;
const DEFAULT=path.resolve(__dirname,'../packages/application-factory/autonomy/ideas');
const fail=code=>{throw new Error(code);};
function admission(directory){
 return loadIdeaBacklog({directory,existingRecipes:buildCandidateCatalog()});
}
function auditBacklog({directory=DEFAULT}={}){
 const rows=admission(directory);
 return {kind:'unverified-autonomy-blueprint-inbox',admitted:rows.length,
   cycles:rows.map(v=>v.cycle),newestIdeaId:rows.at(-1)?.recipe.id||null,
   newestCycle:rows.at(-1)?.cycle??null,
   commercialValidation:'unverified',marketValidated:false,
   realCustomers:null,collectedRevenue:null,
   outreachEnabled:false,checkoutEnabled:false,externalMessagesSent:0,
   paymentsSent:0,releaseApproved:false};
}
function runPending({directory=DEFAULT,outputRoot,accept}={}){
 if(typeof outputRoot!=='string'||!path.isAbsolute(outputRoot))fail('PRIVATE_OUTPUT_REQUIRED');
 const rows=admission(directory),selected=rows.slice(-3);
 const outcomes=[];
 for(const item of selected){
   const at=new Date(START+item.cycle*SLOT).toISOString();
   const r=runCycle({at,blueprintDirectory:directory,outputRoot,...(accept?{accept}:{})});
   if(r.planned!==1||r.accepted!==1||r.failed!==0||r.artifacts?.length!==1||
      r.ideaDigest!==item.digest||(accept?r.verification!=='injected-test-only':r.verification!=='executed-packaged-workflow')||
      r.marketValidated!==false||r.releaseApproved!==false||r.transmittedMessages!==0||r.paymentsSent!==0)fail('IDEA_PREVIEW_FAILED');
   outcomes.push({cycle:item.cycle,id:item.recipe.id,digest:item.digest,
     artifact:r.artifacts[0].artifact,verification:r.verification,reused:r.reused});
 }
 return {kind:'autonomous-idea-preview',admitted:rows.length,previewLimit:3,planned:selected.length,
   accepted:outcomes.length,failed:0,results:outcomes,
   verification:accept?'injected-test-only':selected.length?'executed-packaged-workflow':'no-ideas',
   marketValidated:false,realCustomers:null,collectedRevenue:null,externalMessagesSent:0,
   transmittedMessages:0,paymentsSent:0,releaseApproved:false};
}
function main(args=process.argv.slice(2)){
 if(args.length===0||(args.length===1&&args[0]==='--check'))return auditBacklog();
 if(args.length===3&&args[0]==='--build-pending'&&args[1]==='--output'&&
    typeof args[2]==='string'&&path.isAbsolute(args[2]))return runPending({outputRoot:args[2]});
 fail('USAGE_INVALID');
}
if(require.main===module){
 try{console.log(JSON.stringify(main(),null,2));}
 catch{console.error('Autonomous blueprint admission or packaged verification failed. No external action performed.');process.exitCode=1;}
}
module.exports={auditBacklog,runPending,main};
