'use strict';
// Independently executed synthetic persisted-state compatibility gate.
// Tests only temporary SQLite snapshots. Never reads live customer state or alters source packages.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const [family,baselinePackage,candidatePackage,scratch]=process.argv.slice(2);
if(!['document','quote','inventory'].includes(family)||
 [baselinePackage,candidatePackage,scratch].some(s=>typeof s!=='string'||!path.isAbsolute(s)))
 throw Error('STATE_COMPAT_INPUT_INVALID');
const CONFIG={
 document:{db:'runtime.sqlite',appId:1178682196,wrongSchema:'SCHEMA_UNSUPPORTED'},
 quote:{db:'quotes.sqlite',appId:1178682202,wrongSchema:'STORE_SCHEMA_INVALID'},
 inventory:{db:'inventory.sqlite',appId:1195972672,wrongSchema:'SCHEMA_UNSUPPORTED'}
};
let phase='startup';
const config=CONFIG[family],clock=()=>Date.parse('2026-10-13T12:00:00Z');
const fail=code=>{throw Error(code);};
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function recipeOf(root){
 if(family==='document')return JSON.parse(fs.readFileSync(path.join(root,'packages/application-factory/recipes.json'),'utf8'))[0];
 return JSON.parse(fs.readFileSync(path.join(root,'recipe.json'),'utf8'));
}
function engine(root,filename){
 const recipe=recipeOf(root);
 if(family==='document'){
  const {openRuntime}=require(path.join(root,'packages/application-factory/runtime/runtime.js'));
  return openRuntime({filename,recipes:[recipe],clock});
 }
 const {openStore}=require(path.join(root,family==='quote'?'store.js':'store.js'));
 return openStore({filename,recipe,clock});
}
function createPrivate(name){
 const folder=path.join(scratch,name);fs.mkdirSync(folder,{recursive:true,mode:0o700});
 const stat=fs.lstatSync(folder);
 if(!stat.isDirectory()||stat.isSymbolicLink()||
   (process.platform!=='win32'&&(stat.mode&0o077)!==0))fail('STATE_COMPAT_PATH_UNSAFE');
 return path.join(folder,config.db);
}
function snapshot(file){
 const db=new DatabaseSync(file);
 try{
  assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
  const schemaVersion=db.prepare('PRAGMA user_version').get().user_version;
  const appId=db.prepare('PRAGMA application_id').get().application_id;
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
   .all().map(v=>v.name);
  assert.ok(tables.length>=3&&tables.length<=14);
  const content=[];
  for(const name of tables){
   assert.match(name,/^[a-z][a-z0-9_]{0,60}$/);
   content.push([name,db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all()]);
  }
  return {schemaVersion,appId,tables:tables.length,digest:sha(JSON.stringify([schemaVersion,appId,content]))};
 }finally{db.close();}
}
function clone(source,dest){
 if(fs.existsSync(dest))fail('STATE_COMPAT_OUTPUT_EXISTS');
 const db=new DatabaseSync(source);
 try{
  assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
  // VACUUM INTO makes one consistent SQLite snapshot and includes committed WAL records.
  db.exec("VACUUM INTO '"+dest.replaceAll("'","''")+"'");
 }finally{db.close();}
 // SQLite VACUUM INTO uses filesystem defaults; constrain the offline clone before any reopen.
 if(process.platform!=='win32')fs.chmodSync(dest,0o600);
 assert.equal(snapshot(source).digest,snapshot(dest).digest);
}
function pinUncheckpointedWal(file){
 const fd=fs.openSync(file,'wx',0o600);fs.closeSync(fd);
 const reader=new DatabaseSync(file);
 try{
  assert.equal(reader.prepare('PRAGMA journal_mode=WAL').get().journal_mode,'wal');
  // A pre-write read snapshot prevents the baseline from auto-checkpointing
  // when its application handle closes. Without this, WAL evidence is illusory.
  reader.exec('BEGIN');
  reader.prepare('SELECT COUNT(*) AS n FROM sqlite_master').get();
  return reader;
 }catch(error){reader.close();throw error;}
}
function verifyUncheckpointedWal(file){
 const stat=fs.lstatSync(file+'-wal');
 assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>=32+24+512&&stat.size<8*1024*1024,
  'A nonempty, bounded WAL must exist while the reader snapshot is pinned');
 const wal=fs.readFileSync(file+'-wal');
 const magic=wal.readUInt32BE(0),rawPageSize=wal.readUInt32BE(8);
 const pageSize=rawPageSize===1?65536:rawPageSize,frameBytes=24+pageSize;
 assert.ok([0x377f0682,0x377f0683].includes(magic));
 assert.ok(pageSize>=512&&pageSize<=65536&&(pageSize&(pageSize-1))===0);
 assert.equal((wal.length-32)%frameBytes,0);
 const frames=(wal.length-32)/frameBytes;
 let commitFrames=0;
 for(let i=0;i<frames;i++)if(wal.readUInt32BE(32+i*frameBytes+4)!==0)commitFrames++;
 assert.ok(commitFrames>0,'WAL must contain a committed frame');
 const live=new DatabaseSync(file);let committedReceipts;
 try{committedReceipts=live.prepare('SELECT COUNT(*) AS n FROM receipts').get().n;}
 finally{live.close();}
 assert.equal(committedReceipts,1,'Committed command receipt must be visible with WAL');
 // Deliberately copy ONLY the SQLite main file, not its -wal/-shm sidecars.
 // This file must be stale: it cannot contain the just-committed receipt.
 const mainOnly=createPrivate('main-file-only');
 fs.copyFileSync(file,mainOnly,fs.constants.COPYFILE_EXCL);
 const offline=new DatabaseSync(mainOnly);let mainOnlyReceipts=0;
 try{
  if(offline.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='receipts'").get())
   mainOnlyReceipts=offline.prepare('SELECT COUNT(*) AS n FROM receipts').get().n;
 }finally{offline.close();}
 assert.equal(mainOnlyReceipts,0,
  'Main SQLite file alone must not recover the WAL-only committed receipt');
 return {frames,commitFrames,committedReceipts};
}
function withEngine(root,file,callback){
 const service=engine(root,file);
 try{return callback(service);}finally{service.close();}
}
const credentials=Object.create(null);
function seedOld(file){
 const oldRecipe=recipeOf(baselinePackage);
 return withEngine(baselinePackage,file,store=>{
  if(family==='document'){
   const a=store.provisionTenant('synthetic-a'),b=store.provisionTenant('synthetic-b');
   for(const row of [a,b])store.createWorkspace(row.token,{id:'test-workspace',recipeId:oldRecipe.id});
   const command={type:'add',name:'Synthetic document evidence packet',dueOn:'2026-10-20'};
   const first=store.command(a.token,'test-workspace',command,'seed-document-a-001');
   assert.equal(store.workspace(a.token,'test-workspace').records.length,1);
   assert.equal(store.workspace(b.token,'test-workspace').records.length,0);
   credentials.a=a.token;credentials.b=b.token;credentials.command=command;credentials.first=first;
  }else if(family==='quote'){
   const a=store.provision('synthetic-a'),b=store.provision('synthetic-b');
   const values={clientLabel:'Synthetic equipment service estimate',validUntil:'2026-10-20'};
   const first=store.create(a.operatorToken,values,'seed-quote-a-001');
   assert.equal(store.list(a.operatorToken).length,1);
   assert.equal(store.list(b.operatorToken).length,0);
   credentials.a=a.operatorToken;credentials.b=b.operatorToken;credentials.reviewer=a.reviewerToken;
   credentials.first=first;credentials.values=values;
  }else{
   const a=store.provision('synthetic-a'),b=store.provision('synthetic-b');
   const sku=oldRecipe.items[0].id,command={type:'receive',quantity:5};
   const first=store.command(a.operatorKey,sku,command,'seed-stock-a-001',1);
   assert.equal(store.context(a.operatorKey).items.find(v=>v.sku===sku).onHand,5);
   assert.equal(store.context(b.operatorKey).items.find(v=>v.sku===sku).onHand,0);
   credentials.a=a.operatorKey;credentials.b=b.operatorKey;credentials.reviewer=a.reviewerKey;
   credentials.first=first;credentials.sku=sku;credentials.command=command;
  }
 });
}
function proveOriginalStillWorks(file){
 withEngine(baselinePackage,file,store=>{
  if(family==='document'){
   assert.equal(store.workspace(credentials.a,'test-workspace').records.length,1);
   assert.equal(store.workspace(credentials.b,'test-workspace').records.length,0);
   assert.deepEqual(store.command(credentials.a,'test-workspace',credentials.command,'seed-document-a-001'),
    credentials.first);
  }else if(family==='quote'){
   phase='candidate-quote-list-a';assert.equal(store.list(credentials.a).length,1);
   phase='candidate-quote-list-b';assert.equal(store.list(credentials.b).length,0);
   phase='candidate-quote-replay';assert.deepEqual(store.create(credentials.a,credentials.values,'seed-quote-a-001'),credentials.first);
  }else{
   const item=store.context(credentials.a).items.find(v=>v.sku===credentials.sku);
   assert.equal(item.onHand,5);
   assert.equal(store.context(credentials.b).items.find(v=>v.sku===credentials.sku).onHand,0);
   assert.deepEqual(store.command(credentials.a,credentials.sku,credentials.command,'seed-stock-a-001',1),
    credentials.first);
  }
 });
}
function candidateCompatibility(copy){
 if(family==='inventory'){
  assert.throws(()=>engine(candidatePackage,copy),/RECIPE_MISMATCH/);
  return {readable:false,mode:'rejects_changed_inventory_recipe'};
 }
 return withEngine(candidatePackage,copy,store=>{
  if(family==='document'){
   const a=store.workspace(credentials.a,'test-workspace');
   assert.equal(a.records.length,1);
   assert.equal(store.workspace(credentials.b,'test-workspace').records.length,0);
   // A silently reused old recipe cannot count as successful upgrade to new behavior.
   assert.throws(()=>store.createWorkspace(credentials.a,{id:'test-workspace',recipeId:recipeOf(candidatePackage).id}),
     /WORKSPACE_CONFLICT/);
   assert.deepEqual(store.command(credentials.a,'test-workspace',credentials.command,'seed-document-a-001'),
    credentials.first);
   return {readable:true,mode:'old_workspace_still_bound_to_old_recipe'};
  }
  assert.equal(store.list(credentials.a).length,1);
  assert.equal(store.list(credentials.b).length,0);
  assert.deepEqual(store.create(credentials.a,credentials.values,'seed-quote-a-001'),credentials.first);
  phase='candidate-quote-reviewer';assert.throws(()=>store.create(credentials.reviewer,credentials.values,'reviewer-not-permitted'),/FORBIDDEN/);
  phase='candidate-quote-crosstenant';assert.throws(()=>store.get(credentials.b,'q1'),/NOT_FOUND/);
  return {readable:true,mode:'quote_receipts_replay_under_new_validity_policy'};
 });
}
function rejectWrongSchema(original,kind){
 const altered=createPrivate('invalid-'+kind);
 clone(original,altered);
 const db=new DatabaseSync(altered);
 try{
  if(kind==='version')db.exec('PRAGMA user_version=99');
  else db.exec('PRAGMA application_id='+(config.appId+1));
 }finally{db.close();}
 const before=snapshot(altered);
 assert.throws(()=>engine(candidatePackage,altered),new RegExp(config.wrongSchema));
 assert.equal(snapshot(altered).digest,before.digest);
}
function main(){
 phase='source-recipes';
 const first=recipeOf(baselinePackage),second=recipeOf(candidatePackage);
 assert.equal(first.id,second.id);assert.equal(first.family,second.family);
 assert.notDeepEqual(first,second);
 const original=createPrivate('baseline');
 const pinned=pinUncheckpointedWal(original);
 try{
 phase='seed-baseline';seedOld(original);
 phase='prove-uncheckpointed-wal';const walProof=verifyUncheckpointedWal(original);
 phase='snapshot-baseline';const expected=snapshot(original);
 assert.equal(expected.appId,config.appId);
 assert.ok(family!=='document'?expected.schemaVersion===1:[1,2].includes(expected.schemaVersion));
 const copied=createPrivate('candidate');
 phase='clone-candidate';clone(original,copied);
 const before=snapshot(copied);
 const copiedDb=new DatabaseSync(copied);
 try{assert.equal(copiedDb.prepare('SELECT COUNT(*) AS n FROM receipts').get().n,walProof.committedReceipts);}
 finally{copiedDb.close();}
 phase='candidate-open';const assessment=candidateCompatibility(copied);
 assert.equal(snapshot(copied).digest,before.digest,'Candidate must not silently mutate copied business state');
 phase='reject-unknown-version';rejectWrongSchema(original,'version');
 phase='reject-foreign-application';rejectWrongSchema(original,'application');
 assert.equal(snapshot(original).digest,expected.digest,'Candidate must not alter original baseline');
 phase='old-version-reopen';proveOriginalStillWorks(original);
 assert.equal(snapshot(original).digest,expected.digest,'Read and retry must remain idempotent');
 return {kind:'isolated-state-version-compatibility',family,id:first.id,passed:true,
  baselineUserVersion:expected.schemaVersion,sqliteApplicationIdentityVerified:true,
  snapshotFromCommittedWal:true,uncheckpointedCommittedWalVerified:true,
  mainFileOnlyMissesCommittedReceipts:true,walCommittedReceipts:walProof.committedReceipts,
  baselinePreserved:true,syntheticTenantsIsolated:true,
  idempotentReceiptsPreserved:true,candidateReadOnlyProbe:assessment.readable,
  changeGate:assessment.mode,unknownVersionRejected:true,foreignApplicationRejected:true,
  oldVersionReadbackVerified:true,schemaUpgradeApplied:false,
  automaticSharedStateMigrationApproved:false,productionCustomerStateMigrated:false,
  sourceReadOnly:true,externalMessagesSent:0,paymentsSent:0,
  realCustomers:null,collectedRevenue:null,releaseApproved:false};
 }finally{pinned.exec('ROLLBACK');pinned.close();}
}
try{console.log(JSON.stringify(main()));}
catch(error){
 const safe=['STATE_COMPAT_INPUT_INVALID','STATE_COMPAT_PATH_UNSAFE','RECIPE_MISMATCH',
  'SCHEMA_UNSUPPORTED','STORE_SCHEMA_INVALID','WORKSPACE_CONFLICT'];
 const code=safe.includes(error?.message)?error.message:'ASSERTION_OR_INTEGRITY_FAILURE';
 console.error('STATE_COMPAT_FAILED:'+family+':'+phase+':'+code);
 process.exitCode=1;
}
