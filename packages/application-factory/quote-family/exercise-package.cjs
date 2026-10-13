'use strict';
// Independently execute code from the compiled artifact; all state synthetic and destroyed afterwards.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
async function main(root,digest){
 if(typeof root!=='string'||!path.isAbsolute(root)||!/^[a-f0-9]{64}$/.test(digest))throw Error('INPUT_INVALID');
 const {verifyQuoteApp}=require('./manufacturing');
 const manifest=verifyQuoteApp(root,digest);
 const {openStore}=require(path.join(root,'store.js')),{createServer}=require(path.join(root,'server.js'));
 const recipe=require(path.join(root,'recipe.json'));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'quote-independent-execution-'));
 const filename=path.join(dir,'state.sqlite'),time=Date.parse('2026-10-13T12:00:00Z');let store,app;
 let now=time;
 const report={kind:'quote-app-assembled-acceptance',passed:false,recipeId:recipe.id,artifactDigest:digest,
  tenantIsolation:false,twoRoleGate:false,idempotentOrder:false,restartPersistence:false,
  internalExpiry:false,htmlServed:false,externalMessagesSent:0,paymentsSent:0,
  realCustomers:null,collectedRevenue:null,releaseApproved:false};
 try{
  store=openStore({filename,recipe,clock:()=>now});app=createServer({store,automation:false,pollMs:500});
  await app.listen(0);let base='http://127.0.0.1:'+app.port();
  const a=store.provision('synthetic-a'),b=store.provision('synthetic-b'),key='request-key-';
  async function request(route,token,method='GET',body,k){
   const res=await fetch(base+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),
    ...(body!==undefined?{'Content-Type':'application/json'}:{}),...(k?{'Idempotency-Key':key+k}:{})},
    ...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:res.status,value:await res.json()};
  }
  const html=await fetch(base+'/app').then(r=>r.text());assert.match(html,/Quote Desk/);
  report.htmlServed=true;
  const created=await request('/v1/quotes',a.operatorToken,'POST',
   {clientLabel:'Synthetic client',validUntil:'2026-10-20'},'create');
  assert.equal(created.status,201);let q=created.value;
  const replay=await request('/v1/quotes',a.operatorToken,'POST',
   {clientLabel:'Synthetic client',validUntil:'2026-10-20'},'create');
  assert.deepEqual(replay.value,q);
  assert.equal((await request('/v1/quotes',b.operatorToken)).value.length,0);
  assert.equal((await request('/v1/quotes/q1',b.operatorToken)).status,404);
  report.tenantIsolation=true;
  const item=recipe.items[0];async function command(role,type,extra={},k=type,expectedRevision=q.revision){
   return request('/v1/quotes/'+q.id+'/commands',role,'POST',
    {command:{type,...extra},expectedRevision},k);
  }
  let r=await command(a.operatorToken,'line_upsert',
    {line:{id:'l1',itemId:item.id,quantity:6,unitPriceCents:2750}});
  assert.equal(r.status,200);q=r.value;
  r=await command(a.operatorToken,'submit');assert.equal(r.status,200);q=r.value;
  assert.equal((await command(a.operatorToken,'approve',{},'selfapprove')).status,403);
  r=await command(a.reviewerToken,'approve');assert.equal(r.status,200);q=r.value;
  assert.equal((await command(a.reviewerToken,'convert',{},'reviewerconvert')).status,403);
  report.twoRoleGate=true;
  const revisionBeforeConvert=q.revision;
  r=await command(a.operatorToken,'convert');assert.equal(r.status,200);q=r.value;
  assert.equal(q.order.totalCents,16500);
  assert.deepEqual((await command(a.operatorToken,'convert',{},'convert',revisionBeforeConvert)).value,q);
  assert.equal((await request('/v1/orders',a.operatorToken)).value.length,1);
  report.idempotentOrder=true;
  await app.close();store.close();app=null;store=null;
  store=openStore({filename,recipe,clock:()=>now});app=createServer({store,pollMs:500});await app.listen(0);
  base='http://127.0.0.1:'+app.port();
  assert.equal((await request('/v1/orders',a.operatorToken)).value.length,1);
  report.restartPersistence=true;
  const second=await request('/v1/quotes',a.operatorToken,'POST',
   {clientLabel:'Expiring synthetic',validUntil:'2026-10-15'},'second');assert.equal(second.status,201);
  now=Date.parse('2026-10-21T12:00:00Z');assert.equal(store.sweep().expired,1);
  assert.equal(store.sweep().expired,0);
  assert.equal((await request('/v1/events',a.operatorToken)).value.filter(x=>x.kind==='quote_expired').length,1);
  report.internalExpiry=true;report.passed=true;return report;
 }finally{await app?.close();store?.close();fs.rmSync(dir,{recursive:true,force:true});}
}
if(require.main===module)main(process.argv[2],process.argv[3]).then(r=>console.log(JSON.stringify(r)))
 .catch(err=>{console.error('Quote package acceptance failed:',err.message);process.exitCode=1;});
module.exports={main};
