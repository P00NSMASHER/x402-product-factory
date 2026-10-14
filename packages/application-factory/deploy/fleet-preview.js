'use strict';
// Start ONLY previously accepted, hash-verified apps in one private operator preview.
// No public bind, user data, billing, purchase, email, token logging, or live deployments.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {verifyInputs}=require('./preview');
const ROOT=path.resolve(__dirname,'../../..');
const fail=code=>{throw Error(code);};
const inside=(parent,item)=>{const r=path.relative(parent,item);
 return r===''||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));};
const safeName=v=>typeof v==='string'&&/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(v)&&v.length<=60;
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
function safeFolder(input,{existing=false}={}){
 if(typeof input!=='string'||!path.isAbsolute(input))fail('PREVIEW_PATH_UNSAFE');
 const target=path.resolve(input);
 if(inside(ROOT,target))fail('PREVIEW_PATH_UNSAFE');
 const parent=path.dirname(target);
 let stat;try{stat=fs.lstatSync(parent);}catch{fail('PREVIEW_PATH_UNSAFE');}
 if(!stat.isDirectory()||stat.isSymbolicLink()||fs.realpathSync(parent)!==parent||
  (process.platform!=='win32'&&(stat.mode&0o002)!==0&&(stat.mode&0o1000)===0))fail('PREVIEW_PATH_UNSAFE');
 if(existing){
  const s=fs.lstatSync(target);
  if(!s.isDirectory()||s.isSymbolicLink()||fs.realpathSync(target)!==target||
    (process.platform!=='win32'&&((s.mode&0o077)!==0||
     (typeof process.getuid==='function'&&s.uid!==process.getuid()))))fail('PREVIEW_PATH_UNSAFE');
 }
 return target;
}
function createRoot(input,sources){
 const root=safeFolder(input);
 if(fs.existsSync(root))fail('PREVIEW_OUTPUT_EXISTS');
 for(const source of Object.values(sources)){
  if(inside(root,path.resolve(source))||inside(path.resolve(source),root))fail('PREVIEW_PATH_UNSAFE');
 }
 fs.mkdirSync(root,{mode:0o700});return root;
}
function writeSecret(file,value){
 const fd=fs.openSync(file,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}
 finally{fs.closeSync(fd);}
}
function readRecipe(group){
 const filename=group.family==='document'?
  path.join(group.folder,'packages/application-factory/recipes.json'):
  path.join(group.folder,'recipe.json');
 const parsed=JSON.parse(fs.readFileSync(filename,'utf8'));
 const recipe=group.family==='document'?parsed[0]:parsed;
 if(!recipe||recipe.id!==group.id||!safeName(recipe.id)||typeof recipe.title!=='string')fail('PREVIEW_RECIPE_INVALID');
 return recipe;
}
async function openGroup(group,root){
 const recipe=readRecipe(group),location=path.join(root,group.family+'-'+group.id);
 fs.mkdirSync(location,{mode:0o700});
 let store=null,server=null,auth;
 try{
  if(group.family==='document'){
   const {openRuntime}=require(path.join(group.folder,'packages/application-factory/runtime/runtime.js'));
   const {createRuntimeServer}=require(path.join(group.folder,'packages/application-factory/runtime/http.js'));
   store=openRuntime({filename:path.join(location,'runtime.sqlite'),recipes:[recipe]});
   const user=store.provisionTenant('synthetic-preview');
   store.createWorkspace(user.token,{id:recipe.id,recipeId:recipe.id});
   auth={operator:user.token};server=createRuntimeServer({runtime:store,automation:false});
   await server.listen({port:0});
  }else if(group.family==='quote'){
   const {openStore}=require(path.join(group.folder,'store.js'));
   const {createServer}=require(path.join(group.folder,'server.js'));
   store=openStore({filename:path.join(location,'quotes.sqlite'),recipe});
   const user=store.provision('synthetic-preview');
   auth={operator:user.operatorToken,reviewer:user.reviewerToken};
   server=createServer({store,pollMs:60000});await server.listen(0);
  }else if(group.family==='inventory'){
   const {openStore}=require(path.join(group.folder,'store.js'));
   const {createServer}=require(path.join(group.folder,'server.js'));
   store=openStore({filename:path.join(location,'inventory.sqlite'),recipe});
   const user=store.provision('synthetic-preview');
   auth={operator:user.operatorKey,reviewer:user.reviewerKey};
   server=createServer({store,automation:false});await server.listen({port:0});
  }else fail('PREVIEW_FAMILY_INVALID');
  const port=group.family==='quote'?server.port():server.address()?.port;
  if(!Number.isSafeInteger(port)||port<1||port>65535)fail('PREVIEW_BIND_INVALID');
  const origin='http://127.0.0.1:'+port;
  const response=await fetch(origin+'/health',{signal:AbortSignal.timeout(4000)});
  const body=await response.json();
  if(response.status!==200||body.status!=='ok'||body.releaseApproved!==false)fail('PREVIEW_HEALTH_FAILED');
  const page=await fetch(origin+'/app',{signal:AbortSignal.timeout(4000)});
  if(page.status!==200||!/text\/html/.test(page.headers.get('content-type')||'')||
     !/default-src 'none'/.test(page.headers.get('content-security-policy')||''))fail('PREVIEW_HTML_FAILED');
  const denied=await fetch(origin+(group.family==='document'?'/v1/workspaces':group.family==='quote'?'/v1/quotes':'/v1/context'),
    {signal:AbortSignal.timeout(4000)});
  if(denied.status!==401)fail('PREVIEW_AUTH_FAILED');
  const stat=fs.statSync(location);
  if(process.platform!=='win32'&&(stat.mode&0o077)!==0)fail('PREVIEW_PATH_UNSAFE');
  writeSecret(path.join(location,'credentials.json'),{schemaVersion:1,syntheticOnly:true,
   family:group.family,id:group.id,sourceDigest:group.digest,credentials:auth});
  group.verify(group.folder,group.digest);
  return {family:group.family,id:group.id,title:recipe.title,digest:group.digest,origin,
   port,roles:Object.keys(auth),privateCredentialFile:path.join(location,'credentials.json'),
   async close(){await server.close();store.close();}};
 }catch(error){
  try{await server?.close();}catch{}
  try{store?.close();}catch{}
  throw error;
 }
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STYLE=':root{font:16px system-ui,sans-serif;color:#162b26;background:#f3f7f5}*{box-sizing:border-box}body{margin:0}header{background:#113e32;color:white;padding:32px clamp(20px,5vw,70px)}h1{margin:0;font-size:clamp(26px,4vw,43px);letter-spacing:-.04em}header p{margin:12px 0 0;opacity:.87}main{max-width:1100px;margin:auto;padding:28px 20px 70px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}.card{background:white;border:1px solid #cbded5;border-radius:15px;padding:23px;box-shadow:0 3px 14px #002e1609}.card h2{margin:7px 0 10px;font-size:20px;line-height:1.25}.meta{font-size:12px;letter-spacing:.1em;color:#496e60;text-transform:uppercase;font-weight:700}a{display:inline-block;padding:11px 17px;border-radius:9px;background:#1c654d;color:white;text-decoration:none;font-weight:700}p{line-height:1.55}.notice{border-left:4px solid #4a796b;padding-left:15px;margin-bottom:26px}small{color:#4b675d}@media(max-width:480px){header{padding:25px 18px}main{padding:20px 14px}.card{padding:19px}}';
const styleHash=crypto.createHash('sha256').update(STYLE).digest('base64');
const CSP="default-src 'none'; style-src 'sha256-"+styleHash+"'; img-src 'none'; script-src 'none'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'";
function portalHTML(apps){
 const sections=apps.map(a=>'<article class="card"><div class="meta">'+esc(a.family)+
   ' · local only</div><h2>'+esc(a.title)+'</h2><p><small>'+
   esc(a.id)+'</small></p><a href="'+esc(a.origin+'/app')+'">Open private workspace</a>'+
   '<p><small>Requires a synthetic access key in the private operator file. No public signup.</small></p></article>').join('');
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
   '<meta name="robots" content="noindex,nofollow"><title>Private factory app preview</title><style>'+STYLE+'</style></head>'+
   '<body><header><h1>Application factory · private fleet</h1><p>Real packaged applications. Local synthetic testing only.</p></header>'+
   '<main><p class="notice">All applications bind to 127.0.0.1. No customer accounts, payment, purchase, outreach, publishing or external connections. Release status: HOLD.</p>'+
   '<div class="grid">'+sections+'</div></main></body></html>';
}
function portalServer(apps){
 const html=portalHTML(apps);
 const server=http.createServer({maxHeaderSize:8192},(req,res)=>{
  const port=server.address()?.port,host='127.0.0.1:'+port;
  if(req.headers.host!==host||req.headers.origin!==undefined||req.method!=='GET'){
   res.writeHead(403,{'content-type':'text/plain','cache-control':'no-store'});res.end('Forbidden');return;
  }
  const headers={'cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY',
    'referrer-policy':'no-referrer','cross-origin-resource-policy':'same-origin',
    'content-security-policy':CSP,'permissions-policy':'camera=(),microphone=(),geolocation=()'};
  if(req.url==='/'){res.writeHead(200,{...headers,'content-type':'text/html; charset=utf-8'});res.end(html);return;}
  if(req.url==='/health'){
   res.writeHead(200,{...headers,'content-type':'application/json'});
   res.end(JSON.stringify({status:'ok',mode:'synthetic-private-only',appCount:apps.length,
     releaseApproved:false,publicHostingEnabled:false,checkoutEnabled:false}));return;
  }
  res.writeHead(404,{...headers,'content-type':'text/plain'});res.end('Not found');
 });
 server.requestTimeout=5000;server.headersTimeout=5000;server.keepAliveTimeout=1000;
 return {async listen({port=0}={}){
  if(!Number.isSafeInteger(port)||port<0||port>65535)fail('PREVIEW_PORT_INVALID');
  await new Promise((resolve,reject)=>{server.once('error',reject);
   server.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
  if(server.address()?.address!=='127.0.0.1')fail('PREVIEW_BIND_INVALID');
  return server.address().port;
 },async close(){
  server.closeAllConnections();
  if(server.listening)await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
 }};
}
async function launchPrivateFleet({sources,stateRoot,portalPort=0}={}){
 if(!sources||!exact(sources,['document','quote','inventory'])||
   !Number.isSafeInteger(portalPort)||portalPort<0||portalPort>65535)fail('PREVIEW_INPUT_INVALID');
 const groups=verifyInputs(sources);
 if(groups.length<3||groups.length>30)fail('PREVIEW_INPUT_INVALID');
 const ids=new Set();
 for(const group of groups){
  const key=group.family+':'+group.id;
  if(ids.has(key)||!safeName(group.id))fail('PREVIEW_INPUT_INVALID');
  ids.add(key);
 }
 const root=createRoot(stateRoot,sources),apps=[];
 let portal=null,stopped=false;
 async function stop(){
  if(stopped)return;stopped=true;
  try{await portal?.close();}finally{
   for(const app of [...apps].reverse())try{await app.close();}catch{}
  }
 }
 try{
  for(const group of groups)apps.push(await openGroup(group,root));
  portal=portalServer(apps);
  const port=await portal.listen({port:portalPort});
  const report={kind:'private-runnable-fleet',schemaVersion:1,appCount:apps.length,
   families:Object.fromEntries(['document','quote','inventory'].map(f=>[f,apps.filter(a=>a.family===f).length])),
   apps:apps.map(a=>({family:a.family,id:a.id,sourceDigest:a.digest,roles:a.roles,
     healthVerified:true,uiVerified:true,unauthenticatedApiDenied:true})),
   portalBoundToLoopback:true,sourceVerifiedBeforeAndAfter:true,
   separatePrivateSQLiteState:true,operatorKeysAbsentFromReport:true,
   realCustomers:null,collectedRevenue:null,externalMessagesSent:0,paymentsSent:0,
   publicHostingEnabled:false,checkoutEnabled:false,releaseApproved:false};
  report.digest=sha(JSON.stringify(report));
  writeSecret(path.join(root,'preview-report.json'),report);
  return {origin:'http://127.0.0.1:'+port,port,stateRoot:root,apps,report,stop};
 }catch(error){
  await stop();
  fs.rmSync(root,{force:true,recursive:true});throw error;
 }
}
module.exports={launchPrivateFleet,portalHTML,CSP};
