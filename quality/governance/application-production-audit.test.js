'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const manifest=require('./application-production-manifest.json');
const audit=require('./application-production-audit');
const base=(sha)=>({sha,ref:''});
const sha=n=>n.toString(16).padStart(40,'0');
const json=x=>structuredClone(x);
function good(){
 const pulls={},sideDrafts={},runs=[];
 for(let i=0;i<manifest.stack.length;i++){
  const node=manifest.stack[i],parent=manifest.stack[i-1];
  pulls[node.number]={
   number:node.number,state:'open',draft:true,merged:false,mergeable:true,
   head:{sha:node.number===56?manifest.candidate.pinnedHeadSha:sha(node.number),
     ref:node.headRef},
   base:{sha:parent?(parent.number===56?manifest.candidate.pinnedHeadSha:sha(parent.number)):
     sha(21),ref:node.baseRef}
  };
 }
 for(let i=0;i<manifest.requiredCandidateWorkflows.length;i++){
  const v=manifest.requiredCandidateWorkflows[i];
  runs.push({id:90000+i,name:v.name,path:v.path,event:'pull_request',
   head_branch:manifest.candidate.headRef,head_sha:manifest.candidate.pinnedHeadSha,
   status:'completed',conclusion:'success'});
 }
 for(const def of manifest.separateDrafts)
  sideDrafts[def.number]={number:def.number,state:'open',draft:true,merged:false,
   head:{sha:sha(def.number)}};
 return {main:{sha:sha(1),protected:true},pulls,sideDrafts,runs,driftComparisons:{},
  mainComparison:{baseSha:sha(1),headSha:manifest.candidate.pinnedHeadSha,
   status:'ahead',aheadBy:310,behindBy:0}};
}
test('read-only manifest enforces exact canonical 33-PR chain and all nine candidate workflows',()=>{
 assert.deepEqual(audit.CHAIN,manifest.stack.map(n=>n.number));
 assert.equal(audit.validateManifest(manifest),manifest);
 assert.equal(audit.CHAIN.length,33);
 assert.equal(manifest.requiredCandidateWorkflows.length,9);
 assert.deepEqual(manifest.separateDrafts.map(p=>p.number),audit.SIDE);
 assert.equal(manifest.candidate.prNumber,56);
 assert.equal(manifest.allowedActions,'GET_GITHUB_ONLY_NO_MERGE_DEPLOY_CONTACT_OR_PAYMENT');
 for(const change of [
  m=>m.repository='attacker/repo',
  m=>m.candidate.prNumber=57,
  m=>m.candidate.pinnedHeadSha='not-an-actual-sha',
  m=>m.stack.splice(1,1),
  m=>m.stack[5].baseRef='main',
  m=>m.stack[10].number=987,
  m=>m.requiredCandidateWorkflows.pop(),
  m=>m.requiredCandidateWorkflows[0].path='../customer-secrets',
  m=>m.separateDrafts[0].disposition='auto-merge',
  m=>m.commercialHold.independentBuyerValidation=true,
  m=>m.commercialHold.product025Unlocked=true,
  m=>m.allowedActions='PUBLISH_AND_CONTACT',
  m=>m.newPermission='contents:write']){
  const copy=json(manifest);change(copy);
  assert.throws(()=>audit.validateManifest(copy),/INTEGRATION_AUDIT_/);
 }
});
test('a perfectly tested draft stack STILL never authorizes commercial/public release',()=>{
 const s=good(),report=audit.evaluate(manifest,s);
 assert.equal(report.canonicalStackPrs,33);
 assert.equal(report.candidateWorkflowsPassed,9);
 assert.equal(report.dependencyGraphVerified,true);
 assert.equal(report.mainReconciliationRequired,false);
 assert.equal(report.sourceIntegrationReady,false); // Two open separate drafts.
 assert.equal(report.sideDrafts.length,2);
 assert.equal(report.findings.filter(x=>x.code==='UNINTEGRATED_SIDE_DRAFT_REQUIRES_DISPOSITION').length,2);
 assert.equal(report.releaseStatus,'HOLD_EXTERNAL_PRODUCTION_APPROVAL');
 assert.equal(report.productionReady,false);
 assert.equal(report.releaseApproved,false);
 assert.equal(report.automaticMergesAllowed,false);
 assert.equal(report.automonousPublicDeploymentEnabled,undefined);
 assert.equal(report.autonomousPublicDeploymentEnabled,false);
 assert.equal(report.externalContacts,0);
 assert.equal(report.mergesPerformed,0);
 assert.equal(report.deploymentsPerformed,0);
 assert.equal(report.product025Unlocked,false);
});
test('default main divergence, unprotected branch and stale parents create explicit BLOCK',()=>{
 const s=good();
 s.main.protected=false;
 s.mainComparison.status='diverged';s.mainComparison.behindBy=60;s.mainComparison.aheadBy=311;
 // Reproduce actual current hazard: PR43 changed after PR44 took its earlier parent snapshot.
 s.pulls[43].head.sha=sha(7743);
 s.driftComparisons[44]={status:'diverged',behindBy:1,aheadBy:9};
 const report=audit.evaluate(manifest,s);
 assert.equal(report.releaseStatus,'BLOCK_MAIN_RECONCILIATION');
 assert.equal(report.candidateBehindBy,60);
 assert.equal(report.mainReconciliationRequired,true);
 assert.equal(report.dependencyGraphVerified,false);
 assert.ok(report.findings.some(x=>x.code==='PARENT_HEAD_DRIFT'&&x.prNumber===44));
 assert.ok(report.findings.some(x=>x.code==='DEFAULT_BRANCH_HISTORY_NOT_IN_CANDIDATE'));
 assert.ok(report.findings.some(x=>x.code==='DEFAULT_BRANCH_PROTECTION_UNVERIFIED'));
 assert.equal(report.draftChecks.find(x=>x.prNumber===44).compareStatus,'diverged');
 const output=audit.markdown(report);
 assert.match(output,/commits ahead/);
 assert.match(output,/BLOCK_MAIN_RECONCILIATION/);
 assert.doesNotMatch(output,/Bearer |password|SECRET_TOKEN/);
});
test('current candidate HEAD drift, PR closure, base mismatch and conflicts are not accepted',()=>{
 const s=good();
 s.pulls[56].head.sha=sha(987);
 s.pulls[42].base.ref='main';
 s.pulls[53].draft=false;
 s.pulls[48].mergeable=false;
 s.pulls[35].merged=true;
 const r=audit.evaluate(manifest,s);
 for(const pair of [
  ['CANDIDATE_PIN_MOVED',56],['BASE_BRANCH_DRIFT',42],['DRAFT_STATE_CHANGED',53],
  ['MERGE_CONFLICT',48],['DRAFT_STATE_CHANGED',35]]){
  assert.ok(r.findings.some(v=>v.code===pair[0]&&v.prNumber===pair[1]),pair.join(':'));
 }
 assert.equal(r.productionReady,false);
});
test('required exact-head CI fails closed on wrong event, branch, path and latest failed run',()=>{
 const variants=[
  runs=>runs.pop(),
  runs=>runs[0].head_sha=sha(99),
  runs=>runs[0].head_branch='main',
  runs=>runs[0].event='push',
  runs=>runs[0].path='different-ci.yml',
  runs=>runs[0].status='queued',
  runs=>runs[0].conclusion='failure',
  runs=>runs.push({...runs[0],id:1000000,conclusion:'failure'})
 ];
 for(const mutation of variants){
  const s=good();mutation(s.runs);
  const report=audit.evaluate(manifest,s);
  assert.ok(report.candidateWorkflowsPassed<9,report.checks.map(x=>x.name+':'+x.pass).join(','));
  assert.equal(report.releaseStatus,'BLOCK_EXACT_HEAD_CI');
  assert.equal(report.productionReady,false);
 }
});
test('read-only GitHub client whitelists exact safe endpoints and rejects unsafe outgoing routes',async()=>{
 const ok=[
  '/repos/P00NSMASHER/x402-product-factory/branches/main',
  '/repos/P00NSMASHER/x402-product-factory/pulls/56',
  '/repos/P00NSMASHER/x402-product-factory/actions/runs?head_sha='+sha(1)+'&per_page=100',
  '/repos/P00NSMASHER/x402-product-factory/compare/'+sha(1)+'...'+sha(2)+'?per_page=1'
 ];
 const called=[];
 for(const path of ok){
  const res=await audit.getGithub(path,{
   token:'PRIVATE_INJECTED_TEST_TOKEN_DO_NOT_OUTPUT',
   fetchImpl:async(uri,options)=>{
    called.push({uri,options});return {ok:true,async text(){return '{"ok":true}';}};
   }});
  assert.equal(res.ok,true);
 }
 assert.equal(called.length,4);
 assert.ok(called.every(x=>x.options.method==='GET'&&
    x.options.redirect==='error'&&new URL(x.uri).origin==='https://api.github.com'));
 for(const invalid of [
  '/repos/other/tenant/pulls/56',
  '/repos/P00NSMASHER/x402-product-factory/pulls/56/comments',
  '/repos/P00NSMASHER/x402-product-factory/actions/runs?head_sha='+sha(1)+'&per_page=100&token=secret',
  '/repos/P00NSMASHER/x402-product-factory/compare/'+sha(1)+'...'+sha(2)+'?per_page=1000',
  '/repos/P00NSMASHER/x402-product-factory/branches/main?update=true',
  '/repos/P00NSMASHER/x402-product-factory/contents/.env',
  'https://api.github.com/repos/P00NSMASHER/x402-product-factory/pulls/56',
  '/repos/P00NSMASHER/x402-product-factory/pulls/0']){
  assert.equal(audit.allowedPath(invalid),false);
  await assert.rejects(audit.getGithub(invalid,{
   token:'PRIVATE_INJECTED_TEST_TOKEN_DO_NOT_OUTPUT',
   fetchImpl:async()=>{throw Error('MUST_NOT_SEND_UNAPPROVED_REQUEST');}
  }),/INTEGRATION_AUDIT_URL_DENIED/);
 }
});
test('bounded GitHub collector retrieves and reduces only read-only metadata and records safe divergence',async()=>{
 const s=good(),calls=[];
 s.main.protected=false;
 s.mainComparison.behindBy=60;s.mainComparison.status='diverged';s.mainComparison.aheadBy=311;
 s.pulls[43].head.sha=sha(7743);
 const fake=async(url,opts)=>{
  assert.equal(opts.method,'GET');
  const u=new URL(url),tail=u.pathname+u.search;
  calls.push(tail);
  let answer;
  const match=tail.match(/\/pulls\/(\d+)$/);
  if(tail.endsWith('/branches/main')){
   answer={commit:{sha:s.main.sha},protected:s.main.protected};
  }else if(match)answer=s.pulls[match[1]]||s.sideDrafts[match[1]];
  else if(tail.includes('/actions/runs?'))answer={workflow_runs:s.runs};
  else if(tail.includes('/compare/'))answer={status:'diverged',ahead_by:311,behind_by:60};
  else throw Error('mocked reader accessed unexpected endpoint');
  return {ok:true,async text(){return JSON.stringify(answer);}};
 };
 const reduced=await audit.collectLive(manifest,{fetchImpl:fake,token:'PRIVATE_TEST_READONLY_BEARER'});
 assert.equal(reduced.calls,calls.length);
 assert.ok(reduced.calls>35&&reduced.calls<90);
 assert.equal(reduced.mainComparison.behindBy,60);
 assert.equal(reduced.pulls[56].head.sha,manifest.candidate.pinnedHeadSha);
 assert.equal(reduced.driftComparisons[44].status,'diverged');
 const report=audit.evaluate(manifest,reduced);
 assert.equal(report.releaseApproved,false);
 assert.equal(report.mainReconciliationRequired,true);
});
test('audit never echoes arbitrary PR content or tokens into report or markdown',()=>{
 const s=good();
 s.pulls[45].body='NEVER_DISPLAY_SECRET_AND_PERSONAL_EMAIL_a@b.example';
 s.runs[0].name='private-user-gave-password';
 const report=audit.evaluate(manifest,s);
 const serialized=JSON.stringify(report)+audit.markdown(report);
 assert.equal(serialized.includes('NEVER_DISPLAY_SECRET_AND_PERSONAL_EMAIL'),false);
 assert.equal(serialized.includes('private-user-gave-password'),false);
 assert.equal(serialized.includes('Bearer'),false);
 assert.equal(report.productionReady,false);
});
