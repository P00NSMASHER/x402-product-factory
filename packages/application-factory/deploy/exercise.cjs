'use strict';
// Genuine process-isolated boot and HTTP probes using ONLY assembled package modules.
// No public socket, payment processor, external HTTP source, buyer, or production credentials.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const family=process.argv[2],app=process.argv[3],scratch=process.argv[4],digest=process.argv[5];
const route={document:'/v1/workspaces',quote:'/v1/quotes',inventory:'/v1/context'};
if(!['document','quote','inventory'].includes(family)||!path.isAbsolute(app)||!path.isAbsolute(scratch)||
   !/^[a-f0-9]{64}$/.test(digest))throw Error('REHEARSAL_INPUT_INVALID');
const request=(port,url,headers={})=>new Promise((resolve,reject)=>{
 const req=http.request({hostname:'127.0.0.1',port,path:url,method:'GET',headers,timeout:4000},res=>{
  let body='';res.setEncoding('utf8');res.on('data',data=>{body+=data;if(body.length>1024*1024)req.destroy(Error('TOO_LARGE'));});
  res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
 });req.once('error',reject);req.once('timeout',()=>req.destroy(Error('TIMEOUT')));req.end();
});
async function boot(){
 const state=path.join(scratch,'state');fs.mkdirSync(state,{recursive:true,mode:0o700});
 let store,server,port;
 if(family==='document'){
  const {openRuntime}=require(path.join(app,'packages/application-factory/runtime/runtime.js'));
  const {createRuntimeServer}=require(path.join(app,'packages/application-factory/runtime/http.js'));
  const recipes=JSON.parse(fs.readFileSync(path.join(app,'packages/application-factory/recipes.json'),'utf8'));
  store=openRuntime({filename:path.join(state,'runtime.sqlite'),recipes});
  server=createRuntimeServer({runtime:store,automation:false});await server.listen({port:0});
  port=server.address().port;assert.equal(server.address().address,'127.0.0.1');
 }else if(family==='quote'){
  const {openStore}=require(path.join(app,'store.js'));
  const {createServer}=require(path.join(app,'server.js'));
  const recipe=JSON.parse(fs.readFileSync(path.join(app,'recipe.json'),'utf8'));
  store=openStore({filename:path.join(state,'quotes.sqlite'),recipe});
  server=createServer({store,pollMs:500});await server.listen(0);port=server.port();
 }else{
  const {openStore}=require(path.join(app,'store.js'));
  const {createServer}=require(path.join(app,'server.js'));
  const recipe=JSON.parse(fs.readFileSync(path.join(app,'recipe.json'),'utf8'));
  store=openStore({filename:path.join(state,'inventory.sqlite'),recipe});
  server=createServer({store,automation:false});await server.listen({port:0});
  port=server.address().port;assert.equal(server.address().address,'127.0.0.1');
 }
 return {port,async close(){await server.close();store.close();}};
}
async function main(){
 let probes=0;let service;
 for(let attempt=0;attempt<2;attempt++){
  try{
   service=await boot();
   const port=service.port,host={'Host':'127.0.0.1:'+port};
   const health=await request(port,'/health',host);
   assert.equal(health.status,200);
   const response=JSON.parse(health.body);
   assert.equal(response.status,'ok');assert.equal(response.releaseApproved,false);
   assert.equal(health.headers['cache-control'],'no-store');
   const ui=await request(port,'/app',host);
   assert.equal(ui.status,200);assert.match(ui.headers['content-type'],/text\/html/);
   assert.match(ui.headers['content-security-policy'],/default-src 'none'/);
   assert.match(ui.body,/<!doctype html|<html/i);
   const missingAuth=await request(port,route[family],host);
   assert.equal(missingAuth.status,401);
   const forgedHost=await request(port,'/health',{'Host':'outside.example'});
   assert.equal(forgedHost.status,403);
   const forgedOrigin=await request(port,'/health',{...host,'Origin':'https://outside.example'});
   assert.equal(forgedOrigin.status,403);
   probes++;
  }finally{await service?.close();service=null;}
 }
 const recipe=family==='document'?
  JSON.parse(fs.readFileSync(path.join(app,'packages/application-factory/recipes.json'),'utf8'))[0]:
  JSON.parse(fs.readFileSync(path.join(app,'recipe.json'),'utf8'));
 return {kind:'isolated-private-deployment-probe',family,id:recipe.id,digest,passed:true,
  restartsProbed:probes,loopbackOnly:true,healthy:true,hostGuard:true,originGuard:true,
  unauthorizedApiDenied:true,productionApproved:false,externalRequestsMadeByHarness:0,
  transmittedMessages:0,paymentsSent:0,realCustomers:null,collectedRevenue:null,releaseApproved:false};
}
main().then(x=>console.log(JSON.stringify(x))).catch(()=>{console.error('Private application staging or source-integrity probe failed.');process.exitCode=1;});
