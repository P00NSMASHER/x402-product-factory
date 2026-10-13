"use strict";
const fs=require('node:fs'),path=require('node:path');
const {createSessions,cookieId,sessionCookie,expiredCookie}=require('./browser-sessions');
const fail=code=>{throw new Error(code);};
const fields=(value,required,optional=[])=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  required.every(k=>Object.hasOwn(value,k))&&Object.keys(value).every(k=>required.includes(k)||optional.includes(k));
const CSP="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'";
function createBrowserRoutes({runtime,readBody,send}){
  const sessions=createSessions({validate:credential=>runtime.workspaces(credential)});
  const assets=new Map([
    ['/app',['browser.html','text/html; charset=utf-8']],
    ['/app/',['browser.html','text/html; charset=utf-8']],
    ['/app/assets/browser-transport.js',['browser-transport.js','text/javascript; charset=utf-8']],
    ['/app/assets/browser-client.js',['browser-client.js','text/javascript; charset=utf-8']],
    ['/app/assets/browser.css',['browser.css','text/css; charset=utf-8']]
  ].map(([url,[file,type]])=>[url,{body:fs.readFileSync(path.join(__dirname,file)),type}]));
  return Object.freeze({
    close(){sessions.clear();},
    async handle(req,res,origin){
      const url=req.url||'';
      if(url!=='/app'&&!url.startsWith('/app/'))return false;
      if((req.headers.origin!==undefined&&req.headers.origin!==origin)||
         ['cross-site','same-site'].includes(req.headers['sec-fetch-site']))fail('FORBIDDEN');
      const asset=assets.get(url);
      if(req.method==='GET'&&asset){
        res.writeHead(200,{'content-type':asset.type,'cache-control':'no-store','content-security-policy':CSP,
          'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer',
          'cross-origin-resource-policy':'same-origin','permissions-policy':'camera=(), microphone=(), geolocation=()'});
        res.end(asset.body);return true;
      }
      if(!url.startsWith('/app/api/'))fail('NOT_FOUND');
      if(req.method!=='GET'&&req.method!=='POST')fail('NOT_FOUND');
      if(req.method==='POST'&&req.headers.origin!==origin)fail('FORBIDDEN');
      if(url==='/app/api/session'&&req.method==='POST'){
        const body=await readBody(req);if(!fields(body,['credential']))fail('BAD_REQUEST');
        const issued=sessions.issue(body.credential);sessions.remove(cookieId(req.headers.cookie));
        send(res,200,{csrfToken:issued.csrf,expiresAt:issued.expiresAt},{'set-cookie':sessionCookie(issued.id)});return true;
      }
      let session;
      try{session=sessions.read(cookieId(req.headers.cookie));}
      catch(error){if(error.message==='UNAUTHORIZED')res.setHeader('set-cookie',expiredCookie());throw error;}
      if(req.method==='POST'&&req.headers['x-csrf-token']!==session.csrf)fail('FORBIDDEN');
      const credential=session.credential;
      if(url==='/app/api/session'&&req.method==='GET')send(res,200,{csrfToken:session.csrf,expiresAt:session.expiresAt});
      else if(url==='/app/api/logout'&&req.method==='POST'){
        if(!fields(await readBody(req),[]))fail('BAD_REQUEST');
        sessions.remove(cookieId(req.headers.cookie));send(res,200,{signedOut:true},{'set-cookie':expiredCookie()});
      }else if(url==='/app/api/workspaces'&&req.method==='GET')send(res,200,runtime.workspaces(credential));
      else{
        const match=/^\/app\/api\/workspaces\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?:\/(commands|inbox|export))?$/.exec(url);
        if(!match)fail('NOT_FOUND');const [,id,action]=match;
        if(req.method==='GET'&&!action)send(res,200,runtime.workspace(credential,id));
        else if(req.method==='GET'&&action==='inbox')send(res,200,runtime.inbox(credential,id));
        else if(req.method==='GET'&&action==='export')send(res,200,runtime.workspace(credential,id).snapshot,{'content-disposition':`attachment; filename="${id}.json"`});
        else if(req.method==='POST'&&action==='commands'){
          const body=await readBody(req);if(!fields(body,['command'],['expectedVersion']))fail('BAD_REQUEST');
          // Awaiting the body may overlap logout or credential rotation. Reauthorize now.
          const current=sessions.read(cookieId(req.headers.cookie));
          if(current.csrf!==session.csrf)fail('UNAUTHORIZED');
          send(res,200,runtime.command(current.credential,id,body.command,req.headers['idempotency-key'],body.expectedVersion));
        }else fail('NOT_FOUND');
      }
      return true;
    }
  });
}
module.exports={createBrowserRoutes};
