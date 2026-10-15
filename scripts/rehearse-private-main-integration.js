'use strict';
// Purely local Git object-level integration DRY RUN.
// DOES NOT check out, merge a branch, update a ref, push, deploy, contact or spend.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const fail=code=>{throw Error('FACTORY_MERGE_DRYRUN_'+code);};
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
function git(args,{cwd=process.cwd(),timeout=45000}={}){
 if(!Array.isArray(args)||args.some(x=>typeof x!=='string'))fail('ARGS_INVALID');
 const x=spawnSync('git',args,{cwd,encoding:'utf8',timeout,maxBuffer:3000000,
   windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
 if(x.error||![0,1].includes(x.status))fail('GIT_UNAVAILABLE');
 return {status:x.status,stdout:String(x.stdout),stderr:String(x.stderr)};
}
function one(args,options){
 const x=git(args,options);
 if(x.status!==0)fail('GIT_REFS_UNAVAILABLE');
 const value=x.stdout.trim();
 if(value.length>200)fail('GIT_REF_INVALID');
 return value;
}
function safePath(input){
 if(typeof input!=='string'||input.length>200||input.startsWith('/')||
    input.includes('..')||!/^[A-Za-z0-9._/-]+$/.test(input))return null;
 return input;
}
function assess({cwd=process.cwd(),mainRef='refs/remotes/origin/main',candidateRef='HEAD'}={}){
 if(typeof cwd!=='string'||!path.isAbsolute(cwd)||
   mainRef!=='refs/remotes/origin/main'||candidateRef!=='HEAD')
  fail('INPUT_UNSAFE');
 const main=one(['rev-parse','--verify',mainRef],{cwd});
 const candidate=one(['rev-parse','--verify',candidateRef],{cwd});
 if(!/^[a-f0-9]{40}$/.test(main)||!/^[a-f0-9]{40}$/.test(candidate))
  fail('GIT_REF_INVALID');
 const ahead=Number(one(['rev-list','--count',main+'..'+candidate],{cwd}));
 const behind=Number(one(['rev-list','--count',candidate+'..'+main],{cwd}));
 if(!Number.isSafeInteger(ahead)||ahead<0||!Number.isSafeInteger(behind)||behind<0)
  fail('GIT_HISTORY_INVALID');
 const before=one(['rev-parse',candidateRef],{cwd});
 const result=git(['merge-tree','--write-tree',main,candidate],{cwd,timeout:60000});
 const after=one(['rev-parse',candidateRef],{cwd});
 if(before!==after)fail('GIT_HEAD_CHANGED');
 const lines=result.stdout.split(/\r?\n/),wouldBeTree=lines[0]?.trim();
 if(!/^[a-f0-9]{40}$/.test(wouldBeTree))fail('GIT_MERGE_RESULT_INVALID');
 const conflicting=lines.filter(v=>v.startsWith('CONFLICT ('));
 const paths=[...new Set(conflicting.map(s=>{
  const v=s.match(/Merge conflict in (.+)$/);
  return v?safePath(v[1]):null;
 }).filter(Boolean))].sort();
 const clean=result.status===0&&conflicting.length===0;
 if(result.status===1&&conflicting.length===0)fail('GIT_UNCLASSIFIED_CONFLICT');
 if(result.status===0&&conflicting.length>0)fail('GIT_RESULT_MISMATCH');
 return {schemaVersion:1,kind:'git-object-only-integration-rehearsal',
  mainHead:main,candidateHead:candidate,
  candidateAheadBy:ahead,candidateBehindBy:behind,
  cleanMergePossible:clean,conflictsReported:conflicting.length,conflictPaths:paths,
  mergeTreeObject:wouldBeTree,sourceRefUnchanged:true,
  worktreeModified:false,mainRefModified:false,branchCreated:false,
  mergerInvoked:'git merge-tree --write-tree',
  releaseApproved:false,productionReady:false,autonomousPublicDeploymentEnabled:false,
  externalContacts:0,paymentsSent:0,gitRefsUpdated:0,deploymentsPerformed:0,
  product025Unlocked:false};
}
function parse(argv=process.argv.slice(2)){
 if(!Array.isArray(argv)||argv.length!==2||argv[0]!=='--output'||
   typeof argv[1]!=='string'||!path.isAbsolute(argv[1]))fail('USAGE_INVALID');
 const output=path.resolve(argv[1]),base=path.dirname(output),stat=fs.lstatSync(base);
 if(!stat.isDirectory()||stat.isSymbolicLink()||fs.realpathSync(base)!==base||
    (process.platform!=='win32'&&((stat.mode&0o077)!==0||
     (typeof process.getuid==='function'&&stat.uid!==process.getuid()))))
  fail('OUTPUT_UNSAFE');
 if(fs.existsSync(output))fail('OUTPUT_EXISTS');
 return {output};
}
function main(argv=process.argv.slice(2),{cwd=process.cwd()}={}){
 const {output}=parse(argv),report=assess({cwd});
 const envelope={kind:'private-readonly-git-merge-rehearsal',
  digest:hash(JSON.stringify(report)),report,
  independentSignature:false,productionAuthorization:false};
 const fd=fs.openSync(output,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify(envelope,null,2)+'\n');fs.fsyncSync(fd);}
 finally{fs.closeSync(fd);}
 return {kind:report.kind,mainHead:report.mainHead,candidateHead:report.candidateHead,
  ahead:report.candidateAheadBy,behind:report.candidateBehindBy,
  gitMergeWouldBeClean:report.cleanMergePossible,conflicts:report.conflictsReported,
  conflictPaths:report.conflictPaths,releaseApproved:false,
  externalContacts:0,gitRefsUpdated:0,deploymentsPerformed:0};
}
if(require.main===module){
 try{console.log(JSON.stringify(main(),null,2));}
 catch{console.error('Private Git merge rehearsal blocked on source history or unexpected merge output; no refs changed.');process.exitCode=2;}
}
module.exports={git,one,safePath,assess,parse,main};
