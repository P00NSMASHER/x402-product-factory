'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {manufactureBatch}=require('../manufacturing/line');
const {manufactureQuoteBatch}=require('../quote-family/manufacturing');
const {manufactureInventoryBatch}=require('../inventory-family/manufacturing');
const docs=require('../recipes.json'),quotes=require('../quote-family/recipes.json'),inventory=require('../inventory-family/recipes.json');
const {launchPrivateFleet}=require('./fleet-preview');
const {createRemoteGateway}=require('./remote-gateway');
const {createPrivateFleetSupervisor}=require('./private-supervisor');
const ORIGIN='https://private-demo.example.ts.net';
function request(port,route,{method='GET',cookie,origin,headers={},body}={}){
 return new Promise((resolve,reject)=>{
  const h={Host:new URL(ORIGIN).host,...headers};if(cookie)h.Cookie=cookie;if(origin)h.Origin=origin;
  const r=http.request({hostname:'127.0.0.1',port,path:route,method,headers:h,timeout:4000},res=>{
   const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8')}));
  });r.on('error',reject);r.on('timeout',()=>r.destroy(Error('timeout')));r.end(body);
 });
}
test('all three manufactured app families operate behind authenticated loopback ingress',async t=>{
 if(process.platform==='win32')return t.skip('Linux synthetic package integration');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'remote-fleet-integrated-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const sources={document:path.join(dir,'docs'),quote:path.join(dir,'quotes'),inventory:path.join(dir,'inventory')};
 assert.equal(manufactureBatch({recipes:[docs[0]],outputRoot:sources.document}).accepted,1);
 assert.equal(manufactureQuoteBatch({recipes:[quotes[0]],outputRoot:sources.quote}).accepted,1);
 assert.equal(manufactureInventoryBatch({catalog:[inventory[0]],outputRoot:sources.inventory}).accepted,1);
 const fleet=await launchPrivateFleet({sources,stateRoot:path.join(dir,'session')});
 t.after(()=>fleet.stop());
 const watchdog=createPrivateFleetSupervisor({fleet,maxRestarts:2});
 t.after(()=>watchdog.stop());
 const initial=await watchdog.tick();assert.equal(initial.healthy,3);
 for(const app of [...fleet.apps]){
  const gate=await createRemoteGateway({fleet,family:app.family,id:app.id,externalOrigin:ORIGIN});
  try{
   assert.equal((await request(gate.port,'/app')).status,401);
   const secret=JSON.parse(fs.readFileSync(gate.loginCodeFile,'utf8'));
   assert.equal(secret.family,app.family);assert.equal(secret.id,app.id);
   assert.equal(fs.statSync(gate.loginCodeFile).mode&0o077,0);
   const login=await request(gate.port,'/_preview/login',{method:'POST',origin:ORIGIN,
     headers:{'content-type':'application/x-www-form-urlencoded'},body:'code='+secret.code});
   assert.equal(login.status,303);
   const cookie=login.headers['set-cookie'][0].split(';')[0];
   const html=await request(gate.port,'/app',{cookie});
   assert.equal(html.status,200);assert.match(html.body,/<!doctype html>|<html/i);
   assert.match(html.headers['content-security-policy'],/default-src 'none'/);
   const credentials=JSON.parse(fs.readFileSync(app.privateCredentialFile,'utf8')).credentials;
   if(app.family==='document'){
    assert.equal((await request(gate.port,'/v1/workspaces',{cookie})).status,404);
    const session=await request(gate.port,'/app/api/session',{cookie,method:'POST',origin:ORIGIN,
      headers:{'content-type':'application/json'},body:JSON.stringify({credential:credentials.operator})});
    assert.equal(session.status,200);
    const userCookie=session.headers['set-cookie'][0].split(';')[0];
    assert.match(session.headers['set-cookie'][0],/Secure/);
    assert.equal((await request(gate.port,'/app/api/workspaces',{cookie:cookie+'; '+userCookie})).status,200);
    assert.equal((await request(gate.port,'/app/api/pilot',{cookie,method:'POST',origin:ORIGIN})).status,404);
   }else{
    const endpoint=app.family==='quote'?'/v1/recipe':'/v1/context';
    assert.equal((await request(gate.port,endpoint,{cookie})).status,401);
    const authed=await request(gate.port,endpoint,{cookie,headers:{Authorization:'Bearer '+credentials.operator}});
    assert.equal(authed.status,200);
   }
   assert.equal((await request(gate.port,'/health',{cookie})).status,404);
   assert.equal((await request(gate.port,'/app',{cookie,origin:'https://attacker.invalid'})).status,403);
   // Actual verified service is closed and reopened by the existing private
   // fleet recovery mechanism while this exact authenticated gateway stays alive.
   const pinnedDigest=app.digest,pinnedCredentials=fs.readFileSync(app.privateCredentialFile);
   await app.close();
   assert.equal((await request(gate.port,'/app',{cookie})).status,502);
   const healed=await watchdog.tick();
   assert.equal(healed.quarantined,0);assert.equal(healed.externalContacts,0);
   assert.ok(healed.services.some(s=>s.family===app.family&&s.id===app.id&&
      s.status==='healthy'&&s.successfulRestarts===1));
   const live=fleet.apps.find(v=>v.family===app.family&&v.id===app.id);
   assert.equal(live.digest,pinnedDigest);
   assert.deepEqual(fs.readFileSync(live.privateCredentialFile),pinnedCredentials);
   assert.equal((await request(gate.port,'/app',{cookie})).status,200);
   if(app.family==='document'){
    // Browser cookies are not reused across a process restart; the original
    // operator credential can establish a fresh app-native session.
    const relog=await request(gate.port,'/app/api/session',{cookie,method:'POST',origin:ORIGIN,
     headers:{'content-type':'application/json'},
     body:JSON.stringify({credential:credentials.operator})});
    assert.equal(relog.status,200);
   }else{
    const endpoint=app.family==='quote'?'/v1/recipe':'/v1/context';
    const authed=await request(gate.port,endpoint,
      {cookie,headers:{Authorization:'Bearer '+credentials.operator}});
    assert.equal(authed.status,200);
   }
  }finally{await gate.close();}
 }
 assert.equal(watchdog.report().verifiedRecoveries,3);
 assert.equal(watchdog.report().recoveryAttempts,3);
 assert.equal(watchdog.report().externalContacts,0);
});
