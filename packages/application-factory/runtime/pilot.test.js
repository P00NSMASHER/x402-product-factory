'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openRuntime}=require('./runtime');
const recipes=require('../recipes.json');
const START=Date.parse('2026-10-13T12:00:00Z');
function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-pilot-test-'));let clock=START;
 const r=openRuntime({filename:path.join(dir,'runtime.sqlite'),recipes,clock:()=>clock});
 t.after(()=>{r.close();fs.rmSync(dir,{recursive:true,force:true});});
 assert.equal(typeof r.issuePilot,'function','private pilot invitation lifecycle must exist');
 return {r,dir,setTime:n=>clock=n};
}
test('invitation activation automatically provisions exactly one selected workflow and resumes it safely',t=>{
 const {r}=setup(t),invite=r.issuePilot({recipeId:recipes[0].id});
 assert.match(invite.inviteCode,/^[A-Za-z0-9_-]{43}$/);
 const a=r.activatePilot(invite.inviteCode,true),b=r.activatePilot(invite.inviteCode,true);
 assert.equal(a.credential,b.credential);assert.equal(r.workspaces(a.credential).length,1);
 assert.equal(r.workspaces(a.credential)[0].id,recipes[0].id);
 assert.equal(r.pilotReport().activatedTrials,1);
});
test('trial expires independently of browser and blocks both saved-data access and leased work',t=>{
 const x=setup(t),invite=x.r.issuePilot({recipeId:recipes[0].id,durationDays:1});
 const a=x.r.activatePilot(invite.inviteCode,true),claim=x.r.claimDue();assert.ok(claim);
 x.setTime(START+86400000);
 assert.throws(()=>x.r.workspaces(a.credential),/UNAUTHORIZED/);
 assert.throws(()=>x.r.activatePilot(invite.inviteCode,true),/UNAUTHORIZED/);
 assert.throws(()=>x.r.finishClaim(claim),/LEASE_LOST/);assert.equal(x.r.sweep().claimed,0);
});
test('committed real workflow operations produce idempotent synthetic-only usage evidence',t=>{
 const {r}=setup(t),invite=r.issuePilot({recipeId:recipes[2].id}),a=r.activatePilot(invite.inviteCode,true),id=recipes[2].id;
 const command={type:'add',name:'Synthetic example',dueOn:'2026-10-13'};
 r.command(a.credential,id,command,'first');r.command(a.credential,id,command,'first');
 for(const req of recipes[2].requirements)r.command(a.credential,id,{type:'receive',recordId:'r1',requirementId:req.id},req.id);
 const report=r.pilotReport();assert.equal(report.createdRecords,1);assert.equal(report.completedRecords,1);
 assert.equal(report.qualifiesAsDemandEvidence,false);assert.equal(report.realCustomers,null);assert.equal(report.collectedRevenue,null);
 assert.equal(JSON.stringify(report).includes('Synthetic example'),false);
});
test('missing consent and arbitrary invite codes never create accounts',t=>{
 const {r}=setup(t),invite=r.issuePilot({recipeId:recipes[0].id});
 assert.throws(()=>r.activatePilot(invite.inviteCode,false),/CONSENT_REQUIRED/);
 assert.throws(()=>r.activatePilot('x'.repeat(43),true),/UNAUTHORIZED/);
 assert.equal(r.pilotReport().activatedTrials,0);
});
const {DatabaseSync}=require('node:sqlite');
test('each invitation receives a different tenant even for the same recipe',t=>{
 const {r}=setup(t),a=r.activatePilot(r.issuePilot({recipeId:recipes[0].id}).inviteCode,true),b=r.activatePilot(r.issuePilot({recipeId:recipes[0].id}).inviteCode,true);
 r.command(a.credential,recipes[0].id,{type:'add',name:'Private synthetic A',dueOn:'2026-10-13'},'one');
 assert.equal(r.workspace(b.credential,recipes[0].id).records.length,0);
 assert.throws(()=>r.command(b.credential,recipes[0].id,{type:'archive',recordId:'r1'},'guess'),/RECORD_UNKNOWN/);
});
test('unknown fields, unbounded durations and missing recipes cannot issue invitations',t=>{
 const {r}=setup(t);
 for(const opts of [{recipeId:'unknown'},{recipeId:recipes[0].id,durationDays:0},{recipeId:recipes[0].id,durationDays:15},
 {recipeId:recipes[0].id,inviteDays:29},{recipeId:recipes[0].id,tenantId:'takeover'}])assert.throws(()=>r.issuePilot(opts),/PILOT_INVALID/);
 assert.equal(r.pilotReport().issuedInvitations,0);
});
test('raw invite codes and derived credentials are never persisted as plaintext',t=>{
 const {r,dir}=setup(t),invite=r.issuePilot({recipeId:recipes[0].id}),a=r.activatePilot(invite.inviteCode,true);
 const db=new DatabaseSync(path.join(dir,'runtime.sqlite'));
 const all=JSON.stringify({invites:db.prepare('SELECT * FROM pilot_invites').all(),events:db.prepare('SELECT * FROM pilot_events').all(),tenants:db.prepare('SELECT * FROM tenants').all()});db.close();
 assert.equal(all.includes(invite.inviteCode),false);assert.equal(all.includes(a.credential),false);
});
test('pending invite expires without creating a tenant and cannot extend its own deadline',t=>{
 const x=setup(t),i=x.r.issuePilot({recipeId:recipes[0].id,inviteDays:1});x.setTime(START+86400000);
 assert.throws(()=>x.r.activatePilot(i.inviteCode,true),/UNAUTHORIZED/);assert.equal(x.r.pilotReport().activatedTrials,0);
});
test('revocation denies resumed login and existing credentials immediately',t=>{
 const {r}=setup(t),i=r.issuePilot({recipeId:recipes[0].id}),a=r.activatePilot(i.inviteCode,true);
 r.revokePilot(i.inviteId);assert.throws(()=>r.workspaces(a.credential),/UNAUTHORIZED/);
 assert.throws(()=>r.activatePilot(i.inviteCode,true),/UNAUTHORIZED/);
});
test('operator credential rotation cannot be undone by replaying the original invitation',t=>{
 const {r}=setup(t),i=r.issuePilot({recipeId:recipes[0].id}),a=r.activatePilot(i.inviteCode,true);
 r.rotateCredential(r.tenantId(a.credential));assert.throws(()=>r.activatePilot(i.inviteCode,true),/UNAUTHORIZED/);
});
test('active trials resume unchanged across real database close and reopen',t=>{
 const x=setup(t),i=x.r.issuePilot({recipeId:recipes[0].id}),a=x.r.activatePilot(i.inviteCode,true);
 x.r.command(a.credential,recipes[0].id,{type:'add',name:'Persisted evaluation',dueOn:'2026-10-13'},'one');x.r.close();
 const again=openRuntime({filename:path.join(x.dir,'runtime.sqlite'),recipes,clock:()=>START});
 try{const b=again.activatePilot(i.inviteCode,true);assert.equal(b.credential,a.credential);assert.equal(again.workspace(b.credential,recipes[0].id).records.length,1);assert.equal(again.pilotReport().activatedTrials,1);}finally{again.close();}
});
test('activation rolls back tenant, workspace, invite claim and events if any insert fails',t=>{
 const x=setup(t),i=x.r.issuePilot({recipeId:recipes[0].id});
 const db=new DatabaseSync(path.join(x.dir,'runtime.sqlite'));
 db.exec("CREATE TRIGGER synthetic_failure BEFORE INSERT ON workspaces BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;");
 assert.throws(()=>x.r.activatePilot(i.inviteCode,true));assert.equal(db.prepare('SELECT count(*) AS n FROM tenants').get().n,0);assert.equal(x.r.pilotReport().activatedTrials,0);
 db.exec('DROP TRIGGER synthetic_failure');db.close();assert.ok(x.r.activatePilot(i.inviteCode,true));
});
test('usage counts meaningful active days and first complete outcome, not failed writes or retries',t=>{
 const x=setup(t),r=x.r,a=r.activatePilot(r.issuePilot({recipeId:recipes[2].id}).inviteCode,true),id=recipes[2].id;
 r.command(a.credential,id,{type:'add',name:'Test',dueOn:'2026-10-13'},'add');
 assert.throws(()=>r.command(a.credential,id,{type:'receive',recordId:'r1',requirementId:'unknown'},'bad'));
 x.setTime(START+86400000);
 for(const req of recipes[2].requirements)r.command(a.credential,id,{type:'receive',recordId:'r1',requirementId:req.id},req.id);
 r.command(a.credential,id,{type:'receive',recordId:'r1',requirementId:recipes[2].requirements[0].id},'update');
 const p=r.pilotStatus(a.credential,id);assert.equal(p.activeDays,2);assert.equal(p.receivedDocuments,3);assert.equal(p.completedRecords,1);assert.equal(p.firstOutcomeMs,86400000);
});
test('expired trial fences a still-live lease and leaves operator work unaffected',t=>{
 const x=setup(t),a=x.r.activatePilot(x.r.issuePilot({recipeId:recipes[0].id,durationDays:1}).inviteCode,true);
 const operator=x.r.provisionTenant('normal-operator').token;x.r.createWorkspace(operator,{id:'normal',recipeId:recipes[0].id});
 x.r.command(a.credential,recipes[0].id,{type:'add',name:'Test',dueOn:'2026-10-13'},'add');
 // Drain other jobs, then take a due trial lease less than 30 seconds before expiry.
 x.r.sweep();x.setTime(START+86400000-1000);let claim;for(let n=0;n<2;n++){const c=x.r.claimDue();if(c.tenantId===x.r.tenantId(a.credential)){claim=c;break;}x.r.finishClaim(c);}assert.ok(claim);
 x.setTime(START+86400000+1);assert.throws(()=>x.r.finishClaim(claim),/LEASE_LOST/);
 assert.equal(x.r.workspaces(operator).length,1);assert.equal(x.r.pilotStatus(operator,'normal'),null);
});
test('issued invitation count is bounded before creating more state',t=>{
 const {r}=setup(t);for(let n=0;n<100;n++)r.issuePilot({recipeId:recipes[n%recipes.length].id});
 assert.throws(()=>r.issuePilot({recipeId:recipes[0].id}),/PILOT_CAPACITY/);assert.equal(r.pilotReport().issuedInvitations,100);
});
test('a pilot cannot provision extra workspaces or switch its assigned recipe',t=>{
 const {r}=setup(t),a=r.activatePilot(r.issuePilot({recipeId:recipes[0].id}).inviteCode,true);
 assert.throws(()=>r.createWorkspace(a.credential,{id:'other',recipeId:recipes[1].id}),/WORKSPACE_INVALID/);
 assert.equal(r.workspaces(a.credential).length,1);
});
