'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const recipes=require('../recipes.json');
const ROOT=path.resolve(__dirname,'../../..');
let A={};try{A=require('./assembler');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
function unit(t){
  assert.equal(typeof A.compileApplication,'function','full-stack application compiler must exist');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'factory-assembly-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;
}
test('compiles a deterministic complete app with exactly one selected workflow',t=>{
  unit(t);const a=A.compileApplication(recipes[0]),b=A.compileApplication(structuredClone(recipes[0]));
  assert.deepEqual(a,b);assert.match(a.digest,/^[0-9a-f]{64}$/);
  for(const file of ['scripts/run-application-runtime.js','scripts/application-recovery.js','packages/application-factory/runtime/browser.html','packages/application-factory/runtime/runtime.js','packages/application-factory/runtime/vault.js','packages/application-factory/runtime/recovery.js','package.json','manifest.json','growth/index.html','growth/offer.json'])assert.ok(a.files[file],file);
  assert.deepEqual(JSON.parse(a.files['packages/application-factory/recipes.json']),[recipes[0]]);
  assert.equal(a.manifest.releaseApproved,false);assert.equal(a.manifest.billingEnabled,false);assert.equal(a.manifest.externalDelivery,false);
});
test('each recipe produces its own independently runnable artifact identity',t=>{
  unit(t);const apps=recipes.map(A.compileApplication);assert.equal(new Set(apps.map(a=>a.digest)).size,3);
  for(let i=0;i<apps.length;i++)assert.equal(apps[i].manifest.recipeId,recipes[i].id);
});
test('excludes repository credentials tests and unrelated paid API products',t=>{
  unit(t);const app=A.compileApplication(recipes[0]);
  assert.ok(Object.keys(app.files).length>15);
  assert.ok(Object.keys(app.files).every(name=>!/(^|\/)\.env|\.git\/|\.sqlite|\.test\.|^products\/|^generated\//.test(name)));
  assert.equal(JSON.parse(app.files['package.json']).private,true);
});
test('rejects invalid recipes before producing output',t=>{
  unit(t);for(const value of [null,{}, {...recipes[0],id:'../unsafe'},{...recipes[0],hiddenCommand:'run'}])assert.throws(()=>A.compileApplication(value),/RECIPE_INVALID/);
});
test('validates 100 distinct configured editions without inventing customers or sales',t=>{
  unit(t);const compiled=Array.from({length:100},(_,i)=>A.compileApplication({...recipes[i%3],id:'synthetic-edition-'+i}));
  assert.equal(new Set(compiled.map(a=>a.digest)).size,100);
  for(const a of compiled){assert.equal(a.manifest.realCustomers,null);assert.equal(a.manifest.collectedRevenue,null);}
});
test('writes immutable artifacts and verifies all source bytes against the expected digest',t=>{
  const root=unit(t),app=A.compileApplication(recipes[0]),dest=path.join(root,'app');A.writeApplication(app,dest);
  assert.equal(A.verifyApplication(dest,app.digest).digest,app.digest);
  assert.throws(()=>A.writeApplication(app,dest),/OUTPUT_EXISTS/);
});
test('rejects tampered missing and unexpected files without replacing accepted output',t=>{
  const root=unit(t),app=A.compileApplication(recipes[0]);
  for(const attack of ['tampered','missing','extra']){
    const dest=path.join(root,attack);A.writeApplication(app,dest);
    const file=path.join(dest,'packages/application-factory/runtime/browser.html');
    if(attack==='tampered')fs.appendFileSync(file,'changed');else if(attack==='missing')fs.unlinkSync(file);else fs.writeFileSync(path.join(dest,'unexpected.env'),'PRIVATE');
    assert.throws(()=>A.verifyApplication(dest,app.digest),/ARTIFACT_INVALID/);
  }
});
test('rejects an internally consistent replacement manifest under the original trusted digest',t=>{
  const root=unit(t),a=A.compileApplication(recipes[0]),b=A.compileApplication(recipes[1]);
  const dest=path.join(root,'app');A.writeApplication(b,dest);
  assert.throws(()=>A.verifyApplication(dest,a.digest),/ARTIFACT_INVALID/);
});
test('rejects symbolic-link artifacts and output parents',t=>{
  const root=unit(t),app=A.compileApplication(recipes[0]),dest=path.join(root,'app');A.writeApplication(app,dest);
  const file=path.join(dest,'packages/application-factory/runtime/browser.html');fs.unlinkSync(file);fs.symlinkSync(path.join(ROOT,'packages/application-factory/runtime/browser.html'),file);
  assert.throws(()=>A.verifyApplication(dest,app.digest),/ARTIFACT_INVALID/);
  fs.symlinkSync(root,path.join(root,'redirect'));
  assert.throws(()=>A.writeApplication(app,path.join(root,'redirect','other')),/OUTPUT_UNSAFE/);
});
test('rejects a hard-linked assembled source alias outside the package',t=>{
  if(process.platform==='win32')return t.skip('POSIX link-count acceptance required');
  const root=unit(t),app=A.compileApplication(recipes[0]),dest=path.join(root,'app');A.writeApplication(app,dest);
  const file=path.join(dest,'packages/application-factory/runtime/browser.html'),alias=path.join(root,'browser-alias.html');
  fs.linkSync(file,alias);assert.equal(fs.statSync(file).nlink,2);
  assert.throws(()=>A.verifyApplication(dest,app.digest),/ARTIFACT_INVALID/);
});
test('source allowlist refuses a missing module or symbolic-link source',t=>{
  const root=unit(t),source=path.join(root,'source');
  for(const rel of A.SOURCE_FILES){fs.mkdirSync(path.dirname(path.join(source,rel)),{recursive:true});fs.copyFileSync(path.join(ROOT,rel),path.join(source,rel));}
  const file=path.join(source,'packages/application-factory/runtime/vault.js');fs.unlinkSync(file);
  assert.throws(()=>A.compileApplication(recipes[0],{sourceRoot:source}),/SOURCE_INVALID/);
  fs.symlinkSync(path.join(ROOT,'packages/application-factory/runtime/vault.js'),file);
  assert.throws(()=>A.compileApplication(recipes[0],{sourceRoot:source}),/SOURCE_INVALID/);
});

