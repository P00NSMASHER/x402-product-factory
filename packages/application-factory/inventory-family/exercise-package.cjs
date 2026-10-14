'use strict';
// Independent executed acceptance: import code only from assembled package, not source family modules.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const check=async(root,scratch,digest)=>{
 const {openStore}=require(path.join(root,'store.js'));
 const {createServer}=require(path.join(root,'server.js'));
 const recipe=JSON.parse(fs.readFileSync(path.join(root,'recipe.json'),'utf8'));
 const file=path.join(scratch,'exercise.sqlite'),time=()=>Date.parse('2026-10-13T12:00:00Z');
 let store=openStore({filename:file,recipe,clock:time}),server=null;
 const expected=recipe.items[0].id;
 try{
  const a=store.provision('synthetic-alpha'),b=store.provision('synthetic-beta');
  assert.notEqual(a.operatorKey,b.operatorKey);
  assert.notEqual(a.operatorKey,a.reviewerKey);
  assert.equal(store.context(b.operatorKey).items[0].onHand,0);
  const action=(token,sku,command,key,rev)=>store.command(token,sku,command,key,rev);
  const received=action(a.operatorKey,expected,{type:'receive',quantity:5},'stock-receive-1',1);
  assert.equal(received.item.onHand,5);
  assert.deepEqual(action(a.operatorKey,expected,{type:'receive',quantity:5},'stock-receive-1',1),received);
  assert.throws(()=>action(a.operatorKey,expected,{type:'receive',quantity:6},'stock-receive-1',1),/IDEMPOTENCY_CONFLICT/);
  assert.throws(()=>action(a.operatorKey,expected,{type:'receive',quantity:1},'stale-op-1',1),/VERSION_CONFLICT/);
  const reserved=action(a.operatorKey,expected,{type:'reserve',quantity:2},'stock-reserve-2',2);
  assert.equal(reserved.item.available,3);
  const request=action(a.operatorKey,expected,{type:'request_reorder'},'stock-request-3',3);
  assert.equal(request.item.proposals[0].status,'pending_review');
  assert.throws(()=>action(a.operatorKey,expected,{type:'approve'},'illegal-approval',4),/FORBIDDEN/);
  const approved=action(a.reviewerKey,expected,{type:'approve'},'stock-review-4',4);
  assert.equal(approved.item.proposals[0].orderPlaced,false);
  assert.equal(approved.item.proposals[0].spendCommitted,false);
  const handled=action(a.operatorKey,expected,{type:'fulfill'},'stock-internal-arrival-5',5);
  assert.equal(handled.item.onOrder,0);
  assert.equal(store.context(b.operatorKey).items.find(x=>x.sku===expected).onHand,0);
  const sweep=store.sweep();
  assert.ok(sweep.proposed>=recipe.items.length-1);
  assert.equal(sweep.externalOrdersPlaced,0);assert.equal(sweep.emailsSent,0);assert.equal(sweep.paymentsSent,0);
  const repeated=store.sweep();assert.equal(repeated.proposed,0);
  server=createServer({store,automation:false});
  const address=await server.listen({port:0}),url='http://127.0.0.1:'+address.port;
  const status=await fetch(url+'/health');assert.equal(status.status,200);
  const unauthorized=await fetch(url+'/v1/context');assert.equal(unauthorized.status,401);
  const user=await fetch(url+'/v1/context',{headers:{Authorization:'Bearer '+a.operatorKey}});
  assert.equal(user.status,200);const data=await user.json();assert.equal(data.items.length,recipe.items.length);
  assert.equal(data.role,'operator');assert.equal(data.purchaseEnabled,false);
  const cross=await fetch(url+'/v1/context',{headers:{Authorization:'Bearer '+a.operatorKey,Origin:'https://external.invalid'}});
  assert.equal(cross.status,403);
  const html=await fetch(url+'/app');assert.equal(html.status,200);
  assert.match(html.headers.get('content-security-policy'),/connect-src 'self'/);
  const htmlBody=await html.text();assert.match(htmlBody,/Inventory/);
  assert.doesNotMatch(htmlBody,/<script[^>]+src="https:|mailto:/i);
  await server.close();server=null;store.close();store=null;
  store=openStore({filename:file,recipe,clock:time});
  assert.equal(store.context(a.operatorKey).items.find(x=>x.sku===expected).onHand,handled.item.onHand);
  assert.equal(store.context(b.operatorKey).items.find(x=>x.sku===expected).onHand,0);
  return {kind:'assembled-inventory-acceptance',passed:true,recipeId:recipe.id,artifactDigest:digest,
   tenantIsolation:true,idempotentStock:true,roleSeparation:true,verifiedReorderWorkflow:true,
   automaticInternalReplenishment:true,restartPersistence:true,loopbackBrowser:true,
   nonBilling:true,externalMessagesSent:0,paymentsSent:0,
   realCustomers:null,collectedRevenue:null,releaseApproved:false};
 }finally{await server?.close();store?.close();}
};
if(require.main===module){
 const [root,scratch,digest]=process.argv.slice(2);
 check(root,scratch,digest).then(result=>console.log(JSON.stringify(result))).catch(error=>{
  console.error('Inventory package acceptance failed: '+error.message);process.exitCode=1;
 });
}
module.exports={check};
