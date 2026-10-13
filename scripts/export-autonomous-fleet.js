'use strict';
// Creates one dated, read-only offline app-fleet report; never a production sales dashboard.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {buildFleet,renderFleetHtml}=require('../packages/application-factory/autonomy/fleet');
const fail=code=>{throw Error(code);},hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function privateParent(target){
 if(typeof target!=='string'||!path.isAbsolute(target))fail('FLEET_OUTPUT_UNSAFE');
 const parent=path.dirname(path.resolve(target));fs.mkdirSync(parent,{recursive:true,mode:0o700});
 const stat=fs.lstatSync(parent);
 if(!stat.isDirectory()||stat.isSymbolicLink()||fs.realpathSync(parent)!==parent||
    (process.platform!=='win32'&&(stat.mode&0o077)!==0))fail('FLEET_OUTPUT_UNSAFE');
 if(fs.existsSync(target))fail('FLEET_OUTPUT_EXISTS');
 return parent;
}
function main(args=process.argv.slice(2)){
 if(!Array.isArray(args)||args.length<4||args.length%2!==0)fail('USAGE_INVALID');
 const input=Object.create(null),allowed=['--state-dir','--output-dir','--at','--lookback'];
 for(let i=0;i<args.length;i+=2){
  if(!allowed.includes(args[i])||Object.hasOwn(input,args[i])||
     typeof args[i+1]!=='string'||!args[i+1]||args[i+1].startsWith('--'))fail('USAGE_INVALID');
  input[args[i]]=args[i+1];
 }
 if(!input['--state-dir']||!input['--output-dir']||!path.isAbsolute(input['--state-dir']))fail('USAGE_INVALID');
 const stateStat=fs.lstatSync(input['--state-dir']);
 if(!stateStat.isDirectory()||stateStat.isSymbolicLink())fail('FLEET_OUTPUT_UNSAFE');
 const lookbackCycles=input['--lookback']===undefined?24:Number(input['--lookback']);
 const report=buildFleet({outputRoot:input['--state-dir'],
   ...(input['--at']?{at:input['--at']}:{}),lookbackCycles});
 const folder=path.resolve(input['--output-dir']),parent=privateParent(folder);
 const stage=fs.mkdtempSync(path.join(parent,'.fleet-stage-'));
 try{
  const files={'index.html':renderFleetHtml(report),'fleet.json':JSON.stringify(report,null,2)+'\n'};
  const manifest={schemaVersion:1,kind:'offline-autonomous-fleet-export',
   files:Object.fromEntries(Object.entries(files).map(([n,body])=>[n,hash(body)])),
   realCustomers:null,collectedRevenue:null,releaseApproved:false,transmittedMessages:0,paymentsSent:0};
  files['integrity.json']=JSON.stringify(manifest,null,2)+'\n';
  for(const [name,content] of Object.entries(files)){
   const fd=fs.openSync(path.join(stage,name),'wx',0o600);
   try{fs.writeFileSync(fd,content);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  }
  if(fs.existsSync(folder))fail('FLEET_OUTPUT_EXISTS');
  fs.renameSync(stage,folder);
  return {kind:'offline-autonomous-fleet-export',verifiedApps:report.summary.verifiedApps,
   pending:report.summary.pendingApps,quarantined:report.summary.quarantinedApps,
   realCustomers:null,collectedRevenue:null,releaseApproved:false,transmittedMessages:0,paymentsSent:0};
 }finally{if(fs.existsSync(stage))fs.rmSync(stage,{recursive:true,force:true});}
}
if(require.main===module){
 try{console.log(JSON.stringify(main(),null,2));}
 catch{console.error('Fleet report refused unsafe or corrupted local state; no network or commercial action.');process.exitCode=1;}
}
module.exports={main};
