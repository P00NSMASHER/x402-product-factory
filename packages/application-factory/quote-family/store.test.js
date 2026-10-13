'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openStore}=require('./store'),recipes=require('./recipes.json');
const epoch=Date.parse('2026-10-13T12:00:00Z');
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'quote-durable-'));let clock=epoch,store;
 const filename=path.join(dir,'state.sqlite');const open=()=>{store=openStore({filename,recipe:recipes[0],clock:()=>clock});return store;};
 open();t.after(()=>{store?.close();fs.rmSync(dir,{recursive:true,force:true});});
 return {get store(){return store;},open,filename,setDate:v=>{clock=Date.parse(v+'T12:00:00Z');}};}
const idem=n=>'request-key-'+n;
const line={id:'l1',itemId:recipes[0].items[0].id,quantity:5,unitPriceCents:10000};
const create=(s,token,n=1)=>s.create(token,{clientLabel:'Synthetic business '+n,validUntil:'2026-10-20'},idem('create'+n));

test('credentials provision two genuine distinct roles and do not appear in stored SQLite bytes',t=>{
 const x=setup(t),p=x.store.provision('synthetic-tenant');assert.equal(p.operatorToken.length,43);assert.equal(p.reviewerToken.length,43);
 assert.notEqual(p.operatorToken,p.reviewerToken);assert.equal(x.store.identity(p.operatorToken).role,'operator');
 assert.equal(x.store.identity(p.reviewerToken).role,'reviewer');
 assert.throws(()=>x.store.identity('a'.repeat(43)),/UNAUTHORIZED/);
 const text=fs.readFileSync(x.filename).toString('latin1');assert.ok(!text.includes(p.operatorToken));
 assert.ok(!text.includes(p.reviewerToken));
});
test('tenant A cannot list or mutate tenant B quotes, reviewer cannot create drafts',t=>{
 const x=setup(t),a=x.store.provision('tenant-a'),b=x.store.provision('tenant-b');const q=create(x.store,a.operatorToken);
 assert.equal(x.store.list(a.operatorToken).length,1);assert.equal(x.store.list(b.operatorToken).length,0);
 assert.throws(()=>x.store.get(b.operatorToken,q.id),/NOT_FOUND/);
 assert.throws(()=>x.store.command(b.operatorToken,q.id,{type:'submit'},1,idem('foreign')),/NOT_FOUND/);
 assert.throws(()=>create(x.store,a.reviewerToken),/FORBIDDEN/);
});
test('retry of uncertain create or approve preserves one quote/order and exactly one event',t=>{
 const x=setup(t),p=x.store.provision('tenant');const a=create(x.store,p.operatorToken);
 assert.deepEqual(create(x.store,p.operatorToken),a);
 const b=x.store.command(p.operatorToken,a.id,{type:'line_upsert',line},a.revision,idem('line'));
 const sub=x.store.command(p.operatorToken,a.id,{type:'submit'},b.revision,idem('submit'));
 const approved=x.store.command(p.reviewerToken,a.id,{type:'approve'},sub.revision,idem('approve'));
 assert.deepEqual(x.store.command(p.reviewerToken,a.id,{type:'approve'},sub.revision,idem('approve')),approved);
 const order=x.store.command(p.operatorToken,a.id,{type:'convert'},approved.revision,idem('convert'));
 assert.equal(order.order.totalCents,50000);
 assert.deepEqual(x.store.command(p.operatorToken,a.id,{type:'convert'},approved.revision,idem('convert')),order);
 assert.equal(x.store.orders(p.operatorToken).length,1);
 assert.equal(x.store.inbox(p.operatorToken).filter(e=>e.kind==='quote_approved').length,1);
});
test('idempotency conflicts reject changed payload and revision gate blocks stale edits',t=>{
 const x=setup(t),p=x.store.provision('tenant'),q=create(x.store,p.operatorToken);
 assert.throws(()=>x.store.create(p.operatorToken,{clientLabel:'Other buyer',validUntil:'2026-10-20'},idem('create1')),/IDEMPOTENCY_CONFLICT/);
 const next=x.store.command(p.operatorToken,q.id,{type:'line_upsert',line},q.revision,idem('one'));
 assert.throws(()=>x.store.command(p.operatorToken,q.id,{type:'line_remove',lineId:'l1'},q.revision,idem('two')),/VERSION_CONFLICT/);
 assert.throws(()=>x.store.command(p.operatorToken,q.id,{type:'line_upsert',line:{...line,quantity:40}},q.revision,idem('one')),/IDEMPOTENCY_CONFLICT/);
 assert.equal(x.store.get(p.operatorToken,q.id).revision,next.revision);
});
test('reviewer token cannot submit, and operator cannot self-approve',t=>{
 const x=setup(t),p=x.store.provision('tenant'),q=create(x.store,p.operatorToken);
 assert.throws(()=>x.store.command(p.reviewerToken,q.id,{type:'submit'},q.revision,idem('badrole')),/FORBIDDEN/);
 assert.throws(()=>x.store.command(p.operatorToken,q.id,{type:'approve'},q.revision,idem('badrole2')),/FORBIDDEN/);
});
test('stored quotes survive restart, tokens remain valid, and inbox records are internal only',t=>{
 const x=setup(t),p=x.store.provision('tenant'),q=create(x.store,p.operatorToken);
 x.store.close();x.open();assert.equal(x.store.get(p.operatorToken,q.id).clientLabel,'Synthetic business 1');
 assert.equal(x.store.list(p.reviewerToken).length,1);assert.equal(x.store.inbox(p.reviewerToken)[0].kind,'draft_created');
 assert.equal(x.store.summary(p.operatorToken).collectedRevenue,null);
 assert.equal(x.store.summary(p.operatorToken).paymentsSent,0);
});
test('headless expiry creates exactly one private reminder even after restart',t=>{
 const x=setup(t),p=x.store.provision('tenant');create(x.store,p.operatorToken);
 x.setDate('2026-10-21');const a=x.store.sweep();assert.equal(a.expired,1);
 assert.equal(x.store.get(p.operatorToken,'q1').status,'expired');
 assert.equal(x.store.sweep().expired,0);
 x.store.close();x.open();assert.equal(x.store.sweep().expired,0);
 assert.equal(x.store.inbox(p.operatorToken).filter(e=>e.kind==='quote_expired').length,1);
});
test('provision reuses no tenant identifier, prevents cross-account token collisions',t=>{
 const x=setup(t);x.store.provision('tenant');assert.throws(()=>x.store.provision('tenant'),/TENANT_EXISTS/);
 for(const name of ['../tenant','tenant_','a'.repeat(90)])assert.throws(()=>x.store.provision(name));
});
test('malformed request keys and injection-like query IDs cannot perform mutations',t=>{
 const x=setup(t),p=x.store.provision('tenant'),q=create(x.store,p.operatorToken);
 for(const key of ['x','../../bad','key\nheader',null])assert.throws(()=>x.store.command(p.operatorToken,q.id,{type:'approve'},1,key));
 assert.throws(()=>x.store.get(p.operatorToken,'q1 OR 1=1'),/NOT_FOUND/);
});
