'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openStore}=require('./store'),recipe=require('./recipes.json')[0];
let serverApi={};try{serverApi=require('./server');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'inventory-family-server-'));
 const store=openStore({filename:path.join(root,'inventory.sqlite'),recipe,clock:()=>Date.parse('2026-10-13T12:00:00Z')}),
 tenant=store.provision('synthetic-a');
 const server=serverApi.createServer({store,automation:false});t.after(async()=>{await server.close();store.close();fs.rmSync(root,{recursive:true,force:true});});
 return {store,tenant,server};}
test('server is loopback-only, authenticated, and rejects forged host or origin',async t=>{
 assert.equal(typeof serverApi.createServer,'function');
 const x=setup(t);await x.server.listen({port:0});
 const url='http://127.0.0.1:'+x.server.address().port;
 const unauthorized=await fetch(url+'/v1/context');assert.equal(unauthorized.status,401);
 const authorized=await fetch(url+'/v1/context',{headers:{Authorization:'Bearer '+x.tenant.operatorKey}});
 assert.equal(authorized.status,200);
 const data=await authorized.json();assert.equal(data.role,'operator');assert.equal(data.items.length,3);
 assert.equal(data.releaseApproved,false);
 const forged=await fetch(url+'/v1/context',{headers:{Authorization:'Bearer '+x.tenant.operatorKey,Origin:'https://bad.invalid'}});
 assert.equal(forged.status,403);
 const host=await fetch(url+'/v1/context',{headers:{Host:'malicious.example.org',Authorization:'Bearer '+x.tenant.operatorKey}});
 assert.equal(host.status,403);
});
test('role separation and idempotence protect replenishment decisions over real HTTP',async t=>{
 const x=setup(t);await x.server.listen({port:0});const url='http://127.0.0.1:'+x.server.address().port;
 const sku=recipe.items[0].id;
 async function command(key,body,k='request-1'){
  const res=await fetch(url+'/v1/command',{method:'POST',headers:{Authorization:'Bearer '+key,Origin:url,'Content-Type':'application/json','Idempotency-Key':k},body:JSON.stringify(body)});
  return {status:res.status,body:await res.json()};
 }
 const initial={sku,command:{type:'receive',quantity:8},expectedRevision:1};
 const first=await command(x.tenant.operatorKey,initial);
 assert.equal(first.status,200);
 const again=await command(x.tenant.operatorKey,initial);
 assert.equal(again.status,200);assert.deepEqual(again.body,first.body);
 const reviewer=await command(x.tenant.reviewerKey,{sku,command:{type:'receive',quantity:8},expectedRevision:2},'k2');
 assert.equal(reviewer.status,403);
 const stale=await command(x.tenant.operatorKey,{sku,command:{type:'receive',quantity:1},expectedRevision:1},'k3');
 assert.equal(stale.status,409);
 const request=await command(x.tenant.operatorKey,{sku,command:{type:'request_reorder'},expectedRevision:2},'k4');
 assert.equal(request.status,200);
 const approve=await command(x.tenant.reviewerKey,{sku,command:{type:'approve'},expectedRevision:3},'k5');
 assert.equal(approve.status,200);assert.equal(approve.body.item.proposals[0].orderPlaced,false);
});
test('public UI is static and has restrictive CSP without remote dependencies',async t=>{
 const x=setup(t);await x.server.listen({port:0});const url='http://127.0.0.1:'+x.server.address().port;
 for(const p of ['/app','/assets/client.js','/assets/style.css']){
  const r=await fetch(url+p);assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/connect-src 'self'/);
  assert.match(r.headers.get('x-frame-options'),/DENY/);
 }
 const html=await (await fetch(url+'/app')).text();
 assert.match(html,/Inventory/);assert.doesNotMatch(html,/https:\/\/|<iframe|mailto:|checkout|stripe/i);
});
