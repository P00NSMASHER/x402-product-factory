'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const recipe=require('./recipes.json')[0];
let api={};try{api=require('./store');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
const now=()=>Date.parse('2026-10-13T12:00:00Z');
function setup(t){assert.equal(typeof api.openStore,'function');const root=fs.mkdtempSync(path.join(os.tmpdir(),'inventory-family-store-'));
 let store=api.openStore({filename:path.join(root,'stock.sqlite'),recipe,clock:now});
 t.after(()=>{store?.close();fs.rmSync(root,{recursive:true,force:true});});
 return {root,store,restart(){store.close();store=api.openStore({filename:path.join(root,'stock.sqlite'),recipe,clock:now});return store;}};
}
test('two tenant credentials are isolated by tenant and reviewer role',t=>{
 const x=setup(t),a=x.store.provision('synthetic-a'),b=x.store.provision('synthetic-b');
 assert.equal(a.operatorKey.length,43);assert.equal(a.reviewerKey.length,43);
 assert.notEqual(a.operatorKey,b.operatorKey);
 assert.equal(x.store.context(a.operatorKey).role,'operator');
 assert.equal(x.store.context(a.reviewerKey).role,'reviewer');
 assert.equal(x.store.context(b.operatorKey).items[0].onHand,0);
 assert.throws(()=>x.store.context('z'.repeat(43)),/UNAUTHORIZED/);
});
test('stock updates are durable across process restarts',t=>{
 const x=setup(t),a=x.store.provision('synthetic-a'),sku=recipe.items[0].id;
 x.store.command(a.operatorKey,sku,{type:'receive',quantity:17},'key-1',1);
 const restarted=x.restart();
 assert.equal(restarted.context(a.operatorKey).items[0].onHand,17);
});
test('idempotent replays cannot manufacture duplicate stock or approvals',t=>{
 const x=setup(t),a=x.store.provision('synthetic-a'),sku=recipe.items[0].id;
 const action={type:'receive',quantity:4};
 const first=x.store.command(a.operatorKey,sku,action,'key-1',1);
 const second=x.store.command(a.operatorKey,sku,action,'key-1',1);
 assert.deepEqual(first,second);assert.equal(x.store.context(a.operatorKey).items[0].onHand,4);
 assert.throws(()=>x.store.command(a.operatorKey,sku,{type:'receive',quantity:6},'key-1',1),/IDEMPOTENCY_CONFLICT/);
});
test('optimistic item versions reject stale concurrent writes',t=>{
 const x=setup(t),a=x.store.provision('synthetic-a'),sku=recipe.items[0].id;
 x.store.command(a.operatorKey,sku,{type:'receive',quantity:2},'key-1',1);
 assert.throws(()=>x.store.command(a.operatorKey,sku,{type:'receive',quantity:2},'key-2',1),/VERSION_CONFLICT/);
});
test('reviewer approval cannot be forged with operator credential',t=>{
 const x=setup(t),a=x.store.provision('synthetic-a'),sku=recipe.items[0].id;
 x.store.command(a.operatorKey,sku,{type:'request_reorder'},'key-1',1);
 assert.throws(()=>x.store.command(a.operatorKey,sku,{type:'approve'},'key-2',2),/FORBIDDEN/);
 x.store.command(a.reviewerKey,sku,{type:'approve'},'key-3',2);
 assert.equal(x.store.context(a.operatorKey).items[0].onOrder>0,true);
});
test('invalid tokens, ids and long idempotency keys do not expose state',t=>{
 const x=setup(t),a=x.store.provision('synthetic-a');
 for(const token of ['x','f'.repeat(43),'secret'])assert.throws(()=>x.store.context(token),/UNAUTHORIZED/);
 assert.throws(()=>x.store.command(a.operatorKey,'unknown',{type:'receive',quantity:1},'k',1),/ITEM_UNKNOWN/);
 assert.throws(()=>x.store.command(a.operatorKey,recipe.items[0].id,{type:'receive',quantity:1},'k'.repeat(160),1),/KEY_INVALID/);
});
