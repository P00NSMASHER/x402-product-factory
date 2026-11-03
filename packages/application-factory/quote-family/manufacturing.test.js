'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const recipes=require('./recipes.json');
const {compileQuoteApp,writeQuoteApp,verifyQuoteApp,manufactureQuoteBatch}=require('./manufacturing');
function dir(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'quote-app-build-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}
test('three independent production family packages contain real tenant service, UI and source receipts',t=>{
 const root=dir(t);for(const recipe of recipes){
  const app=compileQuoteApp(recipe);assert.equal(app.manifest.family,'quote-to-order');
  assert.equal(app.manifest.releaseApproved,false);assert.equal(app.manifest.collectedRevenue,null);
  assert.equal(app.manifest.marketValidated,false);assert.equal(app.manifest.billingEnabled,false);
  const dest=path.join(root,recipe.id);writeQuoteApp(app,dest);
  assert.equal(verifyQuoteApp(dest,app.digest).recipeId,recipe.id);
  const pkg=JSON.parse(fs.readFileSync(path.join(dest,'package.json'),'utf8'));
  assert.equal(pkg.private,true);assert.ok(pkg.scripts.start.includes('serve'));
  assert.equal(fs.existsSync(path.join(dest,'server.js')),true);
  assert.equal(fs.existsSync(path.join(dest,'store.js')),true);
  assert.equal(fs.existsSync(path.join(dest,'index.html')),true);
  assert.equal(fs.existsSync(path.join(dest,'client.js')),true);
 }});
test('tampered app files and untracked additions invalidate exact package identity',t=>{
 const root=dir(t),app=compileQuoteApp(recipes[0]);const dest=path.join(root,'app');writeQuoteApp(app,dest);
 fs.appendFileSync(path.join(dest,'client.js'),'\n/* tampered */');assert.throws(()=>verifyQuoteApp(dest,app.digest),/PACKAGE_INVALID/);
 const d2=path.join(root,'app2');writeQuoteApp(app,d2);fs.writeFileSync(path.join(d2,'hidden-token.txt'),'secret');
 assert.throws(()=>verifyQuoteApp(d2,app.digest),/PACKAGE_INVALID/);
});
test('compile never crawls private workspace secrets or allows source directory redirection',()=>{
 assert.throws(()=>compileQuoteApp(recipes[0],{sourceRoot:'/tmp/untrusted'}),/SOURCE_INVALID/);
 assert.throws(()=>compileQuoteApp({...recipes[0],id:'../../bad'}));
});
test('output requires an empty private path outside the source repository',t=>{
 const root=dir(t),app=compileQuoteApp(recipes[0]),target=path.join(root,'app');writeQuoteApp(app,target);
 assert.throws(()=>writeQuoteApp(app,target),/OUTPUT_EXISTS/);
 assert.throws(()=>writeQuoteApp(app,path.resolve(__dirname,'../quote-family/generated')),/OUTPUT_UNSAFE/);
});
test('batch preserves a dead quote staging tree before continuing',t=>{
 const root=dir(t),outputRoot=path.join(root,'apps'),stage=path.join(outputRoot,'.candidate-dead');
 fs.mkdirSync(stage,{recursive:true,mode:0o700});fs.writeFileSync(path.join(stage,'partial'),'quote source',{mode:0o600});
 const result=manufactureQuoteBatch({outputRoot,recipes:[recipes[0]]});
 assert.equal(result.accepted,1);assert.equal(fs.existsSync(stage),false);
 const history=path.join(outputRoot,'.incomplete-history'),
  archived=fs.readdirSync(history,{withFileTypes:true}).find(entry=>entry.isDirectory());
 assert.equal(fs.readFileSync(path.join(history,archived.name,'partial'),'utf8'),'quote source');
 assert.equal(JSON.parse(fs.readFileSync(path.join(history,archived.name+'.json'),'utf8')).kind,
  'incomplete-private-build-preserved');
});
test('batch manufactures and independently exercises all three full-stack applications',t=>{
 const root=dir(t),result=manufactureQuoteBatch({outputRoot:path.join(root,'apps')});
 assert.equal(result.accepted,3);assert.equal(result.failed,0);assert.equal(result.realCustomers,null);
 assert.equal(result.collectedRevenue,null);assert.equal(result.releaseApproved,false);
 assert.equal(result.transmittedMessages,0);assert.equal(result.paymentsSent,0);
 assert.equal(result.verification,'executed-packaged-quote-lifecycle');
 for(const row of result.apps){assert.equal(row.status,'accepted');assert.ok(row.digest);
  const app=path.join(root,'apps',row.id+'-'+row.digest);assert.equal(verifyQuoteApp(app,row.digest).recipeId,row.id);
  const acceptance=JSON.parse(fs.readFileSync(path.join(root,'apps','verification',row.id+'-'+row.digest+'.json'),'utf8'));
  assert.equal(acceptance.tenantIsolation,true);assert.equal(acceptance.twoRoleGate,true);
  assert.equal(acceptance.restartPersistence,true);assert.equal(acceptance.idempotentOrder,true);
  assert.equal(acceptance.externalMessagesSent,0);
 }
});
test('batch prevents accidental repeat generation by verifying instead of rewriting',t=>{
 const root=dir(t),outputRoot=path.join(root,'apps');const a=manufactureQuoteBatch({outputRoot});
 const proof=path.join(outputRoot,'verification',a.apps[0].id+'-'+a.apps[0].digest+'.json');
 const original=fs.readFileSync(proof),before=fs.statSync(proof,{bigint:true});
 assert.equal(a.accepted,3);const b=manufactureQuoteBatch({outputRoot});
 assert.equal(b.accepted,3);assert.equal(b.reused,3);assert.equal(b.failed,0);
 assert.deepEqual(fs.readFileSync(proof),original);assert.equal(fs.statSync(proof,{bigint:true}).mtimeNs,before.mtimeNs);
 const one=path.join(outputRoot,a.apps[0].id+'-'+a.apps[0].digest);
 fs.appendFileSync(path.join(one,'manifest.json'),'\nwrong bytes');const c=manufactureQuoteBatch({outputRoot});
 assert.equal(c.failed,1);assert.equal(c.accepted,2);
 assert.equal(c.apps.find(v=>v.id===a.apps[0].id).status,'quarantined');
});
test('new quote source identity preserves the earlier digest-addressed acceptance receipt',t=>{
 const root=dir(t),outputRoot=path.join(root,'apps'),a=manufactureQuoteBatch({outputRoot,recipes:[recipes[0]]});
 const changed={...recipes[0],title:recipes[0].title+' revision'};
 const b=manufactureQuoteBatch({outputRoot,recipes:[changed]});
 assert.equal(a.accepted,1);assert.equal(b.accepted,1);assert.notEqual(a.apps[0].digest,b.apps[0].digest);
 for(const row of [a.apps[0],b.apps[0]])assert.equal(fs.existsSync(path.join(outputRoot,'verification',
  row.id+'-'+row.digest+'.json')),true);
});
test('a failed quote source identity cannot block a corrected digest or replace its original failure',t=>{
 const root=dir(t),outputRoot=path.join(root,'apps'),recipe=recipes[0];let reject=true;
 const acceptance=(folder,digest)=>{
  if(reject)throw Error('synthetic first-source rejection');
  return {kind:'quote-app-assembled-acceptance',passed:true,recipeId:recipe.id,artifactDigest:digest,
   tenantIsolation:true,twoRoleGate:true,idempotentOrder:true,restartPersistence:true,
   internalExpiry:true,htmlServed:true,externalMessagesSent:0,paymentsSent:0,
   realCustomers:null,collectedRevenue:null,releaseApproved:false};
 };
 const failed=manufactureQuoteBatch({outputRoot,recipes:[recipe],accept:acceptance});
 assert.equal(failed.failed,1);
 const oldDigest=failed.apps[0].digest,oldFailure=path.join(outputRoot,'.quarantine',recipe.id+'-'+oldDigest+'.json');
 assert.equal(fs.existsSync(oldFailure),true);
 const failure=JSON.parse(fs.readFileSync(oldFailure,'utf8'));
 assert.equal(failure.kind,'quote-manufacturing-failure');
 assert.equal(failure.reason,'ACCEPTANCE_FAILED');
 assert.ok(Number.isFinite(Date.parse(failure.observedFailedAt)));
 const original=fs.readFileSync(oldFailure),before=fs.statSync(oldFailure,{bigint:true});
 reject=false;
 const held=manufactureQuoteBatch({outputRoot,recipes:[recipe],accept:acceptance});
 assert.equal(held.failed,1);assert.equal(held.apps[0].reason,'PREVIOUS_FAILURE');
 assert.deepEqual(fs.readFileSync(oldFailure),original);
 assert.equal(fs.statSync(oldFailure,{bigint:true}).mtimeNs,before.mtimeNs);
 const corrected={...recipe,title:recipe.title+' corrected source'},
  accepted=manufactureQuoteBatch({outputRoot,recipes:[corrected],accept:acceptance});
 assert.equal(accepted.accepted,1);assert.equal(accepted.failed,0);
 assert.notEqual(accepted.apps[0].digest,oldDigest);
 assert.deepEqual(fs.readFileSync(oldFailure),original);
 assert.equal(fs.statSync(oldFailure,{bigint:true}).mtimeNs,before.mtimeNs);
});
test('legacy ID-only quote quarantine remains unchanged and applies only to its recorded digest',t=>{
 const root=dir(t),outputRoot=path.join(root,'apps'),quarantine=path.join(outputRoot,'.quarantine'),
  recipe=recipes[0],old=compileQuoteApp(recipe),legacy=path.join(quarantine,recipe.id+'.json');
 fs.mkdirSync(quarantine,{recursive:true,mode:0o700});
 fs.writeFileSync(legacy,JSON.stringify({id:recipe.id,digest:old.digest,status:'quarantined',
  reason:'ACCEPTANCE_FAILED'},null,2)+'\n',{mode:0o600});
 const original=fs.readFileSync(legacy),before=fs.statSync(legacy,{bigint:true}),acceptance=(folder,digest)=>({
  kind:'quote-app-assembled-acceptance',passed:true,recipeId:recipe.id,artifactDigest:digest,
  tenantIsolation:true,twoRoleGate:true,idempotentOrder:true,restartPersistence:true,
  internalExpiry:true,htmlServed:true,externalMessagesSent:0,paymentsSent:0,
  realCustomers:null,collectedRevenue:null,releaseApproved:false
 });
 const held=manufactureQuoteBatch({outputRoot,recipes:[recipe],accept:acceptance});
 assert.equal(held.failed,1);assert.equal(held.apps[0].reason,'PREVIOUS_FAILURE');
 const corrected={...recipe,title:recipe.title+' legacy-compatible correction'},
  accepted=manufactureQuoteBatch({outputRoot,recipes:[corrected],accept:acceptance});
 assert.equal(accepted.accepted,1);assert.equal(accepted.failed,0);
 assert.deepEqual(fs.readFileSync(legacy),original);
 assert.equal(fs.statSync(legacy,{bigint:true}).mtimeNs,before.mtimeNs);
});

