"use strict";
const http=require('node:http');
const {startWorker}=require('./worker');
const MAX_BODY=16384;
const ERRORS=new Map([
  ['UNAUTHORIZED',401],['FORBIDDEN',403],['NOT_FOUND',404],['BODY_TOO_LARGE',413],['CONTENT_TYPE_INVALID',415],
  ['WORKSPACE_CONFLICT',409],['IDEMPOTENCY_CONFLICT',409],['VERSION_CONFLICT',409],['CAPACITY_LIMIT',409],
  ...['BAD_REQUEST','COMMAND_INVALID','WORKSPACE_INVALID','IDEMPOTENCY_KEY_INVALID','VERSION_INVALID','RECORD_INVALID',
    'RECORD_UNKNOWN','RECORD_ARCHIVED','DOCUMENT_UNKNOWN','DOCUMENT_INVALID','EXPIRY_INVALID','EXPIRY_NOT_ALLOWED',
    'CLOCK_INVALID','RECORD_LIMIT','HISTORY_LIMIT'].map(code=>[code,400])
]);
const reject=code=>{throw new Error(code);};
const fields=(value,required,optional=[])=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  required.every(k=>Object.hasOwn(value,k))&&Object.keys(value).every(k=>required.includes(k)||optional.includes(k));
async function readBody(req){
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||''))reject('CONTENT_TYPE_INVALID');
  if(Number(req.headers['content-length'])>MAX_BODY){req.resume();reject('BODY_TOO_LARGE');}
  let length=0;const chunks=[];
  for await(const chunk of req){length+=chunk.length;if(length>MAX_BODY)reject('BODY_TOO_LARGE');chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{reject('BAD_REQUEST');}
}
function createRuntimeServer({runtime,automation=true,pollMs=1000}={}){
  if(!runtime||typeof runtime.command!=='function'||typeof automation!=='boolean')throw new Error('SERVER_CONFIG_INVALID');
  let worker=null;
  function send(res,status,body){
    res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
    res.end(JSON.stringify(body));
  }
  const server=http.createServer({maxHeaderSize:8192},async(req,res)=>{
    try{
      if(req.headers.origin!==undefined||req.headers.host!==`127.0.0.1:${server.address()?.port}`)reject('FORBIDDEN');
      const url=req.url||'';if(url.length>240||url.includes('?')||url.includes('%')||!url.startsWith('/'))reject('BAD_REQUEST');
      if(req.method==='GET'&&url==='/health')return send(res,200,{status:'ok',mode:'local-development',releaseApproved:false});
      const auth=req.headers.authorization||'';if(!/^Bearer [A-Za-z0-9_-]{43}$/.test(auth))reject('UNAUTHORIZED');
      const token=auth.slice(7);runtime.workspaces(token); // Authenticate before parsing any mutation.
      if(req.method==='GET'&&url==='/v1/recipes')return send(res,200,runtime.recipeCatalog());
      if(req.method==='GET'&&url==='/v1/workspaces')return send(res,200,runtime.workspaces(token));
      if(req.method==='POST'&&url==='/v1/workspaces')return send(res,201,runtime.createWorkspace(token,await readBody(req)));
      const match=/^\/v1\/workspaces\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?:\/(inbox|commands))?$/.exec(url);
      if(!match)reject('NOT_FOUND');const [,id,action]=match;
      if(req.method==='GET'&&!action)return send(res,200,runtime.workspace(token,id));
      if(req.method==='GET'&&action==='inbox')return send(res,200,runtime.inbox(token,id));
      if(req.method==='POST'&&action==='commands'){
        const body=await readBody(req);if(!fields(body,['command'],['expectedVersion']))reject('BAD_REQUEST');
        return send(res,200,runtime.command(token,id,body.command,req.headers['idempotency-key'],body.expectedVersion));
      }
      reject('NOT_FOUND');
    }catch(error){const code=ERRORS.has(error?.message)?error.message:'INTERNAL_ERROR';if(!res.headersSent)send(res,ERRORS.get(code)||500,{error:code});}
  });
  server.requestTimeout=5000;server.headersTimeout=5000;server.keepAliveTimeout=1000;
  return Object.freeze({
    address(){return server.address();},
    async listen({port=8789}={}){
      if(!Number.isSafeInteger(port)||port<0||port>65535)throw new Error('PORT_INVALID');
      await new Promise((resolve,rejectPromise)=>{server.once('error',rejectPromise);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',rejectPromise);resolve();});});
      if(automation)worker=startWorker(runtime,{pollMs});return server.address();
    },
    workerStatus(){return worker?.status()||{running:false};},
    async close(){worker?.stop();server.closeAllConnections();if(server.listening)await new Promise((resolve,rejectPromise)=>server.close(error=>error?rejectPromise(error):resolve()));}
  });
}
module.exports={createRuntimeServer,MAX_BODY};
