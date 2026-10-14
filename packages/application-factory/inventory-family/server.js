'use strict';
// Loopback HTTP only. No customer payment, vendor API, mail, purchase order or external browser assets.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const fail=c=>{throw Error(c);};
const errors={UNAUTHORIZED:401,FORBIDDEN:403,NOT_FOUND:404,CONTENT_TYPE_INVALID:415,BODY_TOO_LARGE:413,
 BAD_REQUEST:400,ITEM_UNKNOWN:404,ITEM_INVALID:400,COMMAND_INVALID:400,QUANTITY_INVALID:400,
 STOCK_SHORT:409,STOCK_LIMIT:409,ORDER_LIMIT:409,ORDER_STATE:409,ORDER_EXPIRED:409,
 REORDER_UNNEEDED:409,BUDGET_CAP:409,VERSION_INVALID:400,KEY_INVALID:400,
 VERSION_CONFLICT:409,IDEMPOTENCY_CONFLICT:409,RECEIPT_LIMIT:409};
const CSP="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; font-src 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'";
async function readJSON(req){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||''))fail('CONTENT_TYPE_INVALID');
 if(Number(req.headers['content-length'])>16384){req.resume();fail('BODY_TOO_LARGE');}
 let size=0;const chunks=[];
 for await(const chunk of req){size+=chunk.length;if(size>16384)fail('BODY_TOO_LARGE');chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('BAD_REQUEST');}
}
function createServer({store,pollMs=60000,automation=true}={}){
 if(!store||typeof store.context!=='function'||typeof store.sweep!=='function'||typeof automation!=='boolean'||
 !Number.isSafeInteger(pollMs)||pollMs<25||pollMs>3600000)fail('SERVER_CONFIG_INVALID');
 let timer=null;
 const assets=new Map([['/app',['index.html','text/html; charset=utf-8']],
  ['/',['index.html','text/html; charset=utf-8']],
  ['/assets/client.js',['client.js','text/javascript; charset=utf-8']],
  ['/assets/style.css',['style.css','text/css; charset=utf-8']]]
 ].map(([url,[filename,type]])=>[url,{body:fs.readFileSync(path.join(__dirname,filename)),type}]));
 const send=(res,status,data,headers={})=>{
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
   'x-content-type-options':'nosniff','referrer-policy':'no-referrer',...headers});
  res.end(JSON.stringify(data));
 };
 const httpServer=http.createServer({maxHeaderSize:8192},async(req,res)=>{
  try{
   const port=httpServer.address()?.port,origin='http://127.0.0.1:'+port;
   if(req.headers.host!=='127.0.0.1:'+port)fail('FORBIDDEN');
   if(req.headers.origin!==undefined&&req.headers.origin!==origin)fail('FORBIDDEN');
   const url=req.url||'';
   if(url.length>240||url.includes('%')||url.includes('?')||!/^\/[a-zA-Z0-9/.-]*$/.test(url)||url.includes('..'))fail('NOT_FOUND');
   if(req.method==='GET'&&assets.has(url)){
    const item=assets.get(url);
    res.writeHead(200,{'content-type':item.type,'cache-control':'no-store',
     'content-security-policy':CSP,'x-frame-options':'DENY','x-content-type-options':'nosniff',
     'cross-origin-resource-policy':'same-origin','permissions-policy':'camera=(),microphone=(),geolocation=()'});
    res.end(item.body);return;
   }
   if(req.method==='GET'&&url==='/health')
    return send(res,200,{status:'ok',mode:'synthetic-local-only',releaseApproved:false});
   const auth=req.headers.authorization||'';
   if(!/^Bearer [a-zA-Z0-9_-]{43}$/.test(auth))fail('UNAUTHORIZED');
   const token=auth.slice(7),context=store.context(token);
   if(req.method==='GET'&&url==='/v1/context')return send(res,200,context);
   if(req.method==='POST'&&url==='/v1/command'){
    const data=await readJSON(req);
    if(!data||typeof data!=='object'||Array.isArray(data)||
     Object.keys(data).sort().join(',')!=='command,expectedRevision,sku')fail('BAD_REQUEST');
    const result=store.command(token,data.sku,data.command,req.headers['idempotency-key'],data.expectedRevision);
    return send(res,200,result);
   }
   fail('NOT_FOUND');
  }catch(error){
   const code=Object.hasOwn(errors,error?.message)?error.message:'INTERNAL_ERROR';
   if(!res.headersSent)send(res,errors[code]||500,{error:code});
  }
 });
 httpServer.requestTimeout=5000;httpServer.headersTimeout=5000;httpServer.keepAliveTimeout=1000;
 return Object.freeze({
  address:()=>httpServer.address(),
  async listen({port=8791}={}){
   if(!Number.isSafeInteger(port)||port<0||port>65535)fail('PORT_INVALID');
   await new Promise((resolve,reject)=>{
    httpServer.once('error',reject);httpServer.listen(port,'127.0.0.1',()=>{
     httpServer.removeListener('error',reject);resolve();
    });
   });
   if(automation){timer=setInterval(()=>{try{store.sweep();}catch{}},pollMs);timer.unref();}
   return httpServer.address();
  },
  async close(){
   if(timer)clearInterval(timer);
   httpServer.closeAllConnections();
   if(httpServer.listening)await new Promise((resolve,reject)=>httpServer.close(e=>e?reject(e):resolve()));
  }
 });
}
module.exports={createServer};
