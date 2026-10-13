'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {openRuntime}=require('./runtime');const {captureRecovery,restoreRecovery}=require('./recovery');const recipes=require('../recipes.json');
function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'factory-pilot-recovery-')),state=path.join(root,'state');fs.mkdirSync(state,{mode:0o700});const file=path.join(state,'runtime.sqlite');const r=openRuntime({filename:file,recipes});t.after(()=>{r.close();fs.rmSync(root,{recursive:true,force:true});});return {r,root,state,file};}
test('first issue lazily migrates v1 preserving existing operator records',t=>{
 const x=setup(t),token=x.r.provisionTenant('operator').token;x.r.createWorkspace(token,{id:'main',recipeId:recipes[0].id});
 const db=new DatabaseSync(x.file);assert.equal(db.prepare('PRAGMA user_version').get().user_version,1);
 x.r.issuePilot({recipeId:recipes[0].id});assert.equal(db.prepare('PRAGMA user_version').get().user_version,2);assert.equal(x.r.workspaces(token).length,1);db.close();
});
test('v2 backup restores trial work but invalidates both activated and unused invitation codes',t=>{
 const x=setup(t),used=x.r.issuePilot({recipeId:recipes[0].id}),pending=x.r.issuePilot({recipeId:recipes[1].id}),active=x.r.activatePilot(used.inviteCode,true);
 x.r.command(active.credential,recipes[0].id,{type:'add',name:'Retained synthetic trial',dueOn:new Date().toISOString().slice(0,10)},'one');
 const key=Buffer.alloc(32,55),backup=captureRecovery({stateDir:x.state,backupDir:path.join(x.root,'backups'),key});
 const target=path.join(x.root,'restored');const receipt=restoreRecovery({filename:backup.filename,key,destination:target});assert.equal(receipt.credentialsInvalidated,true);
 const restored=openRuntime({filename:path.join(target,'runtime.sqlite'),recipes});
 try{assert.throws(()=>restored.activatePilot(used.inviteCode,true),/UNAUTHORIZED/);assert.throws(()=>restored.activatePilot(pending.inviteCode,true),/UNAUTHORIZED/);assert.equal(restored.pilotReport().createdRecords,1);assert.equal(restored.pilotReport().activeTrials,0);}finally{restored.close();}
});
test('malformed pilot references block publishing a recovery point',t=>{
 const x=setup(t);const active=x.r.activatePilot(x.r.issuePilot({recipeId:recipes[0].id}).inviteCode,true);
 const db=new DatabaseSync(x.file);db.prepare("UPDATE pilot_invites SET expires_ms=activated_ms-1").run();db.close();
 assert.throws(()=>captureRecovery({stateDir:x.state,backupDir:path.join(x.root,'backups'),key:Buffer.alloc(32,44)}),/RECOVERY_REFERENCE|STATE_CORRUPT/);
 assert.equal(fs.readdirSync(path.join(x.root,'backups')).filter(x=>x.endsWith('.fbr')).length,0);
});
