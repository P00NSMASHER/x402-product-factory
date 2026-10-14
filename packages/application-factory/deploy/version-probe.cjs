'use strict';
// EXECUTED synthetic cross-version routing test: two genuinely different verified packages.
// No externally reachable listener, customer state, production DB migration, or deployment.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict');
const [family,oldDir,newDir,oldDigest,newDigest,scratch]=process.argv.slice(2);
if(!['document','quote','inventory'].includes(family)||
 [oldDir,newDir,scratch].some(v=>typeof v!=='string'||!path.isAbsolute(v))||
 [oldDigest,newDigest].some(v=>typeof v!=='string'||!/^[0-9a-f]{64}$/.test(v))||
 oldDigest===newDigest||oldDir===newDir)throw Error('VERSION_PROBE_INPUT_INVALID');
const request=(port,route,headers={})=>new Promise((resolve,reject)=>{
 const req=http.request({hostname:'127.0.0.1',port,path:route,method:'GET',headers,timeout:2500},res=>{
  const chunks=[];let size=0;
  res.on('data',c=>{size+=c.length;if(size>1024*1024)req.destroy(Error('HTTP_SIZE_LIMIT'));else chunks.push(c);});
  res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8')}));
 });
 req.once('error',reject);req.once('timeout',()=>req.destroy(Error('HTTP_TIMEOUT')));req.end();
});
function recipeOf(root){
 if(family==='document')return JSON.parse(fs.readFileSync(path.join(root,'packages/application-factory/recipes.json'),'utf8'))[0];
 return JSON.parse(fs.readFileSync(path.join(root,'recipe.json'),'utf8'));
}
async function boot(packageDir,lane){
 const state=path.join(scratch,lane);fs.mkdirSync(state,{recursive:true,mode:0o700});
 let store=null,server=null,port=null;
 try{
  if(family==='document'){
   const {openRuntime}=require(path.join(packageDir,'packages/application-factory/runtime/runtime.js'));
   const {createRuntimeServer}=require(path.join(packageDir,'packages/application-factory/runtime/http.js'));
   store=openRuntime({filename:path.join(state,'runtime.sqlite'),recipes:[recipeOf(packageDir)]});
   server=createRuntimeServer({runtime:store,automation:false});
   const listening=await server.listen({port:0});
   port=listening.port;assert.equal(listening.address,'127.0.0.1');
  }else if(family==='quote'){
   const {openStore}=require(path.join(packageDir,'store.js'));
   const {createServer}=require(path.join(packageDir,'server.js'));
   store=openStore({filename:path.join(state,'quotes.sqlite'),recipe:recipeOf(packageDir)});
   server=createServer({store,pollMs:500});
   await server.listen(0);port=server.port();
  }else{
   const {openStore}=require(path.join(packageDir,'store.js'));
   const {createServer}=require(path.join(packageDir,'server.js'));
   store=openStore({filename:path.join(state,'inventory.sqlite'),recipe:recipeOf(packageDir)});
   server=createServer({store,automation:false});
   const listening=await server.listen({port:0});
   port=listening.port;assert.equal(listening.address,'127.0.0.1');
  }
  assert.ok(Number.isSafeInteger(port)&&port>0);
  return {port,state,async close(){await server.close();store.close();}};
 }catch(e){try{await server?.close();}catch{}try{store?.close();}catch{}throw e;}
}
async function main(){
 assert.equal(recipeOf(oldDir).id,recipeOf(newDir).id);
 const stateOld=path.join(scratch,'baseline'),stateNew=path.join(scratch,'candidate');
 assert.notEqual(stateOld,stateNew);
 let old=null,candidate=null,proxy=null,active='baseline',upstreamUnavailable=0;
 const stoppedCandidate={port:null,close:async()=>{}};
 try{
  old=await boot(oldDir,'baseline');candidate=await boot(newDir,'candidate');
  assert.notEqual(old.port,candidate.port);
  const oldStateFile=path.join(stateOld,family==='document'?'runtime.sqlite':family==='quote'?'quotes.sqlite':'inventory.sqlite');
  const newStateFile=path.join(stateNew,family==='document'?'runtime.sqlite':family==='quote'?'quotes.sqlite':'inventory.sqlite');
  assert.ok(fs.existsSync(oldStateFile)&&fs.existsSync(newStateFile));
  assert.notEqual(fs.realpathSync(oldStateFile),fs.realpathSync(newStateFile));
  proxy=http.createServer((req,res)=>{
   if(req.method!=='GET'||!['/health','/app'].includes(req.url)||
      req.headers.host!=='127.0.0.1:'+proxy.address()?.port||
      req.headers.origin!==undefined||req.headers.authorization!==undefined){
    res.writeHead(403,{'content-type':'text/plain','cache-control':'no-store'});res.end('blocked');return;
   }
   function forward(recovered=false){
    const lane=active,target=lane==='candidate'?candidate:old;
    const next=http.request({hostname:'127.0.0.1',port:target.port,path:req.url,method:'GET',
      headers:{Host:'127.0.0.1:'+target.port},timeout:1500},reply=>{
      const headers={'content-type':reply.headers['content-type']||'text/plain',
        'cache-control':'no-store','x-private-version':lane==='candidate'?newDigest:oldDigest,
        'x-private-lane':lane};
      if(reply.headers['content-security-policy'])headers['content-security-policy']=reply.headers['content-security-policy'];
      res.writeHead(reply.statusCode,headers);reply.pipe(res);
    });
    next.once('error',()=>{
      upstreamUnavailable++;
      if(!recovered&&lane==='candidate'&&old){
        active='baseline';forward(true);return;
      }
      if(!res.headersSent){res.writeHead(503,{'cache-control':'no-store'});res.end('unavailable');}
    });
    next.once('timeout',()=>next.destroy(Error('UPSTREAM_TIMEOUT')));
    next.end();
   }
   forward();
  });
  await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',()=>{proxy.off('error',reject);resolve();});});
  assert.equal(proxy.address().address,'127.0.0.1');
  const port=proxy.address().port,host={Host:'127.0.0.1:'+port};
  const baseline=await request(port,'/health',host);
  assert.equal(baseline.status,200);assert.equal(JSON.parse(baseline.body).releaseApproved,false);
  assert.equal(baseline.headers['x-private-version'],oldDigest);
  active='candidate';
  const upgraded=await request(port,'/app',host);
  assert.equal(upgraded.status,200);assert.equal(upgraded.headers['x-private-version'],newDigest);
  assert.match(upgraded.headers['content-security-policy'],/default-src 'none'/);
  assert.match(upgraded.body,/<html/i);
  const probe=await request(port,'/health',host);
  assert.equal(probe.status,200);assert.equal(probe.headers['x-private-lane'],'candidate');
  // Inject a genuine closed socket, retaining its previously assigned port for the next attempt.
  const stoppedPort=candidate.port;
  await candidate.close();candidate={...stoppedCandidate,port:stoppedPort};
  const recovered=await request(port,'/health',host);
  assert.equal(recovered.status,200);assert.equal(recovered.headers['x-private-version'],oldDigest);
  assert.equal(recovered.headers['x-private-lane'],'baseline');assert.equal(active,'baseline');
  assert.ok(upstreamUnavailable>=1);
  assert.equal((await request(port,'/health',{Host:'other.example'})).status,403);
  assert.equal((await request(port,'/health',{...host,Origin:'https://outside.example'})).status,403);
  assert.equal((await request(port,'/v1/context',host)).status,403);
  assert.equal((await request(port,'/app',{...host,Authorization:'Bearer fake'})).status,403);
  // No false-green: if baseline also goes down, the proxy must refuse availability.
  await old.close();old=null;
  const outage=await request(port,'/health',host);
  assert.equal(outage.status,503);
  old=await boot(oldDir,'baseline');
  const restored=await request(port,'/health',host);
  assert.equal(restored.status,200);assert.equal(restored.headers['x-private-version'],oldDigest);
  assert.ok(fs.existsSync(newStateFile));
  return {kind:'isolated-cross-version-traffic-rehearsal',family,id:recipeOf(oldDir).id,
    baselineDigest:oldDigest,candidateDigest:newDigest,passed:true,distinctVersions:true,
    isolatedSqliteState:true,baselineAfterCanaryOutage:true,unrecoverableOutageFailsClosed:true,
    baselineRestartSameState:true,hostAndOriginDenied:true,onlyLocalHttp:true,
    differentVersionRollbackProbe:true,crossVersionStateMigrated:false,
    productionRollbackExecuted:false,publicDeploymentEnabled:false,
    realCustomers:null,collectedRevenue:null,transmittedMessages:0,paymentsSent:0,releaseApproved:false};
 }finally{
  if(proxy){proxy.closeAllConnections();if(proxy.listening)
    await new Promise((resolve,reject)=>proxy.close(err=>err?reject(err):resolve()));}
  await candidate?.close();await old?.close();
 }
}
main().then(v=>console.log(JSON.stringify(v))).catch(e=>{
 console.error('Synthetic version traffic acceptance blocked: '+String(e?.code||e?.message||'UNKNOWN').slice(0,100));
 process.exitCode=1;
});
