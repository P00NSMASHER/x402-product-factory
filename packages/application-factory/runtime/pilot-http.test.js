'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {openRuntime}=require('./runtime'),{createRuntimeServer}=require('./http');const recipes=require('../recipes.json');
const START=Date.parse('2026-10-13T12:00:00Z');
async function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-pilot-http-'));let time=START;
 const r=openRuntime({filename:path.join(dir,'runtime.sqlite'),recipes,clock:()=>time}),server=createRuntimeServer({runtime:r,automation:false});await server.listen({port:0});
 t.after(async()=>{await server.close();r.close();fs.rmSync(dir,{recursive:true,force:true});});
 const origin='http://127.0.0.1:'+server.address().port;
 const request=(url,options={})=>fetch(origin+url,options);
 const activate=(code,consent=true,extra={})=>request('/app/api/pilot',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...extra},body:JSON.stringify({inviteCode:code,consent})});
 return {r,server,origin,request,activate,setTime:n=>time=n};
}
test('local preview links to private invitation access without collecting contact or payment details',async t=>{
 const x=await setup(t),response=await x.request('/app/pilots/'+recipes[0].id);assert.equal(response.status,200);
 const body=await response.text();assert.match(body,/\/app#pilot/);assert.match(body,/synthetic/i);assert.doesNotMatch(body,/<form|https:\/\/.*checkout/i);
});
test('pilot activation exchanges invitation for an opaque browser session and a single persisted workspace',async t=>{
 const x=await setup(t),invite=x.r.issuePilot({recipeId:recipes[0].id}),response=await x.activate(invite.inviteCode);assert.equal(response.status,200);
 const body=await response.json(),cookie=response.headers.get('set-cookie').split(';')[0];assert.ok(body.csrfToken);assert.equal(JSON.stringify(body).includes(invite.inviteCode),false);assert.equal(body.credential,undefined);
 assert.match(response.headers.get('set-cookie'),/HttpOnly/);
 const work=await(await x.request('/app/api/workspaces',{headers:{Cookie:cookie}})).json();assert.equal(work.length,1);assert.equal(work[0].id,recipes[0].id);
 assert.equal((await x.activate(invite.inviteCode)).status,200);assert.equal(x.r.pilotReport().activatedTrials,1);
});
test('origin, consent and strict field checks run before provisioning',async t=>{
 const x=await setup(t),invite=x.r.issuePilot({recipeId:recipes[0].id});
 assert.equal((await x.activate(invite.inviteCode,true,{Origin:'https://other.example'})).status,403);
 assert.equal((await x.activate(invite.inviteCode,false)).status,400);
 assert.equal((await x.request('/app/api/pilot',{method:'POST',headers:{Origin:x.origin,'Content-Type':'application/json'},body:JSON.stringify({inviteCode:invite.inviteCode,consent:true,tenantId:'takeover'})})).status,400);
 assert.equal(x.r.pilotReport().activatedTrials,0);
});
test('active browser session is denied at trial expiry and cannot mutate saved state',async t=>{
 const x=await setup(t),invite=x.r.issuePilot({recipeId:recipes[0].id,durationDays:1}),resp=await x.activate(invite.inviteCode),body=await resp.json();
 assert.equal(resp.status,200);const cookie=resp.headers.get('set-cookie').split(';')[0];x.setTime(START+86400000);
 assert.equal((await x.request('/app/api/workspaces',{headers:{Cookie:cookie}})).status,401);
 assert.equal((await x.request('/app/api/workspaces/'+recipes[0].id+'/commands',{method:'POST',headers:{Cookie:cookie,Origin:x.origin,'X-CSRF-Token':body.csrfToken,'Content-Type':'application/json','Idempotency-Key':'expired'},body:JSON.stringify({command:{type:'add',name:'Late',dueOn:'2026-10-14'}})})).status,401);
 assert.equal(x.r.pilotReport().createdRecords,0);
});
test('repeated invalid trial codes are bounded by a local login attempt budget',async t=>{
 const x=await setup(t);x.r.issuePilot({recipeId:recipes[0].id});
 for(let i=0;i<20;i++)assert.equal((await x.activate('x'.repeat(43))).status,401);
 assert.equal((await x.activate('x'.repeat(43))).status,429);assert.equal(x.r.pilotReport().activatedTrials,0);
});
