'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const COOKIE='__Host-factory_preview',SESSION_MS=30*60*1000;
const deny=code=>{throw Error(code);},sha=s=>crypto.createHash('sha256').update(s).digest();
const safeId=s=>typeof s==='string'&&s.length<=60&&/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(s);
function externalURL(input){
 if(typeof input!=='string'||!/^https:\/\/[a-zA-Z0-9.-]+(?::[0-9]{1,5})?$/.test(input))deny('REMOTE_ORIGIN_INVALID');
 let u;try{u=new URL(input);}catch{deny('REMOTE_ORIGIN_INVALID');}
 if(u.origin!==input||u.username||u.password||u.hostname.length>253||u.hostname.startsWith('.')||
   u.hostname.endsWith('.')||u.hostname.includes('..')||!u.hostname.includes('.'))deny('REMOTE_ORIGIN_INVALID');
 return u;
}
function allowed(family,method,url){
 if(!['GET','POST'].includes(method)||typeof url!=='string'||url.length>240||url.includes('?')||url.includes('%')||url.includes('..'))return false;
 if(family==='document'){
  if(method==='GET')return url==='/app'||url==='/app/'||
   /^\/app\/assets\/[a-z0-9.-]+$/.test(url)||
   /^\/app\/api\/(session|workspaces(?:\/[a-z0-9-]+(?:\/(inbox|export))?)?)$/.test(url);
  return url==='/app/api/session'||url==='/app/api/logout'||
   /^\/app\/api\/workspaces\/[a-z0-9-]+\/commands$/.test(url);
 }
 if(family==='quote'){
  if(method==='GET')return url==='/app'||url==='/'||
    ['/assets/client.js','/assets/style.css','/v1/recipe','/v1/quotes','/v1/summary','/v1/orders','/v1/events','/v1/export'].includes(url)||
    /^\/v1\/quotes\/q[1-9][0-9]{0,8}$/.test(url);
  return ['/v1/quotes','/v1/sweep'].includes(url)||
   /^\/v1\/quotes\/q[1-9][0-9]{0,8}\/commands$/.test(url);
 }
 if(family==='inventory')
  return method==='GET'?['/','/app','/assets/client.js','/assets/style.css','/v1/context'].includes(url):url==='/v1/command';
 return false;
}
const LOGIN_HTML=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Private synthetic app demo</title></head><body><main><h1>Private synthetic app demonstration</h1><p>Authorized operator only. No real customers or production data.</p><form method="post" action="/_preview/login"><label>Operator access code <input name="code" type="password" autocomplete="off" required></label><button type="submit">Open demo</button></form></main></body></html>`;
const BASE={'cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer','permissions-policy':'camera=(),microphone=(),geolocation=()',
 'content-security-policy':"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"};
function respond(res,status,body,headers={}){
 res.writeHead(status,{...BASE,'content-type':'text/plain; charset=utf-8',...headers});res.end(body);
}
function parseCookie(input){
 if(typeof input!=='string')return null;
 const pairs=input.split(';').map(v=>v.trim()).filter(x=>x.startsWith(COOKIE+'='));
 if(pairs.length!==1)return null;
 const val=pairs[0].slice(COOKIE.length+1);
 return /^[A-Za-z0-9_-]{43}$/.test(val)?val:null;
}
function stripGateCookie(input){
 if(typeof input!=='string')return '';
 return input.split(';').map(x=>x.trim()).filter(x=>x&&!x.startsWith(COOKIE+'=')).join('; ');
}
async function readLogin(req){
 if(!/^application\/x-www-form-urlencoded(?:;\s*charset=UTF-8)?$/i.test(req.headers['content-type']||''))return null;
 if(Number(req.headers['content-length'])>512)return null;
 const chunks=[];let n=0;
 for await(const chunk of req){n+=chunk.length;if(n>512)return null;chunks.push(chunk);}
 const body=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
 if([...body.keys()].length!==1||!body.has('code'))return null;
 return body.get('code');
}
function gateRoot(root){
 if(typeof root!=='string'||!path.isAbsolute(root))deny('REMOTE_STATE_INVALID');
 const st=fs.lstatSync(root);
 if(!st.isDirectory()||st.isSymbolicLink()||fs.realpathSync(root)!==path.resolve(root)||
   (process.platform!=='win32'&&((st.mode&0o077)!==0||(typeof process.getuid==='function'&&st.uid!==process.getuid()))))deny('REMOTE_STATE_INVALID');
}
async function createRemoteGateway({fleet,family,id,externalOrigin,listenPort=0,clock=Date.now}={}){
 const u=externalURL(externalOrigin);
 if(!fleet||!Array.isArray(fleet.apps)||!safeId(id)||!['document','quote','inventory'].includes(family)||
   !Number.isSafeInteger(listenPort)||listenPort<0||listenPort>65535||typeof clock!=='function')deny('REMOTE_APP_INVALID');
 const matches=fleet.apps.filter(x=>x.family===family&&x.id===id);
 if(matches.length!==1)deny('REMOTE_APP_INVALID');
 const app=matches[0],target=new URL(app.origin);
 if(target.protocol!=='http:'||target.hostname!=='127.0.0.1'||target.pathname!=='/'||
    !Number.isSafeInteger(app.port)||String(app.port)!==target.port)deny('REMOTE_APP_INVALID');
 gateRoot(fleet.stateRoot);
 const code=crypto.randomBytes(18).toString('base64url'),digest=sha(code);
 const credentialFile=path.join(fleet.stateRoot,'remote-demo-access-'+family+'-'+id+'.json');
 const file=fs.openSync(credentialFile,'wx',0o600);
 try{fs.writeFileSync(file,JSON.stringify({kind:'synthetic-remote-preview',code,sessionMinutes:30,
   family,id,publicOrigin:u.origin},null,2)+'\n');fs.fsyncSync(file);}finally{fs.closeSync(file);}
 const sessions=new Map();let failures=[],lastTime=0;
 const checkClock=()=>{
  const t=clock();if(!Number.isSafeInteger(t)||t<lastTime){sessions.clear();failures=[];return null;}
  lastTime=t;failures=failures.filter(x=>t-x<60000);
  for(const [k,exp] of sessions)if(t>=exp)sessions.delete(k);
  return t;
 };
 let active=true;
 const server=http.createServer({maxHeaderSize:8192},async(req,res)=>{
  const time=checkClock();
  if(!active||time===null){respond(res,503,'Unavailable');return;}
  const port=server.address()?.port;
  if(req.headers.host!==u.host&&req.headers.host!=='127.0.0.1:'+port){respond(res,403,'Forbidden');return;}
  if(req.headers.origin!==undefined&&req.headers.origin!==u.origin){respond(res,403,'Forbidden');return;}
  if(req.headers['sec-fetch-site']==='cross-site'&&
    !(req.method==='GET'&&(req.url==='/'||req.url==='/app')&&req.headers['sec-fetch-mode']==='navigate')){
   respond(res,403,'Forbidden');return;
  }
  if(req.url==='/_preview/login'&&req.method==='POST'){
   if(req.headers.origin!==u.origin){respond(res,403,'Forbidden');return;}
   if(failures.length>=8){respond(res,429,'Too many attempts');return;}
   const supplied=await readLogin(req).catch(()=>null);
   const valid=typeof supplied==='string'&&crypto.timingSafeEqual(digest,sha(supplied));
   if(!valid){failures.push(time);respond(res,401,'Invalid access code');return;}
   const sid=crypto.randomBytes(32).toString('base64url');
   sessions.clear();sessions.set(sid,time+SESSION_MS);failures=[];
   respond(res,303,'',{'location':'/app','set-cookie':`${COOKIE}=${sid}; Path=/; Max-Age=1800; HttpOnly; Secure; SameSite=Strict`});return;
  }
  const sid=parseCookie(req.headers.cookie),signedIn=sid!==null&&sessions.has(sid);
  if(req.url==='/_preview/logout'&&req.method==='POST'){
   if(req.headers.origin!==u.origin){respond(res,403,'Forbidden');return;}
   if(sid!==null)sessions.delete(sid);
   respond(res,303,'',{'location':'/','set-cookie':`${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`});return;
  }
  if((req.url==='/'||req.url==='/_preview/login')&&req.method==='GET'&&!signedIn){
   respond(res,401,LOGIN_HTML,{'content-type':'text/html; charset=utf-8'});return;
  }
  if(!signedIn){respond(res,401,req.url?.startsWith('/v1/')||req.url?.startsWith('/app/api/')?'Unauthorized':LOGIN_HTML,
   {'content-type':req.url?.startsWith('/v1/')||req.url?.startsWith('/app/api/')?'text/plain; charset=utf-8':'text/html; charset=utf-8'});return;}
  if(req.url==='/'&&req.method==='GET'&&family==='document'){
   respond(res,303,'',{'location':'/app'});return;
  }
  if(req.method==='POST'&&req.headers.origin!==u.origin){respond(res,403,'Forbidden');return;}
  if(!allowed(family,req.method,req.url)){respond(res,404,'Not found');return;}
  if(Number(req.headers['content-length'])>65536){respond(res,413,'Too large');return;}
  const forwarded={host:target.host};
  for(const key of ['accept','accept-language','user-agent','content-type','content-length','authorization',
    'sec-fetch-site','sec-fetch-mode','sec-fetch-dest','idempotency-key','x-csrf-token']){
   if(req.headers[key]!==undefined)forwarded[key]=req.headers[key];
  }
  const appCookie=stripGateCookie(req.headers.cookie);if(appCookie)forwarded.cookie=appCookie;
  if(req.headers.origin!==undefined)forwarded.origin=app.origin;
  const proxy=http.request({hostname:'127.0.0.1',port:app.port,path:req.url,method:req.method,
    headers:forwarded,timeout:5000},upstream=>{
   if(res.headersSent)return;
   const headers={...upstream.headers,'cache-control':'no-store','x-content-type-options':'nosniff'};
   delete headers['content-security-policy-report-only'];
   if(headers['set-cookie'])headers['set-cookie']=[].concat(headers['set-cookie']).map(c=>/;\s*Secure(?:;|$)/i.test(c)?c:c+'; Secure');
   if(typeof headers.location==='string'&&headers.location.startsWith(app.origin)){
     headers.location=headers.location.slice(app.origin.length)||'/';
   }
   res.writeHead(upstream.statusCode,headers);upstream.pipe(res);
  });
  proxy.on('error',()=>{if(!res.headersSent)respond(res,502,'Preview origin unavailable');else res.destroy();});
  proxy.on('timeout',()=>proxy.destroy(Error('timeout')));
  req.on('aborted',()=>proxy.destroy());
  req.pipe(proxy);
 });
 server.requestTimeout=10000;server.headersTimeout=10000;server.keepAliveTimeout=1000;
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(listenPort,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
  if(server.address()?.address!=='127.0.0.1')deny('REMOTE_BIND_INVALID');
 }catch(error){fs.rmSync(credentialFile,{force:true});throw error;}
 return Object.freeze({port:server.address().port,origin:'http://127.0.0.1:'+server.address().port,
   externalOrigin:u.origin,loginCodeFile:credentialFile,family,id,
   async close(){if(!active)return;active=false;sessions.clear();server.closeAllConnections();
    if(server.listening)await new Promise(resolve=>server.close(resolve));}
 });
}
module.exports={createRemoteGateway,allowed,externalURL};
