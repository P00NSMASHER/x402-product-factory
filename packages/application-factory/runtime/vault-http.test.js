"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {openRuntime}=require('./runtime');
const {openVault}=require('./vault');
const {createRuntimeServer}=require('./http');
const recipes=require('../recipes.json');
const pdf=Buffer.from('%PDF-1.7\nsynthetic upload\n%%EOF\n');
async function setup(t,{enabled=true}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-upload-api-'));
  const runtime=openRuntime({filename:path.join(dir,'runtime.sqlite'),recipes,clock:()=>Date.parse('2026-10-13T12:00:00Z')});
  const vault=enabled?openVault({filename:path.join(dir,'documents.sqlite'),key:Buffer.alloc(32,8)}):undefined;
  const a=runtime.provisionTenant('tenant-a').token,b=runtime.provisionTenant('tenant-b').token;
  for(const token of [a,b]){
    runtime.createWorkspace(token,{id:'supplier-desk',recipeId:'supplier-desk'});
    runtime.command(token,'supplier-desk',{type:'add',name:'Synthetic supplier',dueOn:'2026-10-13'},'setup');
  }
  const server=createRuntimeServer({runtime,vault,automation:false});await server.listen({port:0});
  t.after(async()=>{await server.close();vault?.close();runtime.close();fs.rmSync(dir,{recursive:true,force:true});});
  const origin='http://127.0.0.1:'+server.address().port;
  function request(url,options={}){return fetch(origin+url,options);}
  const headers=(token=a,additional={})=>({Authorization:'Bearer '+token,...additional});
  const uploadHeaders=(token=a,additional={})=>headers(token,{
    'Content-Type':'application/octet-stream','X-Record-Id':'r1','X-Requirement-Id':'insurance',
    'X-Document-Name':'policy.pdf','X-Document-Type':'application/pdf','Idempotency-Key':'document-key-1',...additional});
  return {runtime,vault,a,b,origin,request,headers,uploadHeaders};
}
test('machine credential uploads, lists and downloads encrypted evidence without inline rendering',async t=>{
  const x=await setup(t),url='/v1/workspaces/supplier-desk/documents';
  const resp=await x.request(url,{method:'POST',headers:x.uploadHeaders(),body:pdf});
  assert.equal(resp.status,201);const meta=await resp.json();
  assert.equal(meta.name,'policy.pdf');assert.equal(meta.size,pdf.length);assert.equal(meta.bytes,undefined);
  const listing=await x.request(url,{headers:x.headers()});assert.equal(listing.status,200);
  assert.equal((await listing.json())[0].id,meta.id);
  const download=await x.request(url+'/'+meta.id,{headers:x.headers()});assert.equal(download.status,200);
  assert.equal(download.headers.get('content-type'),'application/octet-stream');
  assert.match(download.headers.get('content-disposition'),/^attachment;/);
  assert.equal(download.headers.get('x-content-type-options'),'nosniff');
  assert.equal(download.headers.get('cache-control'),'no-store');
  assert.deepEqual(Buffer.from(await download.arrayBuffer()),pdf);
});
test('cross-tenant credentials cannot list or download another customer evidence',async t=>{
  const x=await setup(t),url='/v1/workspaces/supplier-desk/documents';
  const meta=await(await x.request(url,{method:'POST',headers:x.uploadHeaders(),body:pdf})).json();
  const list=await(await x.request(url,{headers:x.headers(x.b)})).json();
  assert.deepEqual(list,[]);
  assert.equal((await x.request(url+'/'+meta.id,{headers:x.headers(x.b)})).status,404);
  assert.equal((await x.request(url+'/'+meta.id,{method:'POST',headers:x.uploadHeaders(x.b),body:pdf})).status,404);
});
test('duplicate upload request key returns the original evidence once; conflicts fail',async t=>{
  const x=await setup(t),url='/v1/workspaces/supplier-desk/documents';
  const one=await(await x.request(url,{method:'POST',headers:x.uploadHeaders(),body:pdf})).json();
  const two=await(await x.request(url,{method:'POST',headers:x.uploadHeaders(),body:pdf})).json();
  assert.equal(one.id,two.id);assert.equal((await(await x.request(url,{headers:x.headers()})).json()).length,1);
  const other=await x.request(url,{method:'POST',headers:x.uploadHeaders(x.a,{'X-Document-Name':'changed.pdf'}),body:pdf});
  assert.equal(other.status,409);
});
test('rejects unsupported MIME, forged content, oversized bodies and missing keys',async t=>{
  const x=await setup(t),url='/v1/workspaces/supplier-desk/documents';
  const args=[
    {h:x.uploadHeaders(x.a,{'X-Document-Type':'text/html'}),b:pdf,expected:400},
    {h:x.uploadHeaders(),b:Buffer.from('<script>fake pdf</script>'),expected:400},
    {h:x.uploadHeaders(),b:Buffer.alloc(262145,45),expected:413},
    {h:x.uploadHeaders(x.a,{'Idempotency-Key':''}),b:pdf,expected:400}
  ];
  for(const item of args){const res=await x.request(url,{method:'POST',headers:item.h,body:item.b});assert.equal(res.status,item.expected);}
  assert.deepEqual(await(await x.request(url,{headers:x.headers()})).json(),[]);
});
test('archived or unknown record and unrecognized requirement cannot receive new documents',async t=>{
  const x=await setup(t),url='/v1/workspaces/supplier-desk/documents';
  for(const override of [{'X-Record-Id':'r999'},{'X-Requirement-Id':'unknown'}]){
    assert.equal((await x.request(url,{method:'POST',headers:x.uploadHeaders(x.a,override),body:pdf})).status,404);
  }
  x.runtime.command(x.a,'supplier-desk',{type:'archive',recordId:'r1'},'archive');
  assert.equal((await x.request(url,{method:'POST',headers:x.uploadHeaders(),body:pdf})).status,404);
});
test('browser upload requires same-origin cookie and CSRF, then downloads only scoped bytes',async t=>{
  const x=await setup(t),login=await x.request('/app/api/session',{method:'POST',
    headers:{Origin:x.origin,'Content-Type':'application/json'},body:JSON.stringify({credential:x.a})});
  assert.equal(login.status,200);const csrf=(await login.json()).csrfToken,cookie=login.headers.get('set-cookie').split(';')[0];
  const url='/app/api/workspaces/supplier-desk/documents',h={Cookie:cookie,Origin:x.origin,...x.uploadHeaders(undefined)};
  delete h.Authorization; // Browser sessions must not require or expose bearer credentials.
  assert.equal((await x.request(url,{method:'POST',headers:h,body:pdf})).status,403);
  const ok=await x.request(url,{method:'POST',headers:{...h,'X-CSRF-Token':csrf},body:pdf});
  assert.equal(ok.status,201);const doc=await ok.json();
  const listed=await x.request(url,{headers:{Cookie:cookie}});assert.equal(listed.status,200);
  assert.equal((await listed.json())[0].id,doc.id);
  const download=await x.request(url+'/'+doc.id,{headers:{Cookie:cookie}});
  assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),pdf);
});
test('logout or credential rotation prevents further attachment reads and uploads',async t=>{
  const x=await setup(t);
  const login=await x.request('/app/api/session',{method:'POST',headers:{Origin:x.origin,'Content-Type':'application/json'},body:JSON.stringify({credential:x.a})});
  const csrf=(await login.json()).csrfToken,cookie=login.headers.get('set-cookie').split(';')[0],url='/app/api/workspaces/supplier-desk/documents';
  const h={Cookie:cookie,Origin:x.origin,'X-CSRF-Token':csrf,...x.uploadHeaders(x.a)};
  delete h.Authorization;
  assert.equal((await x.request(url,{method:'POST',headers:h,body:pdf})).status,201);
  const sessionHeaders={Cookie:cookie,Origin:x.origin,'X-CSRF-Token':csrf,'Content-Type':'application/json'};
  assert.equal((await x.request('/app/api/logout',{method:'POST',headers:sessionHeaders,body:'{}'})).status,200);
  assert.equal((await x.request(url,{headers:{Cookie:cookie}})).status,401);
  x.runtime.rotateCredential('tenant-a');
  assert.equal((await x.request('/v1/workspaces/supplier-desk/documents',{method:'POST',headers:x.uploadHeaders(x.a),body:pdf})).status,401);
});
test('legacy servers with vault disabled retain their existing APIs and expose no upload endpoint',async t=>{
  const x=await setup(t,{enabled:false});
  assert.equal((await x.request('/health')).status,200);
  assert.equal((await x.request('/v1/workspaces/supplier-desk',{headers:x.headers()})).status,200);
  assert.equal((await x.request('/v1/workspaces/supplier-desk/documents',{headers:x.headers()})).status,404);
});
