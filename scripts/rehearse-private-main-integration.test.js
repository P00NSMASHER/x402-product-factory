'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const merge=require('./rehearse-private-main-integration');
function run(cwd,args){
 const z=spawnSync('git',args,{cwd,encoding:'utf8',timeout:8000});
 assert.equal(z.status,0,'isolated test Git setup failed');
 return z.stdout.trim();
}
function fixture(t,{conflict=false}={}){
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'private-integration-dry-run-'));
 t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
 run(cwd,['init','-q']);
 run(cwd,['config','user.email','private-test@example.invalid']);
 run(cwd,['config','user.name','Private Integration Test']);
 fs.writeFileSync(path.join(cwd,'shared.txt'),'original\n',{mode:0o600});
 run(cwd,['add','.']);run(cwd,['commit','-qm','base fixture']);
 run(cwd,['branch','-M','main']);
 run(cwd,['branch','candidate']);
 if(conflict)fs.writeFileSync(path.join(cwd,'shared.txt'),'main change\n');
 else fs.writeFileSync(path.join(cwd,'new-main.txt'),'main only\n');
 run(cwd,['add','.']);run(cwd,['commit','-qm','main only']);
 const main=run(cwd,['rev-parse','HEAD']);
 run(cwd,['checkout','-q','candidate']);
 if(conflict)fs.writeFileSync(path.join(cwd,'shared.txt'),'candidate change\n');
 else fs.writeFileSync(path.join(cwd,'new-candidate.txt'),'candidate only\n');
 run(cwd,['add','.']);run(cwd,['commit','-qm','candidate only']);
 const head=run(cwd,['rev-parse','HEAD']);
 // Only fake test-repo Git metadata changes. Real command never does update-ref.
 run(cwd,['update-ref','refs/remotes/origin/main',main]);
 return {cwd,main,head};
}
test('pure-object dry-run detects a clean private reconciliation without moving main or HEAD',t=>{
 const s=fixture(t),beforeStatus=run(s.cwd,['status','--porcelain']),
  beforeBranches=run(s.cwd,['branch','--list']);
 assert.equal(beforeStatus,'');
 const r=merge.assess({cwd:s.cwd});
 assert.equal(r.kind,'git-object-only-integration-rehearsal');
 assert.equal(r.cleanMergePossible,true);
 assert.equal(r.candidateAheadBy,1);assert.equal(r.candidateBehindBy,1);
 assert.equal(r.mainHead,s.main);assert.equal(r.candidateHead,s.head);
 assert.equal(r.conflictsReported,0);assert.deepEqual(r.conflictPaths,[]);
 assert.match(r.mergeTreeObject,/^[a-f0-9]{40}$/);
 assert.equal(r.releaseApproved,false);assert.equal(r.externalContacts,0);
 assert.equal(r.gitRefsUpdated,0);assert.equal(r.deploymentsPerformed,0);
 assert.equal(run(s.cwd,['rev-parse','HEAD']),s.head);
 assert.equal(run(s.cwd,['rev-parse','refs/remotes/origin/main']),s.main);
 assert.equal(run(s.cwd,['branch','--list']),beforeBranches);
 assert.equal(run(s.cwd,['status','--porcelain']),beforeStatus);
});
test('conflicting main updates fail safe and keep both histories untouched',t=>{
 const s=fixture(t,{conflict:true});
 const r=merge.assess({cwd:s.cwd});
 assert.equal(r.cleanMergePossible,false);
 assert.ok(r.conflictsReported>=1);
 assert.deepEqual(r.conflictPaths,['shared.txt']);
 assert.equal(r.sourceRefUnchanged,true);
 assert.equal(r.mainRefModified,false);
 assert.equal(r.worktreeModified,false);
 assert.equal(run(s.cwd,['rev-parse','HEAD']),s.head);
 assert.equal(run(s.cwd,['rev-parse','refs/remotes/origin/main']),s.main);
 assert.equal(fs.readFileSync(path.join(s.cwd,'shared.txt'),'utf8'),'candidate change\n');
 assert.equal(run(s.cwd,['status','--porcelain']),'');
});
test('strict private paths, fixed refs, unsupported tools and network/control flags are rejected',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'private-merge-input-test-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const output=path.join(root,'report.json');
 assert.deepEqual(merge.parse(['--output',output]),{output});
 for(const args of [
  [],['--output','relative'],
  ['--merge','--output',output],['--output',output,'--publish'],
  ['--output',path.resolve(__dirname,'../.env')],
  ['--output',output,'--send-email','buyer@example.invalid'],
  ['--output',output,'--approve-release']]){
  assert.throws(()=>merge.parse(args),/FACTORY_MERGE_DRYRUN_/);
 }
 assert.throws(()=>merge.assess({cwd:root,mainRef:'main'}),/FACTORY_MERGE_DRYRUN_INPUT_UNSAFE/);
 assert.throws(()=>merge.assess({cwd:root,candidateRef:'MERGE_HEAD'}),/FACTORY_MERGE_DRYRUN_INPUT_UNSAFE/);
 assert.equal(merge.safePath('../secrets.txt'),null);
 assert.equal(merge.safePath('/tmp/private'),null);
 assert.equal(merge.safePath('operations/app.js'),'operations/app.js');
});
test('sanitized output is owner-private and cannot overwrite an existing report',t=>{
 const s=fixture(t,{conflict:true});
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'private-main-dryrun-output-'));
 t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 const filename=path.join(folder,'dryrun.json');
 const x=merge.main(['--output',filename],{cwd:s.cwd});
 assert.equal(x.gitMergeWouldBeClean,false);
 assert.deepEqual(x.conflictPaths,['shared.txt']);
 assert.equal(x.deploymentsPerformed,0);
 assert.equal(x.externalContacts,0);
 const parsed=JSON.parse(fs.readFileSync(filename,'utf8'));
 assert.equal(parsed.independentSignature,false);
 assert.equal(parsed.productionAuthorization,false);
 assert.equal(parsed.report.releaseApproved,false);
 if(process.platform!=='win32')assert.equal(fs.statSync(filename).mode&0o077,0);
 assert.throws(()=>merge.main(['--output',filename],{cwd:s.cwd}),/FACTORY_MERGE_DRYRUN_OUTPUT_EXISTS/);
});
