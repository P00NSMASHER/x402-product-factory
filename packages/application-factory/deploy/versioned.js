'use strict';
// Private release rehearsal of TWO behaviorally distinct independently accepted app versions.
// Does not open an external listener, migrate customer state, or authorize live release.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {verifyApplication}=require('../manufacturing/assembler');
const {validReceipt}=require('../manufacturing/acceptance');
const {verifyQuoteApp,validAcceptance,manufactureQuoteBatch}=require('../quote-family/manufacturing');
const {verifyInventoryPackage,CHECKS,manufactureInventoryBatch}=require('../inventory-family/manufacturing');
const {manufactureBatch}=require('../manufacturing/line');
const docRecipes=require('../recipes.json'),quoteRecipes=require('../quote-family/recipes.json');
const inventoryRecipes=require('../inventory-family/recipes.json');
const ROOT=path.resolve(__dirname,'../../..');
const fail=code=>{throw Error(code);};
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const inside=(parent,item)=>{const rel=path.relative(parent,item);return rel===''||
  (!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};
const isDigest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function privateDirectory(raw,code='VERSION_PATH_UNSAFE'){
 if(typeof raw!=='string'||!path.isAbsolute(raw))fail(code);
 const d=path.resolve(raw);
 if(inside(ROOT,d))fail(code);
 let st;try{st=fs.lstatSync(d);}catch{fail(code);}
 if(!st.isDirectory()||st.isSymbolicLink()||fs.realpathSync(d)!==d||
  (process.platform!=='win32'&&(st.mode&0o077)!==0))fail(code);
 return d;
}
function safeJSON(filename,code){
 let st;try{st=fs.lstatSync(filename);}catch{fail(code);}
 if(!st.isFile()||st.isSymbolicLink()||st.size<2||st.size>65536||
  (process.platform!=='win32'&&(st.mode&0o077)!==0))fail(code);
 try{return JSON.parse(fs.readFileSync(filename,'utf8'));}catch{fail(code);}
}
const configs={
 document:{report:'full-stack-manufacturing',verification:'executed-packaged-workflow',items:r=>r.results,
  manifest:verifyApplication,receiptName:r=>r.id+'-'+r.digest+'.json',
  accepted:(v,id,digest)=>validReceipt(v,id,digest),family:'document-workflow',
  recipe:p=>JSON.parse(fs.readFileSync(path.join(p,'packages/application-factory/recipes.json'),'utf8'))[0],
  operational:v=>[v.defaultDueDays,v.reminderEveryDays,v.renewalWindowDays,v.requirements]},
 quote:{report:'quote-family-manufacturing',verification:'executed-packaged-quote-lifecycle',items:r=>r.apps,
  manifest:verifyQuoteApp,receiptName:r=>r.id+'-'+r.digest+'.json',
  accepted:(v,id,digest)=>validAcceptance(v,id,digest),family:'quote-to-order',
  recipe:p=>JSON.parse(fs.readFileSync(path.join(p,'recipe.json'),'utf8')),
  operational:v=>[v.validDays,v.items]},
 inventory:{report:'inventory-family-manufacturing',verification:'executed-packaged-inventory-lifecycle',
  items:r=>r.results,manifest:verifyInventoryPackage,receiptName:r=>r.id+'-'+r.digest+'.json',
  accepted:(v,id,digest)=>v&&v.kind==='assembled-inventory-acceptance'&&v.passed===true&&
   v.recipeId===id&&v.artifactDigest===digest&&CHECKS.every(k=>v[k]===true)&&
   v.externalMessagesSent===0&&v.paymentsSent===0&&v.realCustomers===null&&
   v.collectedRevenue===null&&v.releaseApproved===false, family:'inventory-control',
  recipe:p=>JSON.parse(fs.readFileSync(path.join(p,'recipe.json'),'utf8')),
  operational:v=>[v.reviewWindowDays,v.maxProposalCents,v.items]}
};
function verifiedFamilyArtifact({family,root,id}={}){
 const spec=configs[family];
 if(!spec||typeof id!=='string'||!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)||id.length>60)
  fail('VERSION_INPUT_INVALID');
 const dir=privateDirectory(root),report=safeJSON(path.join(dir,'manufacturing-report.json'),'VERSION_REPORT_INVALID');
 if(report.kind!==spec.report||report.verification!==spec.verification||
   !Number.isSafeInteger(report.accepted)||report.accepted<1||report.accepted>12||
   report.failed!==0||report.realCustomers!==null||report.collectedRevenue!==null||
   report.releaseApproved!==false||report.paymentsSent!==0)fail('VERSION_REPORT_INVALID');
 const rows=spec.items(report);
 if(!Array.isArray(rows)||rows.length!==report.accepted||
    new Set(rows.map(v=>v?.id)).size!==rows.length)fail('VERSION_REPORT_INVALID');
 const row=rows.find(x=>x.id===id);
 if(!row||row.status!=='accepted'||!isDigest(row.digest))fail('VERSION_REPORT_INVALID');
 const expectedName=id+'-'+row.digest;
 if(row.artifact!==undefined&&row.artifact!==expectedName)fail('VERSION_REPORT_INVALID');
 const pkg=privateDirectory(path.join(dir,expectedName),'VERSION_PACKAGE_INVALID');
 if(!inside(dir,pkg))fail('VERSION_PACKAGE_INVALID');
 let manifest,recipe;
 try{
  manifest=spec.manifest(pkg,row.digest);
  recipe=spec.recipe(pkg);
 }catch{fail('VERSION_PACKAGE_INVALID');}
 if(manifest.recipeId!==id||manifest.family!==spec.family||
    manifest.releaseApproved!==false||manifest.realCustomers!==null||manifest.collectedRevenue!==null||
    (manifest.marketValidated!==undefined&&manifest.marketValidated!==false)||
    (manifest.marketValidation!==undefined&&manifest.marketValidation!=='unverified')||
    recipe.id!==id||recipe.family!==spec.family)fail('VERSION_PACKAGE_INVALID');
 const receipt=safeJSON(path.join(dir,'verification',spec.receiptName(row)),'VERSION_RECEIPT_INVALID');
 if(!spec.accepted(receipt,id,row.digest))fail('VERSION_RECEIPT_INVALID');
 return {family,id,digest:row.digest,folder:pkg,recipe};
}
function verifyVersionPair({family,baselineRoot,candidateRoot,id}={}){
 const original=verifiedFamilyArtifact({family,root:baselineRoot,id});
 const candidate=verifiedFamilyArtifact({family,root:candidateRoot,id});
 if(original.folder===candidate.folder||original.digest===candidate.digest)
  fail('VERSION_NOT_CHANGED');
 const describe=configs[family].operational;
 if(JSON.stringify(describe(original.recipe))===JSON.stringify(describe(candidate.recipe)))
  fail('VERSION_BEHAVIOR_UNCHANGED');
 return {family,id,baseline:original,candidate};
}
function runPair(pair){
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'factory-version-rehearsal-'));
 try{
  const env={PATH:process.env.PATH||'',TZ:'UTC'};
  for(const key of ['SystemRoot','WINDIR','TEMP','TMP','TMPDIR'])if(process.env[key])env[key]=process.env[key];
  const proc=spawnSync(process.execPath,[path.join(__dirname,'version-probe.cjs'),pair.family,
   pair.baseline.folder,pair.candidate.folder,pair.baseline.digest,pair.candidate.digest,scratch],
   {encoding:'utf8',env,timeout:24000,killSignal:'SIGKILL',maxBuffer:128*1024,windowsHide:true});
  if(proc.error||proc.status!==0)fail('VERSION_TRAFFIC_REJECTED');
  let out;try{out=JSON.parse(proc.stdout);}catch{fail('VERSION_TRAFFIC_REJECTED');}
  if(out.kind!=='isolated-cross-version-traffic-rehearsal'||out.passed!==true||
   out.family!==pair.family||out.id!==pair.id||
   out.baselineDigest!==pair.baseline.digest||out.candidateDigest!==pair.candidate.digest||
   out.distinctVersions!==true||out.isolatedSqliteState!==true||
   out.baselineAfterCanaryOutage!==true||out.unrecoverableOutageFailsClosed!==true||
   out.baselineRestartSameState!==true||out.hostAndOriginDenied!==true||
   out.onlyLocalHttp!==true||out.differentVersionRollbackProbe!==true||
   out.crossVersionStateMigrated!==false||out.productionRollbackExecuted!==false||
   out.publicDeploymentEnabled!==false||out.realCustomers!==null||
   out.collectedRevenue!==null||out.paymentsSent!==0||
   out.transmittedMessages!==0||out.releaseApproved!==false)
   fail('VERSION_TRAFFIC_INVALID');
  // A separate clean child verifies real committed synthetic SQLite data from the
  // baseline can be read safely or explicitly rejected by the new version.
  const state=spawnSync(process.execPath,[path.join(__dirname,'state-compatibility.cjs'),
   pair.family,pair.baseline.folder,pair.candidate.folder,path.join(scratch,'state-check')],
   {encoding:'utf8',env,timeout:18000,killSignal:'SIGKILL',maxBuffer:128*1024,windowsHide:true});
  if(state.error||state.status!==0){
   const match=String(state.stderr||'').match(/STATE_COMPAT_FAILED:(document|quote|inventory):[a-z-]+:[A-Z_]+/);
   if(match)process.stderr.write('Synthetic QA '+match[0]+'\n');
   fail('VERSION_STATE_COMPAT_REJECTED');
  }
  let assessment;try{assessment=JSON.parse(state.stdout);}catch{fail('VERSION_STATE_COMPAT_REJECTED');}
  const permittedModes={document:'old_workspace_still_bound_to_old_recipe',
   quote:'quote_receipts_replay_under_new_validity_policy',
   inventory:'rejects_changed_inventory_recipe'};
  if(assessment.kind!=='isolated-state-version-compatibility'||assessment.passed!==true||
   assessment.family!==pair.family||assessment.id!==pair.id||
   assessment.baselinePreserved!==true||assessment.syntheticTenantsIsolated!==true||
   assessment.idempotentReceiptsPreserved!==true||
   assessment.candidateReadOnlyProbe!==(pair.family!=='inventory')||
   assessment.changeGate!==permittedModes[pair.family]||
   assessment.unknownVersionRejected!==true||assessment.foreignApplicationRejected!==true||
   assessment.oldVersionReadbackVerified!==true||
   assessment.sqliteApplicationIdentityVerified!==true||
   assessment.snapshotFromCommittedWal!==true||
   assessment.uncheckpointedCommittedWalVerified!==true||
   assessment.mainFileOnlyMissesCommittedReceipts!==true||
   assessment.walCommittedReceipts!==1||
   assessment.schemaUpgradeApplied!==false||
   assessment.automaticSharedStateMigrationApproved!==false||
   assessment.productionCustomerStateMigrated!==false||
   assessment.sourceReadOnly!==true||assessment.externalMessagesSent!==0||
   assessment.paymentsSent!==0||assessment.realCustomers!==null||
   assessment.collectedRevenue!==null||assessment.releaseApproved!==false)
   fail('VERSION_STATE_COMPAT_INVALID');
  // Independent source-integrity recheck after the running binaries have been exercised.
  const spec=configs[pair.family];
  try{spec.manifest(pair.baseline.folder,pair.baseline.digest);
   spec.manifest(pair.candidate.folder,pair.candidate.digest);}catch{fail('VERSION_PACKAGE_INVALID');}
  return {family:pair.family,id:pair.id,baselineDigest:pair.baseline.digest,
   candidateDigest:pair.candidate.digest,privateCanarySwitches:2,unhealthyResponsesFailClosed:true,
   sourceVerifiedBeforeAndAfter:true,isolatedVersionState:true,
   localTrafficRollbackPassed:true,productionRollbackExecuted:false,
   persistedStateIntegrityVerified:true,uncheckpointedWalSnapshotVerified:true,
   mainFileOnlyRecoveryDenied:true,walCommittedReceipts:assessment.walCommittedReceipts,
   unsupportedSchemaRejected:true,
   sourceIdentityMismatchRejected:true,sharedStateMigrationApproved:false,
   stateCompatibilityOutcome:assessment.changeGate};
 }finally{fs.rmSync(scratch,{recursive:true,force:true});}
}
const delta=(value,max)=>value<max?value+1:value-1;
function rehearseSyntheticVersions({baselineRoots,outputRoot}={}){
 if(!baselineRoots||Object.keys(baselineRoots).sort().join(',')!=='document,inventory,quote')
  fail('VERSION_INPUT_INVALID');
 if(typeof outputRoot!=='string'||!path.isAbsolute(outputRoot)||inside(ROOT,path.resolve(outputRoot)))
  fail('VERSION_PATH_UNSAFE');
 const target=path.resolve(outputRoot);
 if(fs.existsSync(target))fail('VERSION_OUTPUT_EXISTS');
 const ids={document:docRecipes[0].id,quote:quoteRecipes[0].id,inventory:inventoryRecipes[0].id};
 // Validate all old packages and real acceptance FIRST, before manufacturing any replacement.
 const baseline={};
 for(const family of Object.keys(ids))
  baseline[family]=verifiedFamilyArtifact({family,root:baselineRoots[family],id:ids[family]});
 const stageRoot=fs.mkdtempSync(path.join(os.tmpdir(),'factory-version-candidate-'));
 try{
  const replacement={
   document:{...docRecipes[0],defaultDueDays:delta(docRecipes[0].defaultDueDays,90)},
   quote:{...quoteRecipes[0],validDays:delta(quoteRecipes[0].validDays,90)},
   inventory:{...inventoryRecipes[0],reviewWindowDays:delta(inventoryRecipes[0].reviewWindowDays,30)}
  };
  const newRoots=Object.fromEntries(Object.keys(ids).map(f=>[f,path.join(stageRoot,f)]));
  const a=manufactureBatch({recipes:[replacement.document],outputRoot:newRoots.document});
  const b=manufactureQuoteBatch({recipes:[replacement.quote],outputRoot:newRoots.quote});
  const c=manufactureInventoryBatch({catalog:[replacement.inventory],outputRoot:newRoots.inventory});
  for(const m of [a,b,c])if(m.accepted!==1||m.failed!==0||m.releaseApproved!==false)
    fail('VERSION_MANUFACTURING_FAILED');
  const pairs=Object.keys(ids).map(family=>verifyVersionPair({family,id:ids[family],
   baselineRoot:baselineRoots[family],candidateRoot:newRoots[family]}));
  const results=pairs.map(runPair);
  const report={kind:'private-distinct-version-rollback-rehearsal',schemaVersion:1,
   testedFamilies:3,testedVersionPairs:3,verifiedTrafficFallbacks:3,failed:0,
   results,changes:'behavioral-parameter-and-source-digest-changes',
   persistedStateFamiliesChecked:3,unsafeAutomaticStateMigrationsBlocked:3,
   uncheckpointedWalSnapshotsVerified:3,mainFileOnlyRecoveryDenied:3,
   observedSchemaDriftDenied:true,sharedStateMigrationApproved:false,
   releaseState:'commercial-hold',approvedDeploymentTarget:null,publicHostingEnabled:false,
   productionStateMigrationTested:false,productionRollbackExecuted:false,
   customerDataUsed:false,independentMarketValidation:false,realCustomers:null,
   collectedRevenue:null,paymentsSent:0,transmittedMessages:0,releaseApproved:false};
  report.digest=sha(JSON.stringify(report));
  const parent=path.dirname(target);
  fs.mkdirSync(parent,{recursive:true,mode:0o700});
  const ps=fs.lstatSync(parent);
  // GitHub RUNNER_TEMP may be group-readable. Private stage itself is created 0700.
  if(!ps.isDirectory()||ps.isSymbolicLink()||fs.realpathSync(parent)!==parent||
    (process.platform!=='win32'&&((ps.mode&0o002)!==0||
      (typeof process.getuid==='function'&&ps.uid!==process.getuid()))))fail('VERSION_PATH_UNSAFE');
  const temp=fs.mkdtempSync(path.join(parent,'.private-version-rehearsal-'));
  try{
   const files={
    'versioned-report.json':JSON.stringify(report,null,2)+'\n',
    'RELEASE-HOLD.md':'# Distinct-version private routing acceptance\n\n'+
    'Three real alternate packaged versions ran on separate synthetic SQLite databases. A local-only canary outage triggered an observed fallback to each prior version. Source integrity and independent full packaged lifecycle receipts were checked. Both-lane outage returned 503, never a false OK. A separate compatibility gate pinned a read transaction before baseline writes, verified a committed WAL-only receipt missing from the bare main database, included it in a VACUUM INTO snapshot, checked idempotent receipts and tenant isolation on candidate reopen, and rejected unsupported schema and foreign application identities. Changed inventory recipes refuse shared-state reopening, while document workspaces remain bound to their prior recipe; automatic migration remains disallowed.\n\n'+
    'Not a public deployment or production rollback. NO shared customer state migration, live database schema upgrade, TLS, externally reachable service, payment, buyer, version-compatibility approval or independent security review. Real promotion requires separate governed review.\n'
   };
   for(const [name,body] of Object.entries(files)){
    const fd=fs.openSync(path.join(temp,name),'wx',0o600);
    try{fs.writeFileSync(fd,body);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   }
   if(fs.existsSync(target))fail('VERSION_OUTPUT_EXISTS');
   fs.renameSync(temp,target);
  }finally{if(fs.existsSync(temp))fs.rmSync(temp,{recursive:true,force:true});}
  return {kind:report.kind,testedVersionPairs:3,verifiedTrafficFallbacks:3,
   persistedStateFamiliesChecked:3,unsafeAutomaticStateMigrationsBlocked:3,
   uncheckpointedWalSnapshotsVerified:3,mainFileOnlyRecoveryDenied:3,
   failed:0,digest:report.digest,publicHostingEnabled:false,productionRollbackExecuted:false,
   realCustomers:null,collectedRevenue:null,paymentsSent:0,transmittedMessages:0,releaseApproved:false};
 }finally{fs.rmSync(stageRoot,{recursive:true,force:true});}
}
module.exports={verifiedFamilyArtifact,verifyVersionPair,rehearseSyntheticVersions};
