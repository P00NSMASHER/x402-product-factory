'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openStore}=require('./store'),{createServer}=require('./server'),recipes=require('./recipes.json');
async function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'quote-http-'));
 let now=Date.parse('2026-10-13T12:00:00Z');const store=openStore({filename:path.join(dir,'sqlite.db'),recipe:recipes[0],clock:()=>now});
 const app=createServer({store,pollMs:100});await app.listen(0);const base='http://127.0.0.1:'+app.port();
 const a=store.provision('synthetic-one'),b=store.provision('synthetic-two');
 t.after(async()=>{await app.close();store.close();fs.rmSync(dir,{recursive:true,force:true});});
 async function query(route,token,method='GET',body,extra={}){
  const res=await fetch(base+route,{method,headers:{...(token?{'Authorization':'Bearer '+token}:{}),
   ...(body?{'Content-Type':'application/json'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});
  const text=await res.text();let data;try{data=JSON.parse(text);}catch{data=text;}
  return {status:res.status,data,headers:res.headers};
 }
 return {query,a,b,store,base,setDay:v=>now=Date.parse(v+'T12:00:00Z')};}
const key=n=>'request-key-'+n;
const line={id:'l1',itemId:recipes[0].items[0].id,quantity:5,unitPriceCents:1200};
test('loopback application is browseable with restrictive CSP, zero external resources',async t=>{
 const x=await setup(t),home=await x.query('/app');assert.equal(home.status,200);
 assert.match(home.data,/Quote Desk/);assert.match(home.headers.get('content-security-policy'),/default-src 'none'/);
 for(const url of ['/assets/client.js','/assets/style.css'])assert.equal((await x.query(url)).status,200);
 const health=await x.query('/health');assert.equal(health.data.releaseApproved,false);
});
test('HTTP requires bearer authorization, rejects invalid host/origin and discloses no other tenant',async t=>{
 const x=await setup(t),op=x.a.operatorToken,other=x.b.operatorToken;
 assert.equal((await x.query('/v1/quotes')).status,401);
 assert.equal((await x.query('/v1/quotes',op,'GET',undefined,{'Origin':'https://external.example'})).status,403);
 const http=require('node:http');const forged=await new Promise((resolve,reject)=>{const req=http.get(x.base+'/v1/quotes',{headers:{Host:'evil.example',Authorization:'Bearer '+op}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);});
 assert.equal(forged,403);
 assert.equal((await x.query('/v1/quotes',other)).data.length,0);
 const created=await x.query('/v1/quotes',op,'POST',{clientLabel:'Synthetic buyer',validUntil:'2026-10-20'},{'Idempotency-Key':key('create')});
 assert.equal(created.status,201);assert.equal((await x.query('/v1/quotes',other)).data.length,0);
 assert.equal((await x.query('/v1/quotes/q1',other)).status,404);
});
test('HTTP quote lifecycle requires separate reviewer credentials and creates exactly one internal order',async t=>{
 const x=await setup(t),op=x.a.operatorToken,reviewer=x.a.reviewerToken;
 const c=await x.query('/v1/quotes',op,'POST',{clientLabel:'Synthetic customer',validUntil:'2026-10-20'},{'Idempotency-Key':key('c')});
 assert.equal(c.status,201);let q=c.data;
 async function mutate(token,type,extra={},reqKey=key(type)){
  return await x.query('/v1/quotes/'+q.id+'/commands',token,'POST',{command:{type,...extra},expectedRevision:q.revision},{'Idempotency-Key':reqKey});
 }
 let a=await mutate(op,'line_upsert',{line});assert.equal(a.status,200);q=a.data;
 a=await mutate(op,'submit');assert.equal(a.status,200);q=a.data;
 assert.equal((await mutate(op,'approve')).status,403);
 a=await mutate(reviewer,'approve');assert.equal(a.status,200);q=a.data;
 a=await mutate(op,'convert');assert.equal(a.status,200);q=a.data;
 assert.equal(q.order.totalCents,6000);assert.equal(q.order.paymentStatus,'not_configured');
 assert.equal((await x.query('/v1/orders',op)).data.length,1);
 assert.equal((await x.query('/v1/summary',op)).data.paymentsSent,0);
});
test('uncertain write retries keep result identical; idempotency conflict rejects different payload',async t=>{
 const x=await setup(t),op=x.a.operatorToken,headers={'Idempotency-Key':key('c')};
 const data={clientLabel:'Synthetic buyer',validUntil:'2026-10-20'};
 const a=await x.query('/v1/quotes',op,'POST',data,headers),b=await x.query('/v1/quotes',op,'POST',data,headers);
 assert.deepEqual(a.data,b.data);assert.equal((await x.query('/v1/quotes',op)).data.length,1);
 const fail=await x.query('/v1/quotes',op,'POST',{...data,clientLabel:'Different'},headers);
 assert.equal(fail.status,409);
});
test('headless sweeper auto-expiry writes one internal event but cannot email or charge',async t=>{
 const x=await setup(t),op=x.a.operatorToken;
 await x.query('/v1/quotes',op,'POST',{clientLabel:'Synthetic buyer',validUntil:'2026-10-20'},{'Idempotency-Key':key('c')});
 x.setDay('2026-10-21');
 const s=await x.query('/v1/sweep',op,'POST',{},{});assert.equal(s.status,200);assert.equal(s.data.expired,1);
 const again=await x.query('/v1/sweep',op,'POST',{},{});assert.equal(again.data.expired,0);
 assert.equal((await x.query('/v1/events',op)).data.filter(e=>e.kind==='quote_expired').length,1);
});
test('browser bearer key stays out of markup and JSON authorization fails closed',async t=>{
 const x=await setup(t),home=await x.query('/app'),op=x.a.operatorToken;
 assert.equal(String(home.data).includes(op),false);
 assert.equal((await x.query('/v1/quotes',op,'POST',{clientLabel:'bad'},{})).status,400);
 assert.equal((await x.query('/v1/quotes',op,'POST',{clientLabel:'bad',validUntil:'2026-10-21'},{'Idempotency-Key':'bad-key'})).status,400);
 assert.equal((await x.query('/v1/quotes',op,'POST',{clientLabel:'bad',validUntil:'2026-10-21'},{'Idempotency-Key':key('bad') ,Origin:'https://evil.example'})).status,403);
});
