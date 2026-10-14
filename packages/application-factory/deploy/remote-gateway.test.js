'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {createRemoteGateway,allowed,externalURL}=require('./remote-gateway');
const listen=s=>new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',()=>{s.off('error',reject);resolve(s.address().port);});});
const close=s=>new Promise(resolve=>s.close(resolve));
async function setup(t,{family='quote',clock=Date.now}={}){
 const stateRoot=fs.mkdtempSync(path.join(os.tmpdir(),'factory-remote-gate-'));fs.chmodSync(stateRoot,0o700);
 const backend=http.createServer((req,res)=>{
  if(req.headers.host!==`127.0.0.1:${backend.address().port}`){res.writeHead(403);res.end('wrong host');return;}
  if(req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${backend.address().port}`){res.writeHead(403);res.end('wrong origin');return;}
  if(req.url==='/app'){res.writeHead(200,{'content-type':'text/html','content-security-policy':"default-src 'none'",'set-cookie':'factory_browser_session=xyz; Path=/app; HttpOnly; SameSite=Strict'});res.end('<html><body>Real manufactured app</body></html>');return;}
  if(req.url==='/v1/quotes'||req.url==='/v1/context'||req.url==='/app/api/session'){
   if(req.headers.authorization!=='Bearer test_access'){res.writeHead(401);res.end('Unauth');return;}
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,origin:req.headers.origin,host:req.headers.host,cookie:req.headers.cookie||null}));return;
  }
  res.writeHead(404);res.end('no route');
 });
 const port=await listen(backend);
 const fleet={apps:[{family,id:'sample-app',origin:`http://127.0.0.1:${port}`,port}],stateRoot};
 const externalOrigin='https://factory-private.example.ts.net';
 const gateway=await createRemoteGateway({fleet,family,id:'sample-app',externalOrigin,clock});
 t.after(async()=>{await gateway.close();if(backend.listening)await close(backend);fs.rmSync(stateRoot,{recursive:true,force:true});});
 const code=JSON.parse(fs.readFileSync(gateway.loginCodeFile,'utf8')).code;
 const request=(route,{method='GET',origin,host=externalOrigin.slice(8),cookie,headers={},body}={})=>new Promise((resolve,reject)=>{
  const h={Host:host,...headers};if(origin)h.Origin=origin;if(cookie)h.Cookie=cookie;
  const r=http.request({hostname:'127.0.0.1',port:gateway.port,path:route,method,headers:h,timeout:3000},res=>{
   let data='';res.setEncoding('utf8');res.on('data',v=>data+=v);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:data}));
  });r.on('error',reject);r.on('timeout',()=>r.destroy(Error('timeout')));r.end(body);
 });
 const login=()=>request('/_preview/login',{method:'POST',origin:externalOrigin,headers:{'content-type':'application/x-www-form-urlencoded'},body:'code='+encodeURIComponent(code)});
 return {gateway,backend,port,request,login,code,externalOrigin,stateRoot};
}
test('unauthorized access, foreign Host, Origin and invalid login all fail closed',async t=>{
 const a=await setup(t);
 const challenge=await a.request('/app');assert.equal(challenge.status,401);
 assert.equal(challenge.headers['referrer-policy'],'same-origin'); // Preserve Origin on browser form POST.
 assert.equal((await a.request('/v1/quotes')).status,401);
 assert.equal((await a.request('/app',{host:'evil.invalid'})).status,403);
 assert.equal((await a.request('/app',{origin:'https://evil.invalid'})).status,403);
 assert.equal((await a.request('/_preview/login',{method:'POST',origin:'https://evil.invalid',headers:{'content-type':'application/x-www-form-urlencoded'},body:'code='+a.code})).status,403);
 assert.equal((await a.request('/_preview/login',{method:'POST',origin:a.externalOrigin,headers:{'content-type':'application/x-www-form-urlencoded'},body:'code=incorrect'})).status,401);
 assert.equal(fs.statSync(a.gateway.loginCodeFile).mode&0o077,0);
});
test('authenticated gateway strengthens app cookies and preserves app credentials',async t=>{
 const a=await setup(t);
 const login=await a.login();assert.equal(login.status,303);
 const cookie=login.headers['set-cookie'][0].split(';')[0];
 assert.match(login.headers['set-cookie'][0],/Secure/);assert.match(login.headers['set-cookie'][0],/HttpOnly/);
 assert.match(login.headers['set-cookie'][0],/SameSite=Strict/);
 const app=await a.request('/app',{cookie});assert.equal(app.status,200);assert.match(app.body,/Real manufactured app/);
 assert.match(app.headers['set-cookie'][0],/Secure/);
 assert.equal((await a.request('/health',{cookie})).status,404);
 assert.equal((await a.request('/v1/quotes',{cookie})).status,401);
 const authed=await a.request('/v1/quotes',{cookie,headers:{Authorization:'Bearer test_access'}});
 assert.equal(authed.status,200);assert.equal(JSON.parse(authed.body).host,`127.0.0.1:${a.port}`);
 assert.equal(JSON.parse(authed.body).cookie,null);
 const post=await a.request('/v1/quotes',{method:'POST',cookie,origin:a.externalOrigin,headers:{Authorization:'Bearer test_access'}});
 assert.equal(post.status,200);assert.equal(JSON.parse(post.body).origin,`http://127.0.0.1:${a.port}`);
 assert.equal((await a.request('/v1/quotes',{method:'POST',cookie,origin:'https://evil.invalid'})).status,403);
 assert.equal((await a.request('/_preview/logout',{method:'POST',cookie,origin:a.externalOrigin})).status,303);
 assert.equal((await a.request('/app',{cookie})).status,401);
});
test('document gateway blocks pilot, raw bearer APIs and uploads',async t=>{
 const a=await setup(t,{family:'document'});const login=await a.login(),cookie=login.headers['set-cookie'][0].split(';')[0];
 assert.equal((await a.request('/app',{cookie})).status,200);
 assert.equal((await a.request('/v1/workspaces',{cookie})).status,404);
 assert.equal((await a.request('/app/api/pilot',{method:'POST',cookie,origin:a.externalOrigin})).status,404);
 assert.equal((await a.request('/app/api/workspaces/example/documents',{method:'POST',cookie,origin:a.externalOrigin})).status,404);
});
test('session expires; origin outage gives 502; recovered origin remains functional',async t=>{
 let now=1750000000000;const a=await setup(t,{clock:()=>now});
 const login=await a.login(),cookie=login.headers['set-cookie'][0].split(';')[0];
 assert.equal((await a.request('/app',{cookie})).status,200);
 await close(a.backend);assert.equal((await a.request('/app',{cookie})).status,502);
 await new Promise((resolve,reject)=>{a.backend.once('error',reject);a.backend.listen(a.port,'127.0.0.1',()=>{a.backend.off('error',reject);resolve();});});
 assert.equal((await a.request('/app',{cookie})).status,200);
 now+=31*60*1000;assert.equal((await a.request('/app',{cookie})).status,401);
});
test('unsafe external URL, disallowed routes and unknown app rejected',async t=>{
 const a=await setup(t);
 assert.equal(allowed('quote','POST','/health'),false);
 assert.equal(allowed('inventory','GET','/v1/context'),true);
 assert.throws(()=>externalURL('http://example.invalid'),/REMOTE_ORIGIN_INVALID/);
 await assert.rejects(createRemoteGateway({fleet:{apps:[],stateRoot:a.stateRoot},family:'quote',id:'sample-app',externalOrigin:a.externalOrigin}),/REMOTE_APP_INVALID/);
});
