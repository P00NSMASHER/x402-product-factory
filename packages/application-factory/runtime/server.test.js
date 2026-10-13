"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const http=require('node:http');
const {openRuntime}=require('./runtime');
const recipes=require('../recipes.json');
const httpPath=path.join(__dirname,'http.js'),workerPath=path.join(__dirname,'worker.js');
const HTTP=fs.existsSync(httpPath)?require(httpPath):{};
const Worker=fs.existsSync(workerPath)?require(workerPath):{};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function setup(t){
  assert.equal(typeof HTTP.createRuntimeServer,'function','authenticated server must exist');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-api-test-'));
  let now=Date.parse('2026-10-13T12:00:00Z');
  const r=openRuntime({filename:path.join(dir,'runtime.sqlite'),recipes,clock:()=>now});
  const {token}=r.provisionTenant('customer-a');r.createWorkspace(token,{id:'main',recipeId:recipes[0].id});
  const server=HTTP.createRuntimeServer({runtime:r,automation:false});await server.listen({port:0});
  t.after(async()=>{await server.close();r.close();fs.rmSync(dir,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+server.address().port;
  async function request(url,{method='GET',body,auth=token,headers={}}={}){
    return fetch(base+url,{method,headers:{...(auth?{Authorization:'Bearer '+auth}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
  }
  return {r,token,server,request,setNow:n=>{now=n;}};
}
test('HTTP denies missing credentials and ignores caller-selected tenant identity',async t=>{
  const x=await setup(t);assert.equal((await x.request('/v1/workspaces',{auth:null})).status,401);
  assert.equal((await x.request('/v1/workspaces',{method:'POST',body:{id:'second',recipeId:recipes[0].id,tenantId:'customer-b'}})).status,400);
  const b=x.r.provisionTenant('customer-b').token;
  assert.equal((await x.request('/v1/workspaces/main',{auth:b})).status,404);
});
test('HTTP creates intake and retry returns same committed result',async t=>{
  const x=await setup(t),args={method:'POST',body:{command:{type:'add',name:'Synthetic API supplier',dueOn:'2026-10-13'}},headers:{'Idempotency-Key':'api-1'}};
  const first=await x.request('/v1/workspaces/main/commands',args);assert.equal(first.status,200);const a=await first.json();
  assert.deepEqual(await (await x.request('/v1/workspaces/main/commands',args)).json(),a);
  const snapshot=await (await x.request('/v1/workspaces/main')).json();assert.equal(snapshot.snapshot.records.length,1);
  x.r.sweep();const inbox=await (await x.request('/v1/workspaces/main/inbox')).json();assert.equal(inbox[0].channel,'internal-inbox');
});
test('HTTP rejects missing mutation keys malformed JSON large bodies and wrong content types',async t=>{
  const x=await setup(t),url='/v1/workspaces/main/commands';
  assert.equal((await x.request(url,{method:'POST',body:{command:{type:'archive',recordId:'r1'}}})).status,400);
  assert.equal((await x.request(url,{method:'POST',body:'{'})).status,400);
  assert.equal((await x.request(url,{method:'POST',body:'x'.repeat(20000)})).status,413);
  assert.equal((await x.request(url,{method:'POST',body:'{}',headers:{'Content-Type':'text/plain'}})).status,415);
});
test('HTTP refuses browser origins unexpected hostnames and query-string credentials',async t=>{
  const x=await setup(t);
  assert.equal((await x.request('/v1/workspaces',{headers:{Origin:'https://hostile.example'}})).status,403);
  const hostStatus=await new Promise((resolve,reject)=>{const req=http.get({hostname:'127.0.0.1',port:x.server.address().port,path:'/v1/workspaces',headers:{Host:'hostile.example',Authorization:'Bearer '+x.token}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});
  assert.equal(hostStatus,403);
  assert.equal((await x.request('/v1/workspaces?token=private')).status,400);
});
test('HTTP failure and public health responses do not disclose raw customer data or keys',async t=>{
  const x=await setup(t),health=await x.request('/health',{auth:null});assert.equal(health.status,200);
  const text=await health.text();assert.equal(text.includes(x.token),false);assert.equal(text.includes('customer-a'),false);
  const failed=await x.request('/v1/workspaces/unknown');assert.equal(failed.status,404);
  assert.equal(failed.headers.get('access-control-allow-origin'),null);assert.equal(failed.headers.get('cache-control'),'no-store');
});
test('supervisor runs and saves notifications while no browser is open',async t=>{
  assert.equal(typeof Worker.startWorker,'function','browser-independent supervisor must exist');
  const x=await setup(t);x.r.command(x.token,'main',{type:'add',name:'Unattended',dueOn:'2026-10-13'},'headless');
  const controller=Worker.startWorker(x.r,{pollMs:10});t.after(()=>controller.stop());
  const end=Date.now()+2000;while(!x.r.inbox(x.token,'main').length&&Date.now()<end)await wait(20);
  assert.equal(x.r.inbox(x.token,'main').length,1);assert.ok(controller.status().completedSweeps>=1);
  controller.stop();const before=controller.status().completedSweeps;await wait(40);assert.equal(controller.status().completedSweeps,before);
});
test('supervisor catches local store failures without exposing their raw messages',async()=>{
  assert.equal(typeof Worker.startWorker,'function');
  const controller=Worker.startWorker({sweep(){throw new Error('PRIVATE_CONNECTION_DETAILS');}},{pollMs:10});
  try{await wait(30);assert.equal(controller.status().lastError,'AUTOMATION_FAILED');assert.equal(JSON.stringify(controller.status()).includes('PRIVATE'),false);}finally{controller.stop();}
});
test('CLI provisions all three editions privately and executes work in a separate process',t=>{
  const script=path.resolve(__dirname,'../../..','scripts/run-application-runtime.js');
  assert.equal(fs.existsSync(script),true,'supervisor CLI must exist');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-cli-test-')),credential=path.join(dir,'customer-key.json');
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const run=(...args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:10000});
  const provision=run('provision','--state-dir',dir,'--tenant','customer-a','--credential-file',credential);
  assert.equal(provision.status,0,provision.stderr);const {token}=JSON.parse(fs.readFileSync(credential,'utf8'));
  assert.equal(provision.stdout.includes(token),false);if(process.platform!=='win32')assert.equal(fs.statSync(credential).mode&0o777,0o600);
  const r=openRuntime({filename:path.join(dir,'runtime.sqlite'),recipes});assert.equal(r.workspaces(token).length,3);
  const today=new Date().toISOString().slice(0,10);
  r.command(token,recipes[0].id,{type:'add',name:'Process restart',dueOn:today},'separate-process');r.close();
  const sweep=run('sweep','--state-dir',dir);assert.equal(sweep.status,0,sweep.stderr);
  const again=openRuntime({filename:path.join(dir,'runtime.sqlite'),recipes});try{assert.equal(again.inbox(token,recipes[0].id).length,1);}finally{again.close();}
  assert.notEqual(run('provision','--state-dir',dir,'--tenant','customer-b','--credential-file',credential).status,0);
  assert.equal(JSON.parse(fs.readFileSync(credential,'utf8')).token,token);
});
test('chunked oversized HTTP input receives a bounded error rather than losing the socket',async t=>{
  const x=await setup(t);
  const status=await new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:x.server.address().port,path:'/v1/workspaces/main/commands',method:'POST',headers:{Authorization:'Bearer '+x.token,'Content-Type':'application/json','Transfer-Encoding':'chunked'}},res=>{res.resume();resolve(res.statusCode);});
    req.on('error',reject);req.write('x'.repeat(17000));req.end();
  });
  assert.equal(status,413);
});
