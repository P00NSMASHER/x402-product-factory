'use strict';
// An owner-controlled HTTPS private-network ingress is required; never bind publicly.
const path=require('node:path');
const {launchPrivateFleet}=require('../packages/application-factory/deploy/fleet-preview');
const {createRemoteGateway,externalURL}=require('../packages/application-factory/deploy/remote-gateway');
function parse(argv){
 if(!Array.isArray(argv)||argv[0]!=='--serve'||argv.length!==19)throw Error('USAGE_INVALID');
 const opts=Object.create(null);
 for(let i=1;i<argv.length;i+=2){
  const key=argv[i],value=argv[i+1];
  if(!['--document','--quote','--inventory','--state-root','--family','--id','--external-origin','--port','--minutes'].includes(key)||
     Object.hasOwn(opts,key)||typeof value!=='string'||!value)throw Error('USAGE_INVALID');
  opts[key]=value;
 }
 for(const key of ['--document','--quote','--inventory','--state-root'])if(!path.isAbsolute(opts[key]||''))throw Error('USAGE_INVALID');
 if(!['document','quote','inventory'].includes(opts['--family'])||
    !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(opts['--id']||''))throw Error('USAGE_INVALID');
 if(!/^\d{1,5}$/.test(opts['--port']||'')||Number(opts['--port'])<1||Number(opts['--port'])>65535)throw Error('USAGE_INVALID');
 if(!/^\d{1,2}$/.test(opts['--minutes']||'')||Number(opts['--minutes'])<1||Number(opts['--minutes'])>60)throw Error('USAGE_INVALID');
 externalURL(opts['--external-origin']);
 return {sources:{document:opts['--document'],quote:opts['--quote'],inventory:opts['--inventory']},
  stateRoot:opts['--state-root'],family:opts['--family'],id:opts['--id'],
  externalOrigin:opts['--external-origin'],port:Number(opts['--port']),minutes:Number(opts['--minutes'])};
}
async function main(argv=process.argv.slice(2)){
 const options=parse(argv),fleet=await launchPrivateFleet({sources:options.sources,stateRoot:options.stateRoot});
 let gateway;
 try{gateway=await createRemoteGateway({fleet,family:options.family,id:options.id,externalOrigin:options.externalOrigin,listenPort:options.port});}
 catch(error){await fleet.stop();throw error;}
 process.stdout.write(JSON.stringify({kind:'owner-local-remote-gateway',
  gatewayLoopbackOrigin:gateway.origin,configuredExternalOrigin:gateway.externalOrigin,
  remoteReachabilityVerified:false,requiresPrivateTlsIngress:true,
  app:{family:gateway.family,id:gateway.id},
  selectedAppCredentialFile:fleet.apps.find(app=>app.family===gateway.family&&app.id===gateway.id).privateCredentialFile,
  gatewayLoginCodeFile:gateway.loginCodeFile,sessionMinutes:30,maximumServiceMinutes:options.minutes,
  syntheticOnly:true,releaseApproved:false,customerActivationEnabled:false,paymentsEnabled:false})+'\n');
 await new Promise((resolve,reject)=>{
  let done=false;const timer=setTimeout(end,options.minutes*60*1000);
  async function end(){if(done)return;done=true;clearTimeout(timer);
   try{await gateway.close();await fleet.stop();resolve();}catch(error){reject(error);}}
  process.once('SIGINT',end);process.once('SIGTERM',end);
 });
 return {kind:'owner-local-remote-gateway-stopped',syntheticOnly:true};
}
if(require.main===module)main().catch(()=>{console.error('Remote demo rejected unsafe input or failed. Nothing was published.');process.exitCode=1;});
module.exports={parse,main};
