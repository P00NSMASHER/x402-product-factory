'use strict';
// Invitation-only synthetic evaluation. This is not customer/signup/payment evidence.
const crypto=require('node:crypto');
const Kernel=require('../kernel');
const DAY=86400000,MAX_INVITES=100;
const COLUMNS=Object.freeze({
 pilot_invites:'id,code_hash,recipe,issued_ms,activate_by,duration_ms,active,tenant_id,activated_ms,expires_ms',
 pilot_events:'tenant_id,kind,reference,occurred_ms'
});
const fail=code=>{throw new Error(code);};
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const opaque=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{43}$/.test(x);
const credential=code=>crypto.createHmac('sha256',code).update('factory-private-pilot-credential-v1').digest('base64url');
function version(db){return db.prepare('PRAGMA user_version').get().user_version;}
function validatePilotSchema(db){
 if(version(db)!==2)return;
 for(const [name,columns]of Object.entries(COLUMNS)){
  if(db.prepare(`PRAGMA table_info(${name})`).all().map(c=>c.name).join(',')!==columns)fail('SCHEMA_UNSUPPORTED');
 }
}
function ensureSchema(db){
 if(version(db)===2){validatePilotSchema(db);return;}
 if(version(db)!==1)fail('SCHEMA_UNSUPPORTED');
 db.exec(`CREATE TABLE pilot_invites(
  id TEXT PRIMARY KEY,code_hash TEXT NOT NULL UNIQUE,recipe TEXT NOT NULL,
  issued_ms INTEGER NOT NULL,activate_by INTEGER NOT NULL,duration_ms INTEGER NOT NULL,
  active INTEGER NOT NULL CHECK(active IN(0,1)),tenant_id TEXT UNIQUE REFERENCES tenants(id),
  activated_ms INTEGER,expires_ms INTEGER) STRICT;
 CREATE TABLE pilot_events(tenant_id TEXT NOT NULL REFERENCES tenants(id),kind TEXT NOT NULL,
  reference TEXT NOT NULL,occurred_ms INTEGER NOT NULL,PRIMARY KEY(tenant_id,kind,reference)) STRICT;
 PRAGMA user_version=2;`);
}
function createPilots({db,catalog,transaction,now}){
 validatePilotSchema(db);
 function lookupTenant(tenant){return version(db)===2?db.prepare('SELECT * FROM pilot_invites WHERE tenant_id=?').get(tenant):null;}
 function allowTenant(tenant,time){const row=lookupTenant(tenant);return !row||(row.active===1&&time>=row.activated_ms&&time<row.expires_ms);}
 function record(tenant,kind,reference,time){
  db.prepare('INSERT INTO pilot_events VALUES(?,?,?,?) ON CONFLICT DO NOTHING').run(tenant,kind,reference,time);
 }
 function observed(row){
  if(!row.tenant_id)return null;
  const counts=Object.fromEntries(db.prepare('SELECT kind,count(*) AS n FROM pilot_events WHERE tenant_id=? GROUP BY kind').all(row.tenant_id).map(r=>[r.kind,r.n]));
  const first=db.prepare("SELECT min(occurred_ms) AS t FROM pilot_events WHERE tenant_id=? AND kind='checklist_completed'").get(row.tenant_id).t;
  return {recipeId:JSON.parse(row.recipe).id,startedAt:row.activated_ms,expiresAt:row.expires_ms,
   activeDays:counts.active_day||0,createdRecords:counts.intake_created||0,receivedDocuments:counts.document_received||0,
   completedRecords:counts.checklist_completed||0,firstOutcomeMs:first===null?null:first-row.activated_ms,
   mode:'synthetic-evaluation-only',qualifiesAsDemandEvidence:false,realCustomers:null,collectedRevenue:null};
 }
 return Object.freeze({
  allowTenant,
  allowWorkspace(tenant,id,recipeId){const row=lookupTenant(tenant);return !row||(id===JSON.parse(row.recipe).id&&recipeId===id);},
  issue(input){
   if(!input||typeof input!=='object'||Array.isArray(input)||!Object.hasOwn(input,'recipeId')||
     Object.keys(input).some(k=>!['recipeId','durationDays','inviteDays'].includes(k))||!catalog.has(input.recipeId))fail('PILOT_INVALID');
   const {durationDays=7,inviteDays=7}=input;
   if(!Number.isSafeInteger(durationDays)||durationDays<1||durationDays>14||!Number.isSafeInteger(inviteDays)||inviteDays<1||inviteDays>28)fail('PILOT_INVALID');
   return transaction(()=>{
    ensureSchema(db);
    if(db.prepare('SELECT count(*) AS n FROM pilot_invites').get().n>=MAX_INVITES)fail('PILOT_CAPACITY');
    const time=now(),code=crypto.randomBytes(32).toString('base64url'),id=crypto.randomBytes(16).toString('hex');
    const activateBy=time+inviteDays*DAY;
    db.prepare('INSERT INTO pilot_invites VALUES(?,?,?,?,?,?,1,NULL,NULL,NULL)').run(id,hash(code),JSON.stringify(catalog.get(input.recipeId)),time,activateBy,durationDays*DAY);
    return {inviteId:id,inviteCode:code,recipeId:input.recipeId,activateBy,durationDays,mode:'synthetic-evaluation-only'};
   });
  },
  activate(code,consent){
   if(consent!==true)fail('CONSENT_REQUIRED');
   if(!opaque(code)||version(db)!==2)fail('UNAUTHORIZED');
   return transaction(()=>{
    const time=now(),row=db.prepare('SELECT * FROM pilot_invites WHERE code_hash=?').get(hash(code));
    if(!row||row.active!==1||time<row.issued_ms)fail('UNAUTHORIZED');
    const token=credential(code);
    if(row.tenant_id){
     const tenant=db.prepare('SELECT * FROM tenants WHERE id=?').get(row.tenant_id);
     if(!tenant||tenant.active!==1||tenant.token_hash!==hash(token)||!allowTenant(tenant.id,time))fail('UNAUTHORIZED');
     return {credential:token,recipeId:JSON.parse(row.recipe).id,expiresAt:row.expires_ms};
    }
    if(time>=row.activate_by)fail('UNAUTHORIZED');
    if(db.prepare('SELECT count(*) AS n FROM tenants').get().n>=1000||db.prepare('SELECT count(*) AS n FROM workspaces').get().n>=1000)fail('PILOT_CAPACITY');
    const recipe=Kernel.validateRecipe(JSON.parse(row.recipe));
    if(!catalog.has(recipe.id)||JSON.stringify(catalog.get(recipe.id))!==JSON.stringify(recipe))fail('PILOT_RECIPE_CHANGED');
    const tenant='pilot-'+row.id,expiresAt=time+row.duration_ms;
    const ws=Kernel.createWorkspace(recipe,{workspaceId:recipe.id,today:new Date(time).toISOString().slice(0,10)});
    db.prepare('INSERT INTO tenants VALUES(?,?,1)').run(tenant,hash(token));
    db.prepare('INSERT INTO workspaces(tenant_id,id,recipe,snapshot,next_run,observed_ms) VALUES(?,?,?,?,?,?)')
     .run(tenant,recipe.id,JSON.stringify(recipe),JSON.stringify(ws.snapshot()),time,time);
    db.prepare('UPDATE pilot_invites SET tenant_id=?,activated_ms=?,expires_ms=? WHERE id=?').run(tenant,time,expiresAt,row.id);
    record(tenant,'activated','trial',time);
    return {credential:token,recipeId:recipe.id,expiresAt};
   });
  },
  revoke(id){
   if(typeof id!=='string'||!/^[0-9a-f]{32}$/.test(id))fail('PILOT_INVALID');
   return transaction(()=>{
    if(version(db)!==2)fail('NOT_FOUND');const row=db.prepare('SELECT * FROM pilot_invites WHERE id=?').get(id);if(!row)fail('NOT_FOUND');
    db.prepare('UPDATE pilot_invites SET active=0 WHERE id=?').run(id);
    if(row.tenant_id){db.prepare('UPDATE tenants SET active=0 WHERE id=?').run(row.tenant_id);db.prepare('UPDATE workspaces SET lease_token=NULL,lease_until=NULL WHERE tenant_id=?').run(row.tenant_id);}
    return {revoked:true};
   });
  },
  // Called inside the existing worker write transaction. Expiration does not delete work.
  expire(time){
   if(version(db)!==2)return;
   db.prepare('UPDATE tenants SET active=0 WHERE id IN (SELECT tenant_id FROM pilot_invites WHERE active=0 OR expires_ms<=?)').run(time);
   db.prepare('UPDATE workspaces SET lease_token=NULL,lease_until=NULL WHERE tenant_id IN (SELECT tenant_id FROM pilot_invites WHERE active=0 OR expires_ms<=?)').run(time);
   db.prepare('UPDATE pilot_invites SET active=0 WHERE expires_ms<=?').run(time);
  },
  // Called in the same transaction as a newly committed workflow command, not on retries.
  observe(tenant,command,ws,time){
   if(!lookupTenant(tenant)||!['add','receive','archive'].includes(command.type))return;
   record(tenant,'active_day',new Date(time).toISOString().slice(0,10),time);
   if(command.type==='add')record(tenant,'intake_created',ws.list().at(-1).id,time);
   if(command.type==='receive'){
    record(tenant,'document_received',command.recordId+':'+command.requirementId,time);
    if(ws.list().find(r=>r.id===command.recordId)?.status==='complete')record(tenant,'checklist_completed',command.recordId,time);
   }
  },
  status(tenant,id){const row=lookupTenant(tenant);return row&&JSON.parse(row.recipe).id===id?observed(row):null;},
  report(){
   const rows=version(db)===2?db.prepare('SELECT * FROM pilot_invites ORDER BY id').all():[],time=now();
   const trials=rows.filter(r=>r.tenant_id).map(observed);
   return {kind:'private-evaluation-observations',issuedInvitations:rows.length,activatedTrials:trials.length,
    activeTrials:rows.filter(r=>r.tenant_id&&allowTenant(r.tenant_id,time)&&db.prepare('SELECT active FROM tenants WHERE id=?').get(r.tenant_id)?.active===1).length,
    createdRecords:trials.reduce((n,r)=>n+r.createdRecords,0),completedRecords:trials.reduce((n,r)=>n+r.completedRecords,0),
    trials,mode:'synthetic-evaluation-only',qualifiesAsDemandEvidence:false,realCustomers:null,collectedRevenue:null,
    externalMessagesSent:0,paymentsSent:0,releaseApproved:false};
  }
 });
}
module.exports={createPilots,validatePilotSchema,COLUMNS};
