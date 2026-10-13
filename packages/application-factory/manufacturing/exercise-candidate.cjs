'use strict';
// Independent acceptance process. It imports the ASSEMBLED app, not repository runtime modules.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(root,scratch,digest){
  const from=rel=>require(path.join(root,rel));
  const recipes=from('packages/application-factory/recipes.json');assert.equal(recipes.length,1);
  const recipe=recipes[0],{openRuntime}=from('packages/application-factory/runtime/runtime.js');
  const {openVault}=from('packages/application-factory/runtime/vault.js');
  const {createRuntimeServer}=from('packages/application-factory/runtime/http.js');
  const {captureRecovery,verifyRecovery,restoreRecovery}=from('packages/application-factory/runtime/recovery.js');
  const {reissue}=from('scripts/application-recovery.js');
  assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.FACTORY_VAULT_KEY_HEX,undefined);
  const stateDir=path.join(scratch,'state'),credentialFile=path.join(scratch,'credential.json');
  const cli=path.join(root,'scripts/run-application-runtime.js');
  const provision=spawnSync(process.execPath,[cli,'provision','--state-dir',stateDir,'--tenant','synthetic-a','--credential-file',credentialFile],
    {encoding:'utf8',timeout:5000,killSignal:'SIGKILL',maxBuffer:65536,env:process.env,windowsHide:true});
  assert.equal(provision.status,0,provision.stderr);
  const {token}=JSON.parse(fs.readFileSync(credentialFile,'utf8'));assert.equal(provision.stdout.includes(token),false);
  let runtime,vault,server,restoredRuntime,restoredVault;
  const vaultKey=crypto.randomBytes(32),backupKey=crypto.randomBytes(32),bytes=Buffer.from('%PDF-1.7\nSynthetic packaged acceptance\n%%EOF\n');
  try{
    runtime=openRuntime({filename:path.join(stateDir,'runtime.sqlite'),recipes});
    vault=openVault({filename:path.join(stateDir,'documents.sqlite'),key:vaultKey});
    assert.equal(runtime.workspaces(token).length,1);assert.equal(runtime.workspaces(token)[0].id,recipe.id);
    const other=runtime.provisionTenant('synthetic-b').token;
    runtime.createWorkspace(other,{id:recipe.id,recipeId:recipe.id});
    server=createRuntimeServer({runtime,vault,pollMs:10});await server.listen({port:0});
    const origin='http://127.0.0.1:'+server.address().port;
    const request=(url,options={})=>fetch(origin+url,{...options,signal:AbortSignal.timeout(5000)});
    const asset=await request('/app');assert.equal(asset.status,200);assert.match(await asset.text(),/workspace-panel/);
    for(const name of ['browser-client.js','browser-transport.js','browser.css'])assert.equal((await request('/app/assets/'+name)).status,200);
    const login=await request('/app/api/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({credential:token})});
    assert.equal(login.status,200);const session=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];
    const headers={Cookie:cookie,Origin:origin,'X-CSRF-Token':session.csrfToken,'Content-Type':'application/json','Idempotency-Key':'once'};
    const today=new Date().toISOString().slice(0,10),endpoint='/app/api/workspaces/'+recipe.id;
    const command=JSON.stringify({command:{type:'add',name:'Synthetic assembled record',dueOn:today}});
    const one=await request(endpoint+'/commands',{method:'POST',headers,body:command});assert.equal(one.status,200);const value=await one.json();
    const replay=await request(endpoint+'/commands',{method:'POST',headers,body:command});assert.equal(replay.status,200);assert.deepEqual(await replay.json(),value);
    assert.equal(runtime.workspace(token,recipe.id).records.length,1);assert.equal(runtime.workspace(other,recipe.id).records.length,0);
    const upload=await request(endpoint+'/documents',{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream','Idempotency-Key':'evidence-once',
      'X-Record-Id':value.result.id,'X-Requirement-Id':recipe.requirements[0].id,'X-Document-Name':'synthetic.pdf','X-Document-Type':'application/pdf'},body:bytes});
    assert.equal(upload.status,201);const doc=await upload.json();
    const download=await request(endpoint+'/documents/'+doc.id,{headers:{Cookie:cookie}});assert.equal(download.status,200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);assert.match(download.headers.get('content-disposition'),/^attachment/);
    assert.equal((await request('/v1/workspaces/'+recipe.id+'/documents/'+doc.id,{headers:{Authorization:'Bearer '+other}})).status,404);
    const end=Date.now()+3000;while(runtime.inbox(token,recipe.id).length===0&&Date.now()<end)await wait(20);
    assert.equal(runtime.inbox(token,recipe.id).length,1);assert.ok(server.workerStatus().completedSweeps>0);
    for(const req of recipe.requirements)runtime.command(token,recipe.id,{type:'receive',recordId:value.result.id,requirementId:req.id,
      ...(req.renewable?{expiresOn:new Date(Date.now()+366*86400000).toISOString().slice(0,10)}:{})},'receive-'+req.id);
    assert.equal(runtime.workspace(token,recipe.id).records[0].status,'complete');
    const saved=captureRecovery({stateDir,backupDir:path.join(scratch,'backups'),key:backupKey,vaultKey});
    assert.equal(saved.documents,1);assert.equal(verifyRecovery({filename:saved.filename,key:backupKey,vaultKey}).verified,true);
    const restored=restoreRecovery({filename:saved.filename,key:backupKey,vaultKey,destination:path.join(scratch,'restored')});
    restoredRuntime=openRuntime({filename:path.join(restored.destination,'runtime.sqlite'),recipes});
    restoredVault=openVault({filename:path.join(restored.destination,'documents.sqlite'),key:vaultKey});
    assert.throws(()=>restoredRuntime.workspaces(token),/UNAUTHORIZED/);
    const renewedFile=path.join(scratch,'renewed.json');reissue({stateDir:restored.destination,tenantId:'synthetic-a',credentialFile:renewedFile});
    const renewed=JSON.parse(fs.readFileSync(renewedFile,'utf8')).token;
    assert.equal(restoredRuntime.workspace(renewed,recipe.id).enabled,false);
    assert.deepEqual(restoredVault.read({tenantId:'synthetic-a',workspaceId:recipe.id,id:doc.id}).bytes,bytes);
    restoredRuntime.command(renewed,recipe.id,{type:'automation',enabled:true},'resume');assert.equal(restoredRuntime.sweep().notifications,0);
    await server.close();server=null;runtime.close();vault.close();
    const sweep=spawnSync(process.execPath,[cli,'sweep','--state-dir',stateDir],{encoding:'utf8',timeout:5000,killSignal:'SIGKILL',maxBuffer:65536,env:process.env,windowsHide:true});
    assert.equal(sweep.status,0,sweep.stderr);
    runtime=openRuntime({filename:path.join(stateDir,'runtime.sqlite'),recipes});vault=openVault({filename:path.join(stateDir,'documents.sqlite'),key:vaultKey});
    assert.equal(runtime.workspace(token,recipe.id).records.length,1);assert.equal(runtime.inbox(token,recipe.id).length,1);
    assert.deepEqual(vault.read({tenantId:'synthetic-a',workspaceId:recipe.id,id:doc.id}).bytes,bytes);
    return {kind:'assembled-application-acceptance',passed:true,recipeId:recipe.id,artifactDigest:digest,tenantIsolation:true,
      idempotentIntake:true,encryptedEvidence:true,headlessAutomation:true,restartPersistence:true,verifiedRecovery:true,oldCredentialsRejected:true,
      externalMessagesSent:0,paymentsSent:0,realCustomers:null,collectedRevenue:null,releaseApproved:false};
  }finally{await server?.close();restoredVault?.close();restoredRuntime?.close();vault?.close();runtime?.close();vaultKey.fill(0);backupKey.fill(0);}
}
if(require.main===module)main(process.argv[2],process.argv[3],process.argv[4]).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
