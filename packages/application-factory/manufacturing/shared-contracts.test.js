'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const shared=require('./shared-contracts');
const quote=require('../quote-family/manufacturing');
const inventory=require('../inventory-family/manufacturing');
const quoteRecipes=require('../quote-family/recipes.json');
const inventoryRecipes=require('../inventory-family/recipes.json');
const ROOT=path.resolve(__dirname,'../../..');
const sha=shared.sha256;
const tmp=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-shared-contract-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
function fixtureFiles(root,app){
 fs.mkdirSync(root,{recursive:true,mode:0o700});
 const dir=path.join(root,'package');fs.mkdirSync(dir,{mode:0o700});
 for(const [name,content] of Object.entries(app.files))
  fs.writeFileSync(path.join(dir,name),content,{flag:'wx',mode:0o600});
 return dir;
}
// Snapshots from the last fully accepted original source packages. A deliberately changed
// application file set or recipe simply changes the input fingerprint, so legitimate
// future product changes do not become pinned to an obsolete package digest.
const originalBundles={
 'print-estimate-desk':['ee914fd4d9fca00c0004d280380106a5fbc712e2019f6dcb509391331d8a910b','594b58dc28e2caadab096ea69bd5be9bf07f7ab642243fdd2faedfbe81e168e7'],
 'equipment-rental-estimates':['39c5692fc77884e4d38fa51c08f0ee2ee842556b294f186f283708721f4ef07a','e09ca5e5b0b1f866214415d816177d8011ec0cb4e26c19c28c2270184a6568ae'],
 'field-service-estimates':['e0a479b693a20315ff93a3ed73badf5323060ef906bcd1904dc2ae90fb5613ff','1c7a53ec852a9094988bf39193db54ff466a31eefd78b647697c7851426e10bc'],
 'mro-parts-replenishment':['6a46bd75f4fc9ed86525ceaf24cb7ff221f4ffa231da4d28fc38bbcbab8b7194','48c2cfd04559fa6dae6d963a626716eeb131c002ed8125728a5d6380833713e2'],
 'rental-consumables':['526a6a24720a94244261f60287b8cc2c3f9b875d5a5828c3031b70d639d70a73','75821255f29ddfd9f3a859a01e4feb7f4914637919e54a7f93483ac9da9f7df5'],
 'hospitality-supply-desk':['d4b43a7af6ea2557a80531db9da366126c340f1d55af97f59b889b58578d1c86','444443834698d0538b18a2f6daa9c9f46035f65fd1a99465c20097294380bac4']
};
function inputFingerprint(files){
 const rows=Object.entries(files).filter(([name])=>name!=='manifest.json')
  .map(([name,value])=>[name,sha(value)]).sort(([a],[b])=>a<b?-1:a>b?1:0);
 return sha(JSON.stringify(rows));
}
test('shared build-only contract keeps all six existing self-contained binary digests exactly unchanged',()=>{
 const snapshots=[];
 for(const recipe of quoteRecipes){
  const app=quote.compileQuoteApp(recipe),[previousInput,previousDigest]=originalBundles[recipe.id];
  if(inputFingerprint(app.files)===previousInput)assert.equal(app.digest,previousDigest,recipe.id);
  snapshots.push({family:'quote',id:recipe.id,digest:app.digest});
  assert.equal(app.manifest.files['server.js'],sha(app.files['server.js']));
  assert.ok(app.files['run.js'].includes("require("));
  for(const file of ['server.js','store.js','run.js','kernel.js']){
   assert.doesNotMatch(app.files[file],/require\(['"]\.\.\/manufacturing\/shared-contracts/);
  }
 }
 for(const recipe of inventoryRecipes){
  const app=inventory.compileInventoryPackage(recipe),[previousInput,previousDigest]=originalBundles[recipe.id];
  if(inputFingerprint(app.files)===previousInput)assert.equal(app.digest,previousDigest,recipe.id);
  snapshots.push({family:'inventory',id:recipe.id,digest:app.digest});
  assert.equal(app.manifest.files['server.js'],sha(app.files['server.js']));
  for(const file of ['server.js','store.js','run.js','engine.js']){
   assert.doesNotMatch(app.files[file],/require\(['"]\.\.\/manufacturing\/shared-contracts/);
  }
 }
 assert.equal(snapshots.length,6);
 assert.equal(new Set(snapshots.map(x=>x.digest)).size,6);
});
test('real separate family verifiers now share manifest and source-byte validation without mixing rules',t=>{
 const root=tmp(t);
 const q=quote.compileQuoteApp(quoteRecipes[0]);
 const v=inventory.compileInventoryPackage(inventoryRecipes[0]);
 const qdir=fixtureFiles(path.join(root,'quote'),q);
 const idir=fixtureFiles(path.join(root,'inventory'),v);
 assert.equal(quote.verifyQuoteApp(qdir,q.digest).recipeId,q.recipeId);
 assert.equal(inventory.verifyInventoryPackage(idir,v.digest).recipeId,v.id);
 assert.throws(()=>inventory.verifyInventoryPackage(qdir,q.digest),/ARTIFACT_INVALID/);
 assert.throws(()=>quote.verifyQuoteApp(idir,v.digest),/PACKAGE_INVALID/);
 assert.equal(fs.statSync(qdir).mode&0o077,0);
 assert.equal(fs.statSync(idir).mode&0o077,0);
});
test('package integrity rejects injected top-level files and missing or unreadable code before parsing recipe',t=>{
 const root=tmp(t),packageApp=quote.compileQuoteApp(quoteRecipes[0]);
 const dir=fixtureFiles(root,packageApp);
 fs.writeFileSync(path.join(dir,'evil.js'),'// unauthorized\n',{mode:0o600});
 assert.throws(()=>quote.verifyQuoteApp(dir,packageApp.digest),/PACKAGE_INVALID/);
 fs.unlinkSync(path.join(dir,'evil.js'));
 fs.unlinkSync(path.join(dir,'server.js'));
 assert.throws(()=>quote.verifyQuoteApp(dir,packageApp.digest),/PACKAGE_INVALID/);
});
test('source reader rejects symlink injection, duplicates, executable escape and malformed source directories',t=>{
 const root=tmp(t),source=path.join(root,'source');fs.mkdirSync(source,{mode:0o700});
 fs.writeFileSync(path.join(source,'safe.js'),'module.exports={ok:true};',{mode:0o600});
 assert.equal(shared.trustedSourceFiles({sourceRoot:source,names:['safe.js'],maxBytes:1024})['safe.js'],
  'module.exports={ok:true};');
 assert.throws(()=>shared.trustedSourceFiles({sourceRoot:source,names:['safe.js','safe.js'],maxBytes:1024}),/SOURCE_INVALID/);
 assert.throws(()=>shared.trustedSourceFiles({sourceRoot:source,names:['../escape'],maxBytes:1024}),/SOURCE_INVALID/);
 fs.symlinkSync(path.join(source,'safe.js'),path.join(source,'linked.js'));
 assert.throws(()=>shared.trustedSourceFiles({sourceRoot:source,names:['linked.js'],maxBytes:1024}),/SOURCE_INVALID/);
});
test('private output never points into source repository, accepts safe temp and rejects root or symlink',t=>{
 const root=tmp(t);
 assert.equal(shared.privateDirectory(root),root);
 assert.equal(shared.outsideRepository(root),root);
 assert.throws(()=>shared.outsideRepository(ROOT),/OUTPUT_UNSAFE/);
 assert.throws(()=>shared.outsideRepository(path.join(ROOT,'temp')),/OUTPUT_UNSAFE/);
 const link=path.join(root,'link');fs.symlinkSync(ROOT,link);
 assert.throws(()=>shared.privateDirectory(link),/OUTPUT_UNSAFE/);
 if(process.platform!=='win32'){
  const publicDir=path.join(root,'public');fs.mkdirSync(publicDir,{mode:0o755});
  assert.throws(()=>shared.privateDirectory(publicDir),/OUTPUT_UNSAFE/);
 }
});
test('atomic receipt writer preserves private permissions and cannot overwrite a malicious symlink',t=>{
 const root=tmp(t),receipt=path.join(root,'receipt.json');
 shared.privateJson(receipt,{schema:1,status:'pending'});
 shared.privateJson(receipt,{schema:1,status:'accepted',releaseApproved:false});
 const row=JSON.parse(fs.readFileSync(receipt,'utf8'));
 assert.equal(row.status,'accepted');
 assert.equal(row.releaseApproved,false);
 if(process.platform!=='win32')assert.equal(fs.statSync(receipt).mode&0o077,0);
 const source=path.join(root,'sensitive.txt');
 fs.writeFileSync(source,'private sentry',{mode:0o600});
 const link=path.join(root,'symlink.json');fs.symlinkSync(source,link);
 assert.throws(()=>shared.privateJson(link,{leak:true}),/OUTPUT_UNSAFE/);
 assert.equal(fs.readFileSync(source,'utf8'),'private sentry');
});
test('accepted receipt writer is write-once and identical rechecks never alter original evidence',t=>{
 const root=tmp(t),receipt=path.join(root,'accepted.json');
 const evidence={kind:'acceptance',artifactDigest:'a'.repeat(64),passed:true,releaseApproved:false};
 assert.equal(shared.immutablePrivateJson(receipt,evidence).created,true);
 const original=fs.readFileSync(receipt),before=fs.statSync(receipt,{bigint:true});
 assert.equal(shared.immutablePrivateJson(receipt,evidence).created,false);
 const after=fs.statSync(receipt,{bigint:true});
 assert.deepEqual(fs.readFileSync(receipt),original);
 assert.equal(after.ino,before.ino);assert.equal(after.mtimeNs,before.mtimeNs);
 assert.throws(()=>shared.immutablePrivateJson(receipt,{...evidence,passed:false}),/RECEIPT_IMMUTABLE/);
 assert.deepEqual(fs.readFileSync(receipt),original);
});
test('shared process lock rejects an active owner and releases only its own exact record',t=>{
 const root=tmp(t),file=path.join(root,'.manufacturing.lock'),first=shared.privateProcessLock(file);
 assert.equal(first.record.pid,process.pid);
 if(process.platform==='linux'&&first.record.schemaVersion===2)
  assert.match(first.record.processIdentity,/^[a-f0-9]{64}$/);
 assert.throws(()=>shared.privateProcessLock(file),/MANUFACTURING_BUSY/);
 const original=fs.readFileSync(file,'utf8');
 assert.equal(JSON.parse(original).token,first.record.token);
 first.release();assert.equal(fs.existsSync(file),false);
 const second=shared.privateProcessLock(file);assert.notEqual(second.record.token,first.record.token);
 second.release();
});
test('a reused live PID does not pin a dead process-identity lock forever',t=>{
 if(process.platform!=='linux')return t.skip('Linux process identity acceptance required');
 const root=tmp(t),file=path.join(root,'.manufacturing.lock'),original={schemaVersion:2,
  pid:process.pid,processIdentity:'0'.repeat(64),
  startedAt:new Date(Date.now()-1000).toISOString(),token:'a'.repeat(64)};
 fs.writeFileSync(file,JSON.stringify(original)+'\n',{mode:0o600});
 const lease=shared.privateProcessLock(file),history=path.join(root,'.lock-history'),
  names=fs.readdirSync(history),
  event=JSON.parse(fs.readFileSync(path.join(history,names.find(name=>name.endsWith('.json'))),'utf8'));
 assert.deepEqual(event.original,original);
 assert.equal(event.original.pid,process.pid);
 assert.equal(event.original.processIdentity,'0'.repeat(64));
 assert.ok(Date.parse(event.observedDeadAt)>=Date.parse(original.startedAt));
 lease.release();
});
test('interrupted incomplete-stage preservation reuses its original observation',t=>{
 const root=tmp(t),name='.assembly-crash',stage=path.join(root,name),history=path.join(root,'.incomplete-history');
 fs.mkdirSync(stage,{mode:0o700});const content='unfinished source';
 fs.writeFileSync(path.join(stage,'partial'),content,{mode:0o600});fs.mkdirSync(history,{mode:0o700});
 const treeDigest=sha(JSON.stringify([['partial',0o600,Buffer.byteLength(content),sha(content)]])),
  archivedName=name.slice(1)+'-'+treeDigest,event=path.join(history,archivedName+'.json'),
  record={schemaVersion:1,kind:'incomplete-private-build-preserved',
   observedIncompleteAt:new Date().toISOString(),originalName:name,treeDigest,entryCount:1,
   bytes:Buffer.byteLength(content)};
 shared.immutablePrivateJson(event,record);const original=fs.readFileSync(event),before=fs.statSync(event,{bigint:true});
 const recovered=shared.preserveIncompleteStages(root,{prefixes:['.assembly-']});
 assert.equal(recovered.length,1);assert.equal(recovered[0].observedIncompleteAt,record.observedIncompleteAt);
 assert.deepEqual(fs.readFileSync(event),original);
 assert.equal(fs.statSync(event,{bigint:true}).mtimeNs,before.mtimeNs);
 assert.equal(fs.readFileSync(path.join(history,archivedName,'partial'),'utf8'),content);
 assert.equal(fs.existsSync(stage),false);
});
test('interrupted stale-lock recovery resumes without replacing its original observation',t=>{
 if(process.platform==='win32')return t.skip('Linux process ownership acceptance required');
 const root=tmp(t),file=path.join(root,'.manufacturing.lock');
 const child=spawnSync(process.execPath,['-e',
  "require(process.argv[1]).privateProcessLock(process.argv[2])",require.resolve('./shared-contracts'),file],
  {encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);assert.equal(fs.existsSync(file),true);
 const original=fs.readFileSync(file),record=JSON.parse(original),history=path.join(root,'.lock-history');
 fs.mkdirSync(history,{mode:0o700});
 const stem='manufacturing.lock-'+record.token,archived=path.join(history,stem+'.lock'),
  event=path.join(history,stem+'.json'),observedDeadAt=new Date().toISOString();
 fs.linkSync(file,archived);
 shared.immutablePrivateJson(event,{schemaVersion:1,kind:'stale-private-process-lock-recovery',
  observedDeadAt,originalDigest:sha(original),
  legacyRecord:false,original:record});
 const evidence=fs.readFileSync(event),before=fs.statSync(event,{bigint:true});
 const resumed=shared.privateProcessLock(file);
 assert.deepEqual(fs.readFileSync(event),evidence);
 assert.equal(fs.statSync(event,{bigint:true}).mtimeNs,before.mtimeNs);
 assert.deepEqual(fs.readFileSync(archived),original);
 resumed.release();
});
test('future-dated dead-owner lock cannot create impossible recovery chronology',t=>{
 if(process.platform==='win32')return t.skip('Linux process ownership acceptance required');
 const root=tmp(t),file=path.join(root,'.manufacturing.lock');
 const child=spawnSync(process.execPath,['-e',
  "require(process.argv[1]).privateProcessLock(process.argv[2])",require.resolve('./shared-contracts'),file],
  {encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);
 const record=JSON.parse(fs.readFileSync(file,'utf8'));
 record.startedAt=new Date(Date.now()+3600000).toISOString();
 const original=Buffer.from(JSON.stringify(record)+String.fromCharCode(10));
 fs.writeFileSync(file,original,{mode:0o600});
 assert.throws(()=>shared.privateProcessLock(file),/MANUFACTURING_BUSY/);
 assert.deepEqual(fs.readFileSync(file),original);
 assert.equal(fs.existsSync(path.join(root,'.lock-history')),false);
});
test('signed-looking but invalid manifest hashes never bypass package contract',t=>{
 const root=tmp(t),app=inventory.compileInventoryPackage(inventoryRecipes[0]);
 const dir=fixtureFiles(root,app);
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
 manifest.files['server.js']='0'.repeat(64);
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest),{mode:0o600});
 assert.throws(()=>inventory.verifyInventoryPackage(dir,app.digest),/ARTIFACT_INVALID/);
});

