'use strict';
// This command can only READ GitHub and write a local redacted private report.
// A clean report NEVER authorizes public deployment, outreach, money or merges.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const audit=require('../quality/governance/application-production-audit');
const manifest=require('../quality/governance/application-production-manifest.json');
const ROOT=path.resolve(__dirname,'..');
const fail=c=>{throw Error('APP_INTEGRATION_'+c);};
function parse(argv=process.argv.slice(2)){
 if(!Array.isArray(argv)||argv.length<1||argv[0]!=='--audit-live')fail('USAGE_INVALID');
 const options={output:null,requireIntegrated:false};
 for(let i=1;i<argv.length;i++){
  if(argv[i]==='--require-integrated'&&!options.requireIntegrated)options.requireIntegrated=true;
  else if(argv[i]==='--output'&&options.output===null&&
    typeof argv[i+1]==='string'&&path.isAbsolute(argv[i+1]))options.output=argv[++i];
  else fail('USAGE_INVALID');
 }
 if(options.output===null)fail('USAGE_INVALID');
 const abs=path.resolve(options.output),relative=path.relative(ROOT,abs);
 if(relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))
  fail('PATH_UNSAFE');
 return {...options,output:abs};
}
function privateSave(filename,report){
 const parent=path.dirname(filename);
 let st;
 try{st=fs.lstatSync(parent);}catch{fail('PATH_UNSAFE');}
 if(!st.isDirectory()||st.isSymbolicLink()||
   fs.realpathSync(parent)!==parent||
   (process.platform!=='win32'&&((st.mode&0o077)!==0||
      (typeof process.getuid==='function'&&st.uid!==process.getuid()))))
  fail('PATH_UNSAFE');
 if(fs.existsSync(filename))fail('OUTPUT_EXISTS');
 if(report?.productionReady!==false||report?.releaseApproved!==false||
    report?.automaticMergesAllowed!==false||report?.externalContacts!==0||
    report?.mergesPerformed!==0||report?.deploymentsPerformed!==0||
    report?.product025Unlocked!==false)fail('UNSAFE_REPORT');
 const envelope={kind:'private-readonly-app-integration-evidence',
   digest:crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex'),
   report,independentSignature:false,productionAuthorization:false};
 const fd=fs.openSync(filename,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify(envelope,null,2)+'\n');fs.fsyncSync(fd);}
 finally{fs.closeSync(fd);}
 return envelope;
}
async function main(argv=process.argv.slice(2),{auditImpl=audit.auditLive,token=process.env.GITHUB_TOKEN}={}){
 const options=parse(argv);
 audit.validateManifest(manifest);
 const report=await auditImpl(manifest,{token});
 if(!report||typeof report!=='object')fail('REPORT_MISSING');
 const proof=privateSave(options.output,report);
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    audit.markdown(report),'utf8');
 return {kind:proof.kind,candidatePr:report.candidatePr,
  canonicalStackChecked:report.canonicalStackChecked,
  exactHeadWorkflowPasses:report.candidateWorkflowsPassed,
  exactHeadWorkflowRequirements:report.candidateWorkflowCount,
  mainCommitsBehind:report.candidateBehindBy,
  unresolvedFindings:report.findings.length,
  githubReadRequests:report.githubReadRequests??null,
  status:report.releaseStatus,
  privateReportWritten:true,
  sourceIntegrationReady:report.sourceIntegrationReady===true,
  productionReady:false,releaseApproved:false,externalContacts:0,
  paymentsSent:0,mergesPerformed:0,deploymentsPerformed:0,
  product025Unlocked:false,
  requireIntegratedFailed:options.requireIntegrated&&report.sourceIntegrationReady!==true};
}
if(require.main===module)main().then(x=>{
 console.log(JSON.stringify(x,null,2));
 if(x.requireIntegratedFailed)process.exitCode=2;
}).catch(e=>{
 console.error(e?.message?.startsWith('APP_INTEGRATION_')?
   'INTEGRATION_READ_ONLY_HOLD':'INTEGRATION_SOURCE_UNAVAILABLE');
 process.exitCode=2;
});
module.exports={parse,privateSave,main};
