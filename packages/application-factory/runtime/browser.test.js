"use strict";
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {openRuntime}=require('./runtime');
const {createRuntimeServer}=require('./http');
const recipes=require('../recipes.json');
const unitPath=path.join(__dirname,'browser-sessions.js');
const Sessions=fs.existsSync(unitPath)?require(unitPath):{};
function unit(options={}) {
  assert.equal(typeof Sessions.createSessions,'function','bounded browser sessions must be implemented');
  let time=100000, revoked=false;
  const token='a'.repeat(43);
  const sessions=Sessions.createSessions({validate:provided=>{if(provided!==token||revoked)throw new Error('UNAUTHORIZED');},clock:()=>time,...options});
  return {sessions,token,setTime:n=>time=n,revoke:()=>revoked=true};
}
test('browser sessions exchange credential for opaque IDs and enforce absolute expiry',()=>{
  const x=unit(),s=x.sessions.issue(x.token);
  assert.match(s.id,/^[A-Za-z0-9_-]{43}$/);assert.notEqual(s.id,x.token);assert.notEqual(s.csrf,s.id);
  assert.equal(x.sessions.read(s.id).credential,x.token);
  x.setTime(s.expiresAt);assert.throws(()=>x.sessions.read(s.id),/UNAUTHORIZED/);
});
test('logout, credential revocation and server cleanup invalidate sessions',()=>{
  const x=unit(),a=x.sessions.issue(x.token);x.sessions.remove(a.id);assert.throws(()=>x.sessions.read(a.id),/UNAUTHORIZED/);
  const b=x.sessions.issue(x.token);x.revoke();assert.throws(()=>x.sessions.read(b.id),/UNAUTHORIZED/);
  const y=unit(),c=y.sessions.issue(y.token);y.sessions.clear();assert.throws(()=>y.sessions.read(c.id),/UNAUTHORIZED/);
});
test('session copies cannot mutate stored credentials or CSRF state',()=>{
  const x=unit(),a=x.sessions.issue(x.token),read=x.sessions.read(a.id);read.credential='b'.repeat(43);read.csrf='forged';
  assert.equal(x.sessions.read(a.id).credential,x.token);assert.notEqual(x.sessions.read(a.id).csrf,'forged');
});
test('session issuance is bounded and failed login attempts back off',()=>{
  const x=unit({maxSessions:2,maxPerCredential:2,maxFailedLogins:2});
  x.sessions.issue(x.token);x.sessions.issue(x.token);assert.throws(()=>x.sessions.issue(x.token),/SESSION_LIMIT/);
  const y=unit({maxFailedLogins:2});for(let i=0;i<2;i++)assert.throws(()=>y.sessions.issue('wrong'),/UNAUTHORIZED/);
  assert.throws(()=>y.sessions.issue(y.token),/RATE_LIMIT/);y.setTime(160001);assert.ok(y.sessions.issue(y.token).id);
});
test('session clock rollback invalidates access rather than extending a session',()=>{
  const x=unit(),a=x.sessions.issue(x.token);x.setTime(90000);assert.throws(()=>x.sessions.read(a.id),/UNAUTHORIZED/);
});
async function setup(t,{automation=false}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-browser-test-'));
  const filename=path.join(dir,'runtime.sqlite');let r=openRuntime({filename,recipes});
  const a=r.provisionTenant('customer-a').token,b=r.provisionTenant('customer-b').token;
  for(const token of [a,b])for(const recipe of recipes)r.createWorkspace(token,{id:recipe.id,recipeId:recipe.id});
  const server=createRuntimeServer({runtime:r,automation,pollMs:10});await server.listen({port:0});
  const origin='http://127.0.0.1:'+server.address().port;
  t.after(async()=>{await server.close();r.close();fs.rmSync(dir,{recursive:true,force:true});});
  const request=(url,opts={})=>fetch(origin+url,{...opts,headers:{...(opts.body!==undefined?{'content-type':'application/json'}:{}),...opts.headers}});
  async function login(token=a,previous=''){
    const res=await request('/app/api/session',{method:'POST',headers:{Origin:origin,...(previous?{Cookie:previous}:{})},body:JSON.stringify({credential:token})});
    assert.equal(res.status,200,'browser login must succeed');
    const cookie=res.headers.get('set-cookie');const body=await res.json();
    return {cookie:cookie.split(';')[0],attributes:cookie,csrf:body.csrfToken,body};
  }
  const auth=(session,headers={})=>({Cookie:session.cookie,'X-CSRF-Token':session.csrf,Origin:origin,...headers});
  return {r,server,a,b,origin,request,login,auth,filename};
}
test('runtime serves connected HTML and allowlisted assets with restrictive browser headers',async t=>{
  const x=await setup(t),res=await x.request('/app');assert.equal(res.status,200);
  const text=await res.text();assert.match(text,/Workspace access/);assert.ok(!text.includes(x.a));
  assert.match(res.headers.get('content-security-policy'),/default-src 'none'/);assert.match(res.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal(res.headers.get('cache-control'),'no-store');
  for(const name of ['browser-client.js','browser.css'])assert.equal((await x.request('/app/assets/'+name)).status,200);
  for(const name of ['runtime.js','browser-sessions.js','recipes.json'])assert.equal((await x.request('/app/assets/'+name)).status,404);
});
test('login uses HttpOnly Strict cookie without returning the credential',async t=>{
  const x=await setup(t),s=await x.login();assert.match(s.attributes,/HttpOnly/);assert.match(s.attributes,/SameSite=Strict/);assert.match(s.attributes,/Path=\/app/);
  assert.equal(JSON.stringify(s.body).includes(x.a),false);assert.notEqual(s.cookie.split('=')[1],x.a);
  const current=await x.request('/app/api/session',{headers:{Cookie:s.cookie}});assert.equal(current.status,200);assert.equal((await current.json()).csrfToken,s.csrf);
});
test('unauthenticated browser routes never expose workspaces and credentials cannot be put in URLs',async t=>{
  const x=await setup(t);assert.equal((await x.request('/app/api/workspaces')).status,401);
  assert.equal((await x.request('/app/api/workspaces?token='+x.a)).status,400);
});
test('browser login rejects foreign, null and missing origins and invalid or extra credentials',async t=>{
  const x=await setup(t);
  for(const origin of [undefined,'null','https://hostile.example',x.origin+'.hostile.example']) {
    const res=await x.request('/app/api/session',{method:'POST',headers:{...(origin?{Origin:origin}:{})},body:JSON.stringify({credential:x.a})});assert.equal(res.status,403);
  }
  assert.equal((await x.request('/app/api/session',{method:'POST',headers:{Origin:x.origin},body:JSON.stringify({credential:'bad'})})).status,401);
  assert.equal((await x.request('/app/api/session',{method:'POST',headers:{Origin:x.origin},body:JSON.stringify({credential:x.a,tenantId:'customer-b'})})).status,400);
});
test('authenticated browser writes require session-bound CSRF and exact same origin',async t=>{
  const x=await setup(t),s=await x.login(),other=await x.login(x.b);
  const body=JSON.stringify({command:{type:'add',name:'Synthetic record',dueOn:'2026-10-13'}}),url='/app/api/workspaces/supplier-desk/commands';
  for(const headers of [{Cookie:s.cookie,Origin:x.origin},{...x.auth(s),'X-CSRF-Token':other.csrf},{...x.auth(s),Origin:'https://evil.example'},{...x.auth(s),'Sec-Fetch-Site':'cross-site'}])
    assert.equal((await x.request(url,{method:'POST',headers:{...headers,'Idempotency-Key':'csrf-test'},body})).status,403);
  assert.equal(x.r.workspace(x.a,'supplier-desk').records.length,0);
});
test('tenant-bound browser reads and writes cannot cross identically named workspaces',async t=>{
  const x=await setup(t),a=await x.login(),b=await x.login(x.b),url='/app/api/workspaces/supplier-desk/commands';
  const res=await x.request(url,{method:'POST',headers:x.auth(a,{'Idempotency-Key':'add'}),body:JSON.stringify({command:{type:'add',name:'Private A',dueOn:'2026-10-13'}})});assert.equal(res.status,200);
  const read=await x.request('/app/api/workspaces/supplier-desk',{headers:{Cookie:b.cookie}});assert.equal((await read.json()).records.length,0);
  const bad=await x.request(url,{method:'POST',headers:x.auth(b,{'Idempotency-Key':'cross'}),body:JSON.stringify({command:{type:'archive',recordId:'r1'}})});assert.equal(bad.status,400);
});
test('browser command retries use the durable receipt and preserve one record across reload',async t=>{
  const x=await setup(t),s=await x.login(),url='/app/api/workspaces/supplier-desk/commands';
  const opts={method:'POST',headers:x.auth(s,{'Idempotency-Key':'stable-request'}),body:JSON.stringify({command:{type:'add',name:'Retry me',dueOn:'2026-10-13'}})};
  const a=await x.request(url,opts);assert.equal(a.status,200);const result=await a.json();
  assert.deepEqual(await(await x.request(url,opts)).json(),result);
  const reload=await x.request('/app/api/session',{headers:{Cookie:s.cookie}});assert.equal(reload.status,200);
  assert.equal((await(await x.request('/app/api/workspaces/supplier-desk',{headers:{Cookie:s.cookie}})).json()).records.length,1);
});
test('logout and replacement login invalidate previous cookies, including on the next GET',async t=>{
  const x=await setup(t),first=await x.login(),second=await x.login(x.b,first.cookie);
  assert.equal((await x.request('/app/api/session',{headers:{Cookie:first.cookie}})).status,401);
  assert.equal((await x.request('/app/api/logout',{method:'POST',headers:x.auth(second),body:'{}'})).status,200);
  assert.equal((await x.request('/app/api/workspaces',{headers:{Cookie:second.cookie}})).status,401);
});
test('rotating the operator credential immediately invalidates the browser session',async t=>{
  const x=await setup(t),s=await x.login();x.r.rotateCredential('customer-a');assert.equal((await x.request('/app/api/workspaces',{headers:{Cookie:s.cookie}})).status,401);
});
test('duplicate session cookie names and machine tokens on browser endpoints are refused',async t=>{
  const x=await setup(t),s=await x.login();assert.equal((await x.request('/app/api/session',{headers:{Cookie:s.cookie+'; '+s.cookie}})).status,401);
  assert.equal((await x.request('/app/api/workspaces',{headers:{Authorization:'Bearer '+x.a}})).status,401);
});
test('existing machine API still refuses browser origins and browser cookies',async t=>{
  const x=await setup(t),s=await x.login();assert.equal((await x.request('/v1/workspaces',{headers:{Cookie:s.cookie}})).status,401);
  assert.equal((await x.request('/v1/workspaces',{headers:{Authorization:'Bearer '+x.a,Origin:x.origin}})).status,403);
  assert.equal((await x.request('/v1/workspaces',{headers:{Authorization:'Bearer '+x.a}})).status,200);
});
test('browser server rejects hostile Host, oversize login and non-JSON mutations',async t=>{
  const x=await setup(t);
  const hostile=await new Promise((resolve,reject)=>{const req=http.get({hostname:'127.0.0.1',port:x.server.address().port,path:'/app',headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});assert.equal(hostile,403);
  assert.equal((await x.request('/app/api/session',{method:'POST',headers:{Origin:x.origin},body:'x'.repeat(17000)})).status,413);
  assert.equal((await x.request('/app/api/session',{method:'POST',headers:{Origin:x.origin,'content-type':'text/plain'},body:'{}'})).status,415);
});
test('one connected UI schema works for every provisioned edition with real worker notifications',async t=>{
  const x=await setup(t,{automation:true}),s=await x.login();const today=new Date().toISOString().slice(0,10);
  const list=await(await x.request('/app/api/workspaces',{headers:{Cookie:s.cookie}})).json();assert.equal(list.length,3);
  for(const recipe of recipes){const root='/app/api/workspaces/'+recipe.id;
    const res=await x.request(root+'/commands',{method:'POST',headers:x.auth(s,{'Idempotency-Key':'add-'+recipe.id}),body:JSON.stringify({command:{type:'add',name:'Unattended '+recipe.title,dueOn:today}})});assert.equal(res.status,200);
    const view=await(await x.request(root,{headers:{Cookie:s.cookie}})).json();assert.equal(view.recipe.id,recipe.id);
  }
  // Log out all browser activity; only the service worker continues.
  await x.request('/app/api/logout',{method:'POST',headers:x.auth(s),body:'{}'});
  const end=Date.now()+2000;while(x.r.inbox(x.a,recipes[2].id).length===0&&Date.now()<end)await new Promise(r=>setTimeout(r,20));
  const again=await x.login();
  for(const recipe of recipes){const n=await(await x.request('/app/api/workspaces/'+recipe.id+'/inbox',{headers:{Cookie:again.cookie}})).json();assert.equal(n.length,1);assert.equal(n[0].channel,'internal-inbox');}
});
test('snapshot export is scoped, a JSON attachment and read-only',async t=>{
  const x=await setup(t),s=await x.login(),before=x.r.workspace(x.a,'supplier-desk').version;
  const res=await x.request('/app/api/workspaces/supplier-desk/export',{headers:{Cookie:s.cookie}});assert.equal(res.status,200);
  assert.match(res.headers.get('content-disposition'),/attachment; filename="supplier-desk.json"/);
  assert.equal((await res.json()).workspaceId,'supplier-desk');assert.equal(x.r.workspace(x.a,'supplier-desk').version,before);
});
test('server restart invalidates browser sessions but preserves authenticated records',async t=>{
  const x=await setup(t),s=await x.login();x.r.command(x.a,'supplier-desk',{type:'add',name:'Survives restart',dueOn:'2026-10-13'},'restart');
  await x.server.close();x.r.close();const r=openRuntime({filename:x.filename,recipes}),server=createRuntimeServer({runtime:r,automation:false});await server.listen({port:0});
  try{
    const origin='http://127.0.0.1:'+server.address().port;
    assert.equal((await fetch(origin+'/app/api/session',{headers:{Cookie:s.cookie}})).status,401);
    const login=await fetch(origin+'/app/api/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({credential:x.a})});assert.equal(login.status,200);
    const cookie=login.headers.get('set-cookie').split(';')[0];
    assert.equal((await(await fetch(origin+'/app/api/workspaces/supplier-desk',{headers:{Cookie:cookie}})).json()).records[0].name,'Survives restart');
  }finally{await server.close();r.close();}
});
test('logout during a streamed mutation invalidates authorization before commit',async t=>{
  const x=await setup(t),s=await x.login(),body=JSON.stringify({command:{type:'add',name:'Must not commit',dueOn:'2026-10-13'}});
  let request;
  const result=new Promise((resolve,reject)=>{
    request=http.request({hostname:'127.0.0.1',port:x.server.address().port,path:'/app/api/workspaces/supplier-desk/commands',method:'POST',headers:{...x.auth(s),'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'Idempotency-Key':'slow-write'}},res=>{res.resume();resolve(res.statusCode);});request.on('error',reject);request.write(body.slice(0,10));
  });
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal((await x.request('/app/api/logout',{method:'POST',headers:x.auth(s),body:'{}'})).status,200);
  request.end(body.slice(10));assert.equal(await result,401);assert.equal(x.r.workspace(x.a,'supplier-desk').records.length,0);
});
