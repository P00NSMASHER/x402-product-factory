'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const errors={UNAUTHORIZED:401,FORBIDDEN:403,NOT_FOUND:404,TENANT_EXISTS:409,
 QUOTE_INVALID:400,QUOTE_EMPTY:400,QUOTE_STATE:409,QUOTE_EXPIRED:409,LINE_INVALID:400,LINE_LIMIT:409,
 TOTAL_LIMIT:409,COMMAND_INVALID:400,VERSION_CONFLICT:409,IDEMPOTENCY_CONFLICT:409,
 IDEMPOTENCY_KEY_INVALID:400,CONTENT_TYPE_INVALID:415,BODY_TOO_LARGE:413,BAD_REQUEST:400,
 RATE_LIMIT:429,RECEIPT_LIMIT:409,EVENT_LIMIT:409,QUOTE_LIMIT:409,HISTORY_LIMIT:409,CLOCK_INVALID:409};
const fail=code=>{throw Error(code);};
const CSP="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
async function readJson(req){
 if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type']||''))fail('CONTENT_TYPE_INVALID');
 if(Number(req.headers['content-length'])>16384){req.resume();fail('BODY_TOO_LARGE');}
 let size=0;const chunks=[];
 for await(const c of req){size+=c.length;if(size>16384)fail('BODY_TOO_LARGE');chunks.push(c);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('BAD_REQUEST');}
}
const fields=(v,k)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 Object.keys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x));
function createServer({store,pollMs=60000}={}){
 if(!store||typeof store.identity!=='function'||!Number.isInteger(pollMs)||pollMs<25||pollMs>3600000)fail('SERVER_CONFIG_INVALID');
 let timer=null;
 const send=(res,status,data,extra={})=>{
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
   'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer',...extra});
  res.end(JSON.stringify(data));
 };
 const assets=new Map([
  ['/app',['index.html','text/html; charset=utf-8']],
  ['/',['index.html','text/html; charset=utf-8']],
  ['/assets/client.js',['client.js','text/javascript; charset=utf-8']],
  ['/assets/style.css',['style.css','text/css; charset=utf-8']]
 ].map(([url,[file,type]])=>[url,{body:fs.readFileSync(path.join(__dirname,file)),type}]));
 const server=http.createServer({maxHeaderSize:8192},async(req,res)=>{
  try{
   const port=server.address()?.port,origin='http://127.0.0.1:'+port;
   if(req.headers.host!=='127.0.0.1:'+port)fail('FORBIDDEN');
   const url=req.url||'';
   if(url.length>240||!/^\/[a-zA-Z0-9/.-]*$/.test(url)||url.includes('..'))fail('NOT_FOUND');
   if(req.headers.origin!==undefined&&req.headers.origin!==origin)fail('FORBIDDEN');
   const asset=assets.get(url);
   if(asset&&req.method==='GET'){
    res.writeHead(200,{'content-type':asset.type,'cache-control':'no-store','content-security-policy':CSP,
     'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer'});
    res.end(asset.body);return;
   }
   if(req.method==='GET'&&url==='/health')return send(res,200,{status:'ok',mode:'synthetic-local-only',releaseApproved:false});
   const raw=req.headers.authorization||'';
   if(!/^Bearer [A-Za-z0-9_-]{43}$/.test(raw))fail('UNAUTHORIZED');
   const token=raw.slice(7),user=store.identity(token);
   if(req.method==='GET'){
    if(url==='/v1/recipe')return send(res,200,{recipe:store.recipe(),role:user.role,tenant:user.tenant});
    if(url==='/v1/quotes')return send(res,200,store.list(token));
    if(url==='/v1/summary')return send(res,200,store.summary(token));
    if(url==='/v1/orders')return send(res,200,store.orders(token));
    if(url==='/v1/events')return send(res,200,store.inbox(token));
    if(url==='/v1/export')return send(res,200,{quotes:store.list(token),orders:store.orders(token),
      releaseApproved:false,collectedRevenue:null}, {'content-disposition':'attachment; filename="quote-desk-synthetic.json"'});
    const match=/^\/v1\/quotes\/(q[1-9][0-9]{0,8})$/.exec(url);
    if(match)return send(res,200,store.get(token,match[1]));
   }
   if(req.method==='POST'){
    if(url==='/v1/quotes'){
     const body=await readJson(req);if(!fields(body,['clientLabel','validUntil']))fail('BAD_REQUEST');
     // Credential may be rotated or disabled during network/body streaming.
     store.identity(token);
     return send(res,201,store.create(token,body,req.headers['idempotency-key']));
    }
    const command=/^\/v1\/quotes\/(q[1-9][0-9]{0,8})\/commands$/.exec(url);
    if(command){const body=await readJson(req);if(!fields(body,['command','expectedRevision']))fail('BAD_REQUEST');
     store.identity(token);
     return send(res,200,store.command(token,command[1],body.command,body.expectedRevision,req.headers['idempotency-key']));
    }
    if(url==='/v1/sweep'){
     if(user.role!=='operator')fail('FORBIDDEN');const body=await readJson(req);
     if(!fields(body,[]))fail('BAD_REQUEST');store.identity(token);return send(res,200,store.sweep());
    }
   }
   fail('NOT_FOUND');
  }catch(e){const code=Object.hasOwn(errors,e?.message)?e.message:'INTERNAL_ERROR';
   if(!res.headersSent)send(res,errors[code]||500,{error:code});}
 });
 server.requestTimeout=5000;server.headersTimeout=5000;server.keepAliveTimeout=1000;
 return Object.freeze({
  async listen(port=8788){if(!Number.isInteger(port)||port<0||port>65535)fail('PORT_INVALID');
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
   timer=setInterval(()=>{try{store.sweep();}catch{}},pollMs);timer.unref();return server.address();},
  port(){return server.address()?.port;},
  async close(){if(timer){clearInterval(timer);timer=null;}server.closeAllConnections();
   if(server.listening)await new Promise(resolve=>server.close(resolve));}
 });
}
module.exports={createServer};
