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
