'use strict';
// Promote source-verified local artifacts into a PRIVATE deployment rehearsal receipt.
// A rehearsal is NOT a cloud deployment or permission to contact customers.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {verifyApplication}=require('../manufacturing/assembler');
const {validReceipt}=require('../manufacturing/acceptance');
const {verifyQuoteApp,validAcceptance}=require('../quote-family/manufacturing');
const {verifyInventoryPackage,CHECKS}=require('../inventory-family/manufacturing');
const REPO=path.resolve(__dirname,'../../..');
const fail=code=>{throw Error(code);};
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const inside=(ancestor,item)=>{const r=path.relative(ancestor,item);return r===''||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));};
function privateDirectory(raw,code='DEPLOYMENT_PATH_UNSAFE'){
 if(typeof raw!=='string'||!path.isAbsolute(raw))fail(code);
 const d=path.resolve(raw),stat=fs.lstatSync(d);
 if(!stat.isDirectory()||stat.isSymbolicLink()||fs.realpathSync(d)!==d||
  (process.platform!=='win32'&&(stat.mode&0o077)!==0))fail(code);
 return d;
}
function safeJSON(name,max=65536){
 const stat=fs.lstatSync(name);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<2||stat.size>max||
  (process.platform!=='win32'&&(stat.mode&0o077)!==0))fail('DEPLOYMENT_RECEIPT_INVALID');
 try{return JSON.parse(fs.readFileSync(name,'utf8'));}catch{fail('DEPLOYMENT_RECEIPT_INVALID');}
}
const definitions={
 document:{kind:'full-stack-manufacturing',verification:'executed-packaged-workflow',
  rows:r=>r.results,verify:verifyApplication,receiptName:row=>row.artifact+'.json',
  receipt:(p,id,digest)=>validReceipt(p,id,digest)},
 quote:{kind:'quote-family-manufacturing',verification:'executed-packaged-quote-lifecycle',
  rows:r=>r.apps,verify:verifyQuoteApp,receiptName:row=>row.id+'.json',
  receipt:(p,id,digest)=>validAcceptance(p,id,digest)},
 inventory:{kind:'inventory-family-manufacturing',verification:'executed-packaged-inventory-lifecycle',
  rows:r=>r.results,verify:verifyInventoryPackage,receiptName:row=>row.artifact+'.json',
  receipt:(p,id,digest)=>p&&p.kind==='assembled-inventory-acceptance'&&p.passed===true&&
    p.recipeId===id&&p.artifactDigest===digest&&CHECKS.every(k=>p[k]===true)&&
    p.externalMessagesSent===0&&p.paymentsSent===0&&p.realCustomers===null&&
    p.collectedRevenue===null&&p.releaseApproved===false}
};
function verifyInputs(sources){
 if(!sources||Object.keys(sources).sort().join(',')!=='document,inventory,quote')fail('DEPLOYMENT_INPUT_INVALID');
 const groups=[];
 for(const family of ['document','quote','inventory']){
  const input=sources[family],d=privateDirectory(input),rel=path.relative(REPO,d);
  if(inside(REPO,d)||!rel)fail('DEPLOYMENT_PATH_UNSAFE');
  const def=definitions[family],report=safeJSON(path.join(d,'manufacturing-report.json'));
  if(report.kind!==def.kind||report.verification!==def.verification||report.failed!==0||
     report.releaseApproved!==false||report.realCustomers!==null||report.collectedRevenue!==null||
     report.paymentsSent!==0||report.accepted<1||report.accepted>3)fail('DEPLOYMENT_REPORT_INVALID');
  const rows=def.rows(report);
  if(!Array.isArray(rows)||rows.length!==report.accepted||
     new Set(rows.map(row=>row?.id)).size!==rows.length)fail('DEPLOYMENT_REPORT_INVALID');
  for(const row of rows){
   if(!row||row.status!=='accepted'||!/^[a-z][a-z0-9-]{1,60}$/.test(row.id)||
      !/^[0-9a-f]{64}$/.test(row.digest))fail('DEPLOYMENT_REPORT_INVALID');
   const artifact=row.id+'-'+row.digest;
   if(row.artifact!==undefined&&row.artifact!==artifact)fail('DEPLOYMENT_REPORT_INVALID');
   const pkg=privateDirectory(path.join(d,artifact),'DEPLOYMENT_PACKAGE_INVALID');
   if(!inside(d,pkg))fail('DEPLOYMENT_PACKAGE_INVALID');
   let manifest;
   try{manifest=def.verify(pkg,row.digest);}catch{fail('DEPLOYMENT_PACKAGE_INVALID');}
   if(manifest.recipeId!==row.id||manifest.releaseApproved!==false||
      (manifest.marketValidated!==undefined&&manifest.marketValidated!==false)||
      (manifest.marketValidation!==undefined&&manifest.marketValidation!=='unverified')||
      manifest.realCustomers!==null||manifest.collectedRevenue!==null)fail('DEPLOYMENT_PACKAGE_INVALID');
   const evidence=safeJSON(path.join(d,'verification',def.receiptName(row)));
   if(!def.receipt(evidence,row.id,row.digest))fail('DEPLOYMENT_RECEIPT_INVALID');
   groups.push({family,id:row.id,digest:row.digest,folder:pkg,verify:def.verify});
  }
 }
 if(groups.length<3||groups.length>9)fail('DEPLOYMENT_INPUT_INVALID');
 return groups;
}
function exercise(group){
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'factory-private-deploy-probe-'));
 try{
  const env={PATH:process.env.PATH||'',TZ:'UTC'};
  for(const key of ['SystemRoot','WINDIR','TMP','TEMP','TMPDIR'])if(process.env[key])env[key]=process.env[key];
  const child=spawnSync(process.execPath,[path.join(__dirname,'exercise.cjs'),group.family,
    group.folder,scratch,group.digest],{env,encoding:'utf8',timeout:15000,
    maxBuffer:128*1024,killSignal:'SIGKILL',windowsHide:true});
  if(child.error||child.status!==0)fail('DEPLOYMENT_BOOT_FAILED');
  let value;try{value=JSON.parse(child.stdout);}catch{fail('DEPLOYMENT_BOOT_FAILED');}
  if(value.kind!=='isolated-private-deployment-probe'||value.family!==group.family||
     value.id!==group.id||value.digest!==group.digest||value.passed!==true||
     value.restartsProbed!==2||value.loopbackOnly!==true||value.healthy!==true||
     value.hostGuard!==true||value.originGuard!==true||value.unauthorizedApiDenied!==true||
     value.productionApproved!==false||value.externalRequestsMadeByHarness!==0||
     value.transmittedMessages!==0||value.paymentsSent!==0||
     value.realCustomers!==null||value.collectedRevenue!==null||value.releaseApproved!==false)
    fail('DEPLOYMENT_PROBE_INVALID');
  try{group.verify(group.folder,group.digest);}catch{fail('DEPLOYMENT_PACKAGE_INVALID');}
  return {family:group.family,id:group.id,sourceDigest:group.digest,
    webProbesPassed:2,authorizationProbed:true,privateLoopbackOnly:true,
    integrityVerified:true,localPreviewReady:true,publicReleaseApproved:false};
 }finally{fs.rmSync(scratch,{recursive:true,force:true});}
}
function rehearsePrivateDeployments({sources,outputRoot}={}){
 if(typeof outputRoot!=='string'||!path.isAbsolute(outputRoot)||inside(REPO,path.resolve(outputRoot)))fail('DEPLOYMENT_PATH_UNSAFE');
 const dest=path.resolve(outputRoot);
 if(fs.existsSync(dest))fail('DEPLOYMENT_OUTPUT_EXISTS');
 // Verify the entire input fleet BEFORE starting any candidate or modifying output.
 const groups=verifyInputs(sources),parent=path.dirname(dest);
 fs.mkdirSync(parent,{recursive:true,mode:0o700});
 const stat=fs.lstatSync(parent);
 if(!stat.isDirectory()||stat.isSymbolicLink()||fs.realpathSync(parent)!==parent)fail('DEPLOYMENT_PATH_UNSAFE');
 const outcomes=groups.map(exercise),counts=Object.fromEntries(['document','quote','inventory'].map(
  name=>[name,outcomes.filter(r=>r.family===name).length]));
 const report={kind:'private-deployment-rehearsal',schemaVersion:1,mode:'synthetic-local-only',
  families:counts,stagedApps:outcomes.length,failed:0,results:outcomes,
  approvedDeploymentTarget:null,publicHostingEnabled:false,tlsValidated:false,
  realCustomerReady:false,rollbackExecuted:false,independentSecurityReview:false,
  manifestIntegrityVerified:true,localLoopbackVerified:true,sourceEvidence:'executed-receipts-plus-real-http-probes',
  realCustomers:null,collectedRevenue:null,marketValidated:false,
  outreachEnabled:false,transmittedMessages:0,paymentsSent:0,releaseApproved:false};
 report.digest=hash(JSON.stringify(report));
 const stage=fs.mkdtempSync(path.join(parent,'.private-deployment-stage-'));
 try{
  const summary='# Private synthetic deployment readiness\n\n'+
   'Each app was executed from its independently verified built package twice against a local 127.0.0.1 HTTP listener. The same private SQLite state was reopened after shutdown. Host/Origin denial, unauthenticated API rejection, browser CSP and /health were checked.\n\n'+
   'This is NOT a public deployment. No TLS, external hosting, uptime, remote backups, public ingress, customer consent, payment, security signoff, load testing or actual rollback across production versions is established. All promotion requires separate review and authorization.\n';
  for(const [name,content] of Object.entries({'deployment-report.json':JSON.stringify(report,null,2)+'\n',
   'RELEASE-HOLD.md':summary})){
   const fd=fs.openSync(path.join(stage,name),'wx',0o600);
   try{fs.writeFileSync(fd,content);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  }
  if(fs.existsSync(dest))fail('DEPLOYMENT_OUTPUT_EXISTS');
  fs.renameSync(stage,dest);
  return {kind:report.kind,stagedApps:report.stagedApps,failed:report.failed,
   digest:report.digest,publicHostingEnabled:false,releaseApproved:false,
   realCustomers:null,collectedRevenue:null,transmittedMessages:0,paymentsSent:0};
 }finally{if(fs.existsSync(stage))fs.rmSync(stage,{recursive:true,force:true});}
}
module.exports={rehearsePrivateDeployments,verifyInputs};
