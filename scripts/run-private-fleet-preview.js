'use strict';
// Run independently accepted SaaS candidates as one local synthetic operator preview.
const path=require('node:path');
const {launchPrivateFleet}=require('../packages/application-factory/deploy/fleet-preview');
const fail=c=>{throw Error(c);};
function parse(argv){
 if(!Array.isArray(argv)||argv.length<9||!['--exercise','--serve'].includes(argv[0])||(argv.length-1)%2)
  fail('USAGE_INVALID');
 const mode=argv[0],opts=Object.create(null);
 for(let i=1;i<argv.length;i+=2){
  const flag=argv[i],value=argv[i+1];
  if(!['--document','--quote','--inventory','--state-root','--port'].includes(flag)||
   Object.hasOwn(opts,flag)||typeof value!=='string'||!value)fail('USAGE_INVALID');
  opts[flag]=value;
 }
 for(const flag of ['--document','--quote','--inventory','--state-root'])
  if(typeof opts[flag]!=='string'||!path.isAbsolute(opts[flag]))fail('USAGE_INVALID');
 if(mode==='--exercise'&&opts['--port']!==undefined)fail('USAGE_INVALID');
 if(mode==='--serve'&&opts['--port']!==undefined&&
  (!/^\d{1,5}$/.test(opts['--port'])||Number(opts['--port'])>65535))fail('USAGE_INVALID');
 return {mode,sources:{document:opts['--document'],quote:opts['--quote'],inventory:opts['--inventory']},
  stateRoot:opts['--state-root'],portalPort:opts['--port']===undefined?0:Number(opts['--port'])};
}
async function exercise(fleet){
 const origin=fleet.origin,health=await fetch(origin+'/health',{signal:AbortSignal.timeout(4000)});
 const body=await health.json();
 if(health.status!==200||body.status!=='ok'||body.appCount!==fleet.apps.length||
    body.releaseApproved!==false||body.publicHostingEnabled!==false)fail('PREVIEW_REHEARSAL_FAILED');
 const ui=await fetch(origin+'/',{signal:AbortSignal.timeout(4000)});
 const html=await ui.text();
 if(ui.status!==200||!html.includes('Application factory · private fleet')||
    !/default-src 'none'/.test(ui.headers.get('content-security-policy')||'')||
    !html.includes('Release status: HOLD')||html.match(/<article /g)?.length!==fleet.apps.length)
  fail('PREVIEW_REHEARSAL_FAILED');
 const hostile=await fetch(origin+'/health',{headers:{Origin:'https://outside.invalid'},signal:AbortSignal.timeout(4000)});
 if(hostile.status!==403)fail('PREVIEW_REHEARSAL_FAILED');
 const missing=await fetch(origin+'/api',{signal:AbortSignal.timeout(4000)});
 if(missing.status!==404)fail('PREVIEW_REHEARSAL_FAILED');
 return {kind:'executed-private-fleet-preview',passed:true,apps:fleet.apps.length,sourceDigestsVerified:true,
  privateAppCredentialFilesCreated:fleet.apps.length,portalLoopbackOnly:true,
  distinctLocalServiceOrigins:new Set(fleet.apps.map(a=>a.origin)).size===fleet.apps.length,
  sourceHashedReportDigest:fleet.report.digest,
  externalMessagesSent:0,paymentsSent:0,realCustomers:null,collectedRevenue:null,
  publicHostingEnabled:false,releaseApproved:false};
}
async function main(argv=process.argv.slice(2)){
 const input=parse(argv),fleet=await launchPrivateFleet(input);
 if(input.mode==='--exercise'){
  try{return await exercise(fleet);}finally{await fleet.stop();}
 }
 process.stdout.write(JSON.stringify({kind:'local-private-app-portal',origin:fleet.origin,
  appCount:fleet.apps.length,stateDirectory:fleet.stateRoot,
  credentialFiles:fleet.apps.map(a=>({family:a.family,id:a.id,file:a.privateCredentialFile})),
  publicHostingEnabled:false,releaseApproved:false})+'\n');
 let done=false;
 await new Promise((resolve,reject)=>{
  async function close(){
   if(done)return;done=true;
   try{await fleet.stop();resolve();}catch(e){reject(e);}
  }
  process.once('SIGINT',close);process.once('SIGTERM',close);
 });
 return {kind:'private-preview-stopped',appCount:fleet.apps.length,releaseApproved:false};
}
if(require.main===module)main().then(result=>{
 if(result?.kind==='executed-private-fleet-preview')console.log(JSON.stringify(result,null,2));
}).catch(()=>{console.error('Private preview refused unsafe package, session or network request. Nothing was published.');process.exitCode=1;});
module.exports={parse,exercise,main};
