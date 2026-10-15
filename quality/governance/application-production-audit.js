'use strict';
// Read-only, fail-closed source integration readiness audit. NO merges, deployments,
// external contacts, payment activity, product unlocking or production approvals.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const MANIFEST=path.join(__dirname,'application-production-manifest.json');
const REPO='P00NSMASHER/x402-product-factory';
const ROOT='/repos/'+REPO;
const CHAIN=[22,23,24,25,26,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,47,48,49,50,51,52,53,54,55,56];
const SIDE=[27,46];
const WORKFLOWS=[
 'Autonomous App Candidate Factory',
 'Factory product CI',
 'Full-stack application manufacturing',
 'Factory connected browser acceptance',
 'Synthetic remote-preview gateway CI',
 'Private pilot lifecycle',
 'Second application family - Quote to Order',
 'Third Application Family - Inventory Replenishment',
 'Factory acquisition research safety'
];
const HOLD_KEYS=[
 'independentBuyerValidation','independentSecurityPrivacyReview',
 'dataCustodyAndMigrationApproval','publicIngressAuthorization',
 'reconciledRealPaymentSettlement','independentHostingUnitEconomics',
 'explicitProductionReleaseApproval','product025Unlocked'
];
const error=code=>{const x=Error('INTEGRATION_AUDIT_'+code);x.code='INTEGRATION_AUDIT';throw x;};
const isSha=v=>typeof v==='string'&&/^[0-9a-f]{40}$/.test(v);
const obj=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&
 Object.keys(v).sort().join('|')===[...keys].sort().join('|');
function validateManifest(m){
 if(!obj(m,['schemaVersion','kind','repository','defaultBranch','rootParent','candidate',
    'stack','separateDrafts','requiredCandidateWorkflows','maxApiRequests','commercialHold','allowedActions'])||
    m.schemaVersion!==1||m.kind!=='factory-readonly-production-integration-manifest'||
    m.repository!==REPO||m.defaultBranch!=='main'||
    m.rootParent!=='factory/ofac-refresh-failclosed-20261012'||
    m.allowedActions!=='GET_GITHUB_ONLY_NO_MERGE_DEPLOY_CONTACT_OR_PAYMENT'||
    m.maxApiRequests!==90||!obj(m.candidate,['prNumber','headRef','pinnedHeadSha'])||
    m.candidate.prNumber!==56||!isSha(m.candidate.pinnedHeadSha)||
    !Array.isArray(m.stack)||m.stack.length!==CHAIN.length)
  error('MANIFEST_INVALID');
 const refs=new Set();
 for(let i=0;i<CHAIN.length;i++){
  const v=m.stack[i],ref=i?m.stack[i-1].headRef:m.rootParent;
  if(!obj(v,['number','headRef','baseRef'])||
    v.number!==CHAIN[i]||typeof v.headRef!=='string'||
    !/^factory\/[a-z0-9-]{8,110}$/.test(v.headRef)||refs.has(v.headRef)||
    v.baseRef!==ref)error('MANIFEST_TOPOLOGY');
  refs.add(v.headRef);
 }
 if(m.candidate.headRef!==m.stack.at(-1).headRef||!Array.isArray(m.separateDrafts)||
    m.separateDrafts.length!==SIDE.length||
    !m.separateDrafts.every((d,i)=>obj(d,['number','disposition'])&&
       d.number===SIDE[i]&&d.disposition==='independent-draft-review-required')||
    !Array.isArray(m.requiredCandidateWorkflows)||m.requiredCandidateWorkflows.length!==9||
    m.requiredCandidateWorkflows.some((x,i)=>!obj(x,['name','path'])||
     x.name!==WORKFLOWS[i]||typeof x.path!=='string'||
     !/^\.github\/workflows\/factory-[a-z0-9-]+\.yml$/.test(x.path))||
    new Set(m.requiredCandidateWorkflows.map(x=>x.path)).size!==9||
    !obj(m.commercialHold,HOLD_KEYS)||
    HOLD_KEYS.some(k=>m.commercialHold[k]!==(
      k==='product025Unlocked'?false:null)))
   error('MANIFEST_INVALID');
 return m;
}
function latestExact(runs,head,ref,workflow){
 if(!Array.isArray(runs))return null;
 const matching=runs.filter(r=>r&&r.name===workflow.name&&r.path===workflow.path&&
   r.event==='pull_request'&&r.head_sha===head&&r.head_branch===ref&&
   Number.isSafeInteger(r.id)&&r.id>0);
 matching.sort((a,b)=>b.id-a.id);
 return matching[0]||null;
}
function finding(code,number=null){
 return {code,...(number===null?{}:{prNumber:number})};
}
function evaluate(m,snapshot,{observedAt='2026-10-15T04:00:00Z'}={}){
 validateManifest(m);
 const stamp=Date.parse(observedAt);
 if(!Number.isFinite(stamp)||!snapshot||!snapshot.main||!snapshot.pulls||
    !snapshot.mainComparison||!Array.isArray(snapshot.runs)||
    !snapshot.sideDrafts||!snapshot.driftComparisons)error('INPUT_INVALID');
 const main=snapshot.main,candidate=m.candidate,findings=[],rows=[];
 if(!isSha(main.sha))error('INPUT_INVALID');
 if(main.sha!==snapshot.mainComparison.baseSha||
    candidate.pinnedHeadSha!==snapshot.mainComparison.headSha||
    !['ahead','diverged','behind','identical'].includes(snapshot.mainComparison.status)||
    !Number.isSafeInteger(snapshot.mainComparison.behindBy)||
    !Number.isSafeInteger(snapshot.mainComparison.aheadBy))
  error('COMPARISON_INVALID');
 if(snapshot.mainComparison.behindBy>0||snapshot.mainComparison.status!=='ahead')
  findings.push(finding('DEFAULT_BRANCH_HISTORY_NOT_IN_CANDIDATE'));
 if(main.protected!==true)findings.push(finding('DEFAULT_BRANCH_PROTECTION_UNVERIFIED'));
 for(let i=0;i<m.stack.length;i++){
  const node=m.stack[i],pr=snapshot.pulls[String(node.number)],
    previous=i?m.stack[i-1]:null,baseExpected=previous?
      snapshot.pulls[String(previous.number)]?.head?.sha:null;
  const stat={prNumber:node.number,headRef:node.headRef,
    actualHeadSha:null,liveDraft:false,baseRefCorrect:false,parentHeadMatches:null,
    compareStatus:null,mergeability:'unverified'};
  if(!pr||pr.number!==node.number||!isSha(pr.head?.sha)||
      typeof pr.head?.ref!=='string'||!isSha(pr.base?.sha)){
   findings.push(finding('PR_METADATA_MISSING',node.number));
   rows.push(stat);continue;
  }
  stat.actualHeadSha=pr.head.sha;
  stat.liveDraft=pr.state==='open'&&pr.draft===true&&pr.merged!==true;
  stat.baseRefCorrect=pr.base.ref===node.baseRef;
  stat.mergeability=pr.mergeable===true?'reported-mergeable':
    pr.mergeable===false?'conflict':'unknown';
  if(!stat.liveDraft)findings.push(finding('DRAFT_STATE_CHANGED',node.number));
  if(!stat.baseRefCorrect)findings.push(finding('BASE_BRANCH_DRIFT',node.number));
  if(pr.head.ref!==node.headRef)findings.push(finding('HEAD_BRANCH_DRIFT',node.number));
  if(pr.mergeable===false)findings.push(finding('MERGE_CONFLICT',node.number));
  if(pr.mergeable!==true)findings.push(finding('MERGEABILITY_NOT_ESTABLISHED',node.number));
  if(previous){
   stat.parentHeadMatches=pr.base.sha===baseExpected;
   if(!stat.parentHeadMatches){
    findings.push(finding('PARENT_HEAD_DRIFT',node.number));
    const c=snapshot.driftComparisons[String(node.number)];
    if(c&&['ahead','diverged','behind','identical'].includes(c.status)&&
      Number.isSafeInteger(c.behindBy)&&c.behindBy>=0)
      stat.compareStatus=c.status;
    else findings.push(finding('DEPENDENCY_ANCESTRY_UNVERIFIED',node.number));
   }
  }
  if(node.number===candidate.prNumber&&pr.head.sha!==candidate.pinnedHeadSha)
   findings.push(finding('CANDIDATE_PIN_MOVED',node.number));
  rows.push(stat);
 }
 const checks=[];
 for(const wf of m.requiredCandidateWorkflows){
  const run=latestExact(snapshot.runs,candidate.pinnedHeadSha,candidate.headRef,wf);
  const passed=run?.status==='completed'&&run?.conclusion==='success';
  checks.push({name:wf.name,pass:passed,runId:passed?run.id:null});
  if(!passed)findings.push(finding(run?'CANDIDATE_CI_NOT_GREEN':'CANDIDATE_CI_MISSING'));
 }
 const alternatives=[];
 for(const def of m.separateDrafts){
  const pr=snapshot.sideDrafts[String(def.number)];
  const stillOpen=pr?.number===def.number&&pr?.state==='open'&&pr?.draft===true&&
    pr?.merged!==true&&isSha(pr?.head?.sha);
  alternatives.push({prNumber:def.number,reviewRequired:stillOpen,
    disposition:stillOpen?'UNRESOLVED_SIDE_DRAFT':'STATUS_NEEDS_REVIEW'});
  if(stillOpen)findings.push(finding('UNINTEGRATED_SIDE_DRAFT_REQUIRES_DISPOSITION',def.number));
  else findings.push(finding('SIDE_DRAFT_STATE_CHANGED',def.number));
 }
 const noProductionAuthorization=HOLD_KEYS.every(k=>m.commercialHold[k]===
   (k==='product025Unlocked'?false:null));
 const complete=checks.every(c=>c.pass);
 const ancestryClean=rows.every(v=>v.liveDraft&&v.baseRefCorrect&&
   v.mergeability==='reported-mergeable'&&v.parentHeadMatches!==false);
 const status= !complete?'BLOCK_EXACT_HEAD_CI':
   snapshot.mainComparison.behindBy!==0?'BLOCK_MAIN_RECONCILIATION':
   !ancestryClean?'BLOCK_DRAFT_CHAIN_DRIFT':
   'HOLD_EXTERNAL_PRODUCTION_APPROVAL';
 return {
  schemaVersion:1,kind:'read-only-factory-production-integration-audit',
  observedAt:new Date(stamp).toISOString(),candidatePr:56,candidateHead:candidate.pinnedHeadSha,
  mainHead:main.sha,mainStatus:snapshot.mainComparison.status,
  candidateAheadBy:snapshot.mainComparison.aheadBy,
  candidateBehindBy:snapshot.mainComparison.behindBy,
  canonicalStackPrs:m.stack.length,canonicalStackChecked:rows.length,
  candidateWorkflowCount:checks.length,candidateWorkflowsPassed:checks.filter(c=>c.pass).length,
  draftChecks:rows,sideDrafts:alternatives,checks,findings,
  dependencyGraphVerified:ancestryClean,
  mainReconciliationRequired:snapshot.mainComparison.behindBy>0,
  sourceIntegrationReady:complete&&ancestryClean&&snapshot.mainComparison.behindBy===0&&
    main.protected===true&&alternatives.length===0,
  commercialApprovalEvidenceVerified:false,
  productionReady:false,releaseApproved:false,autonomousPublicDeploymentEnabled:false,
  automaticMergesAllowed:false,realCustomers:null,collectedRevenue:null,
  independentSecurityReview:null,productionPaymentApproval:null,product025Unlocked:false,
  externalContacts:0,paymentsSent:0,mergesPerformed:0,deploymentsPerformed:0,
  releaseStatus:status,noProductionAuthorization
 };
}
function markdown(report){
 const x=['# App Factory — private production integration audit','',
  '- Candidate: PR #'+report.candidatePr+' at '+report.candidateHead.slice(0,12),
  '- Default main: '+report.mainHead.slice(0,12),
  '- Main history: '+report.candidateAheadBy+' commits ahead / '+
    report.candidateBehindBy+' behind; '+report.mainStatus,
  '- Canonical stacked draft PRs checked: '+report.canonicalStackChecked,
  '- Latest exact-head candidate CI: '+report.candidateWorkflowsPassed+'/'+report.candidateWorkflowCount,
  '- Open parallel feature branches requiring disposition: '+report.sideDrafts.length,
  '- **Production deployment authorized: NO**','',
  '## Issues to reconcile',''];
 for(const f of report.findings)x.push('- '+f.code+(f.prNumber?' at PR #'+f.prNumber:''));
 x.push('', '**'+report.releaseStatus+'**','',
  'This is a GitHub read-only report. Green CI means tested synthetic code, not a',
  'merged production candidate, external buyer demand, security approval,',
  'public customer consent, payment, economic viability, or permission to deploy.','');
 return x.join('\n');
}
const allowedPath=p=>typeof p==='string'&&(
 /^\/repos\/P00NSMASHER\/x402-product-factory\/(pulls\/[1-9]\d{0,3}|branches\/main)$/.test(p)||
 /^\/repos\/P00NSMASHER\/x402-product-factory\/actions\/runs\?head_sha=[a-f0-9]{40}&per_page=100$/.test(p)||
 /^\/repos\/P00NSMASHER\/x402-product-factory\/compare\/[a-f0-9]{40}\.\.\.[a-f0-9]{40}\?per_page=1$/.test(p)
);
async function getGithub(p,{fetchImpl=fetch,token}={}){
 if(!allowedPath(p))error('URL_DENIED');
 if(typeof token!=='string'||token.length<10)error('READ_TOKEN_UNAVAILABLE');
 let response;
 try{response=await fetchImpl('https://api.github.com'+p,{
  method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),
  headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json',
    'x-github-api-version':'2022-11-28','user-agent':'factory-private-integration-readonly-audit'}
 });}catch{error('GITHUB_GET_UNAVAILABLE');}
 if(response?.ok!==true)error('GITHUB_GET_UNAVAILABLE');
 let raw;
 try{raw=await response.text();}catch{error('GITHUB_RESPONSE_UNAVAILABLE');}
 if(raw.length>8000000)error('GITHUB_RESPONSE_OVERSIZED');
 try{return JSON.parse(raw);}catch{error('GITHUB_RESPONSE_INVALID');}
}
async function collectLive(m,{fetchImpl=fetch,token}={}){
 validateManifest(m);
 let calls=0;
 const request=async p=>{
  if(++calls>m.maxApiRequests)error('API_BUDGET_EXCEEDED');
  return getGithub(p,{fetchImpl,token});
 };
 const main=await request(ROOT+'/branches/main');
 if(!isSha(main?.commit?.sha))error('MAIN_UNAVAILABLE');
 const pulls={},sideDrafts={},nodes=m.stack;
 for(let i=0;i<nodes.length;i+=4){
  const group=nodes.slice(i,i+4),rows=await Promise.all(
   group.map(n=>request(ROOT+'/pulls/'+n.number)));
  group.forEach((v,j)=>{pulls[String(v.number)]=rows[j];});
 }
 const side=await Promise.all(m.separateDrafts.map(n=>request(ROOT+'/pulls/'+n.number)));
 side.forEach((v,i)=>{sideDrafts[String(m.separateDrafts[i].number)]=v;});
 const target=m.candidate.pinnedHeadSha;
 const [comparison,runList]=await Promise.all([
  request(ROOT+'/compare/'+main.commit.sha+'...'+target+'?per_page=1'),
  request(ROOT+'/actions/runs?head_sha='+target+'&per_page=100')
 ]);
 if(!Array.isArray(runList?.workflow_runs))error('CANDIDATE_CI_UNAVAILABLE');
 const driftComparisons={};
 const drift=nodes.slice(1).filter((n,i)=>{
  const par=pulls[String(nodes[i].number)],cur=pulls[String(n.number)];
  return par?.head?.sha!==cur?.base?.sha;
 });
 if(drift.length>20)error('DEPENDENCY_DRIFT_TOO_LARGE');
 for(let i=0;i<drift.length;i+=4){
  const group=drift.slice(i,i+4);
  const results=await Promise.all(group.map(n=>{
   const j=nodes.findIndex(v=>v.number===n.number),
    ancestor=pulls[String(nodes[j-1].number)]?.head?.sha,
    descendant=pulls[String(n.number)]?.head?.sha;
   if(!isSha(ancestor)||!isSha(descendant))error('DEPENDENCY_METADATA_UNAVAILABLE');
   return request(ROOT+'/compare/'+ancestor+'...'+descendant+'?per_page=1');
  }));
  group.forEach((n,i)=>{driftComparisons[String(n.number)]={
   status:results[i]?.status,behindBy:results[i]?.behind_by,aheadBy:results[i]?.ahead_by
  };});
 }
 return {calls,main:{sha:main.commit.sha,protected:main.protected===true},
  pulls,sideDrafts,mainComparison:{baseSha:main.commit.sha,headSha:target,
   status:comparison.status,aheadBy:comparison.ahead_by,behindBy:comparison.behind_by},
  runs:runList.workflow_runs,driftComparisons};
}
async function auditLive(m,options={}){
 const snapshot=await collectLive(m,options);
 return {...evaluate(m,snapshot,{observedAt:options.observedAt||new Date().toISOString()}),
  githubReadRequests:snapshot.calls};
}
module.exports={CHAIN,SIDE,WORKFLOWS,HOLD_KEYS,MANIFEST,validateManifest,
 latestExact,evaluate,markdown,allowedPath,getGithub,collectLive,auditLive};
