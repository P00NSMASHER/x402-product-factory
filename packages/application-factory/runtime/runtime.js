"use strict";
// Local, single-host durable runtime. No payment or external messaging transport.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const Kernel = require('../kernel');
const DEFAULTS = Object.freeze({ intervalMs:60000, leaseMs:30000, batchSize:25, maxAttempts:3 });
const fail = code => { throw new Error(code); };
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const isId = value => typeof value === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value) && value.length <= 60;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function fields(value, required, optional=[]) {
  return plain(value) && required.every(k=>Object.hasOwn(value,k)) && Object.keys(value).every(k=>required.includes(k)||optional.includes(k));
}
function timestamp(value) {
  if(!Number.isSafeInteger(value) || value<946684800000 || value>4133980799999)fail('CLOCK_INVALID');
  return value;
}
const dayAt = ms => new Date(ms).toISOString().slice(0,10);
const SAFE_FAILURES = new Set(['SNAPSHOT_INVALID','RECIPE_INVALID','CLOCK_INVALID','HISTORY_LIMIT','RECORD_LIMIT']);
function errorCode(error) { return SAFE_FAILURES.has(error?.message) ? error.message : 'AUTOMATION_FAILED'; }
function checkCommand(command) {
  if(!plain(command))fail('COMMAND_INVALID');
  const shape = {
    add:[['type','name','dueOn'],[]], receive:[['type','recordId','requirementId'],['expiresOn']],
    archive:[['type','recordId'],[]], automation:[['type','enabled'],[]]
  };
  if(!Object.hasOwn(shape,command.type)||!fields(command,...shape[command.type]))fail('COMMAND_INVALID');
  if(command.type==='automation' && typeof command.enabled!=='boolean')fail('COMMAND_INVALID');
  // Canonicalize field order for retries; never interpret arbitrary commands.
  return Object.fromEntries(Object.keys(command).sort().map(k=>[k,command[k]]));
}
function openRuntime({filename,recipes,clock=Date.now}={}) {
  if(typeof filename!=='string'||!path.isAbsolute(filename)||typeof clock!=='function')fail('CONFIG_INVALID');
  if(!Array.isArray(recipes)||recipes.length<1||recipes.length>100)fail('CONFIG_INVALID');
  const catalog=new Map();
  for(const recipe of recipes){const r=Kernel.validateRecipe(recipe);if(catalog.has(r.id))fail('RECIPE_INVALID');catalog.set(r.id,r);}
  const parent=path.dirname(filename);fs.mkdirSync(parent,{recursive:true,mode:0o700});
  const parentStat=fs.statSync(parent);
  if(process.platform!=='win32'&&((parentStat.mode&0o077)!==0||(typeof process.getuid==='function'&&parentStat.uid!==process.getuid())))fail('STATE_PATH_UNSAFE');
  const real=fs.realpathSync(parent), normalized=path.resolve(parent);
  if((process.platform==='win32'?real.toLowerCase():real)!==(process.platform==='win32'?normalized.toLowerCase():normalized))fail('STATE_PATH_UNSAFE');
  if(fs.existsSync(filename)) { const stat=fs.lstatSync(filename);if(!stat.isFile()||stat.isSymbolicLink())fail('STATE_PATH_UNSAFE'); }
  else { const fd=fs.openSync(filename,'wx',0o600);fs.closeSync(fd); }
  if(process.platform!=='win32')fs.chmodSync(filename,0o600);
  const db=new DatabaseSync(filename);let closed=false;
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    const version=db.prepare('PRAGMA user_version').get().user_version;
    const applicationId=db.prepare('PRAGMA application_id').get().application_id;
    if((version!==0&&version!==1)||(version===1&&applicationId!==1178682196)||(version===0&&applicationId!==0))fail('SCHEMA_UNSUPPORTED');
    if(version===0) {
      if(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().n)fail('SCHEMA_UNSUPPORTED');
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE tenants(id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, active INTEGER NOT NULL CHECK(active IN(0,1))) STRICT;
        CREATE TABLE workspaces(
          tenant_id TEXT NOT NULL REFERENCES tenants(id), id TEXT NOT NULL, recipe TEXT NOT NULL, snapshot TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),
          next_run INTEGER NOT NULL, observed_ms INTEGER NOT NULL, failures INTEGER NOT NULL DEFAULT 0,
          last_error TEXT, last_success INTEGER, lease_token TEXT, lease_until INTEGER,
          PRIMARY KEY(tenant_id,id)) STRICT;
        CREATE INDEX work_due ON workspaces(enabled,next_run,lease_until);
        CREATE TABLE inbox(tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL, message_id TEXT NOT NULL,
          payload TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('open','cancelled')), created_ms INTEGER NOT NULL,
          PRIMARY KEY(tenant_id,workspace_id,message_id), FOREIGN KEY(tenant_id,workspace_id) REFERENCES workspaces(tenant_id,id)) STRICT;
        CREATE TABLE receipts(tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL, request_key TEXT NOT NULL,
          command_hash TEXT NOT NULL, result TEXT NOT NULL,
          PRIMARY KEY(tenant_id,workspace_id,request_key), FOREIGN KEY(tenant_id,workspace_id) REFERENCES workspaces(tenant_id,id)) STRICT;
        PRAGMA application_id=1178682196; PRAGMA user_version=1; COMMIT;`);
    }
    if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')fail('STATE_CORRUPT');
  } catch(error) { db.close();throw error; }
  function transaction(fn) {
    if(closed)fail('RUNTIME_CLOSED');db.exec('BEGIN IMMEDIATE');
    try { const result=fn();db.exec('COMMIT');return result; }
    catch(error){db.exec('ROLLBACK');throw error;}
  }
  const now = () => timestamp(clock());
  function authenticate(token) {
    if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))fail('UNAUTHORIZED');
    const tenant=db.prepare('SELECT id FROM tenants WHERE token_hash=? AND active=1').get(hash(token));
    if(!tenant)fail('UNAUTHORIZED');return tenant.id;
  }
  function rowFor(tenantId,id) {
    if(!isId(id))fail('NOT_FOUND');
    const row=db.prepare('SELECT * FROM workspaces WHERE tenant_id=? AND id=?').get(tenantId,id);
    if(!row)fail('NOT_FOUND');return row;
  }
  function load(row) {
    try { return Kernel.createWorkspace(JSON.parse(row.recipe),{workspaceId:row.id,today:dayAt(row.observed_ms),snapshot:JSON.parse(row.snapshot)}); }
    catch(error){if(SAFE_FAILURES.has(error.message))throw error;fail('SNAPSHOT_INVALID');}
  }
  function advance(row,ws,time) { if(time<row.observed_ms)fail('CLOCK_INVALID');ws.advanceDay(dayAt(time)); }
  function status(row) {
    return {id:row.id,version:row.version,enabled:row.enabled===1,quarantined:row.failures>=DEFAULTS.maxAttempts,
      failures:row.failures,lastError:row.last_error,nextRunAt:row.next_run,lastSuccessAt:row.last_success};
  }
  function syncInbox(row,snapshot,time) {
    let inserted=0;
    for(const msg of snapshot.outbox) {
      if(msg.status==='cancelled')db.prepare("UPDATE inbox SET status='cancelled' WHERE tenant_id=? AND workspace_id=? AND message_id=?").run(row.tenant_id,row.id,msg.id);
      else inserted+=Number(db.prepare("INSERT INTO inbox VALUES(?,?,?,?, 'open',?) ON CONFLICT DO NOTHING")
        .run(row.tenant_id,row.id,msg.id,JSON.stringify({recordId:msg.recordId,recordName:msg.recordName,kind:msg.kind,day:msg.day,revision:msg.revision}),time).changes);
    }
    return inserted;
  }
  function leased(claim,time) {
    if(!fields(claim,['tenantId','workspaceId','leaseToken']))fail('LEASE_LOST');
    const row=rowFor(claim.tenantId,claim.workspaceId);
    const active=db.prepare('SELECT active FROM tenants WHERE id=?').get(claim.tenantId)?.active;
    if(!active||!row.enabled||row.lease_token!==claim.leaseToken||!row.lease_until||row.lease_until<=time)fail('LEASE_LOST');return row;
  }
  const runtime={
    close(){if(!closed){db.close();closed=true;}},
    recipeCatalog(){return [...catalog.values()].map(clone);},
    provisionTenant(id){
      if(!isId(id))fail('TENANT_INVALID');const token=crypto.randomBytes(32).toString('base64url');
      transaction(()=>{if(db.prepare('SELECT 1 FROM tenants WHERE id=?').get(id))fail('TENANT_EXISTS');
        if(db.prepare('SELECT count(*) AS n FROM tenants').get().n>=1000)fail('CAPACITY_LIMIT');
        db.prepare('INSERT INTO tenants VALUES(?,?,1)').run(id,hash(token));});return {tenantId:id,token};
    },
    rotateCredential(id){
      const token=crypto.randomBytes(32).toString('base64url');
      transaction(()=>{if(!db.prepare('UPDATE tenants SET token_hash=? WHERE id=? AND active=1').run(hash(token),id).changes)fail('NOT_FOUND');});return {tenantId:id,token};
    },
    revokeTenant(id){transaction(()=>{
      if(!db.prepare('UPDATE tenants SET active=0 WHERE id=?').run(id).changes)fail('NOT_FOUND');
      db.prepare('UPDATE workspaces SET lease_token=NULL,lease_until=NULL WHERE tenant_id=?').run(id);
    });},
    createWorkspace(token,input){
      const tenant=authenticate(token);
      if(!fields(input,['id','recipeId'])||!isId(input.id)||!catalog.has(input.recipeId))fail('WORKSPACE_INVALID');
      return transaction(()=>{
        authenticate(token); // Recheck after acquiring the write lock.
        const time=now(),recipe=catalog.get(input.recipeId), prior=db.prepare('SELECT * FROM workspaces WHERE tenant_id=? AND id=?').get(tenant,input.id);
        if(prior){if(prior.recipe!==JSON.stringify(recipe))fail('WORKSPACE_CONFLICT');return status(prior);}
        if(db.prepare('SELECT count(*) AS n FROM workspaces').get().n>=1000)fail('CAPACITY_LIMIT');
        const ws=Kernel.createWorkspace(recipe,{workspaceId:input.id,today:dayAt(time)});
        db.prepare('INSERT INTO workspaces(tenant_id,id,recipe,snapshot,next_run,observed_ms) VALUES(?,?,?,?,?,?)')
          .run(tenant,input.id,JSON.stringify(recipe),JSON.stringify(ws.snapshot()),time,time);
        return status(rowFor(tenant,input.id));
      });
    },
    workspaces(token){const tenant=authenticate(token);return db.prepare('SELECT * FROM workspaces WHERE tenant_id=? ORDER BY id').all(tenant).map(status);},
    workspace(token,id){const row=rowFor(authenticate(token),id),ws=load(row);return {...status(row),recipe:JSON.parse(row.recipe),snapshot:ws.snapshot(),records:ws.list()};},
    inbox(token,id){const tenant=authenticate(token);rowFor(tenant,id);return db.prepare('SELECT message_id,payload,status,created_ms FROM inbox WHERE tenant_id=? AND workspace_id=? ORDER BY created_ms,message_id').all(tenant,id)
      .map(row=>({id:row.message_id,...JSON.parse(row.payload),status:row.status,createdAt:row.created_ms,channel:'internal-inbox'}));},
    command(token,id,raw,key,expectedVersion){
      const tenant=authenticate(token),command=checkCommand(raw);
      if(typeof key!=='string'||!/^[A-Za-z0-9._-]{1,80}$/.test(key))fail('IDEMPOTENCY_KEY_INVALID');
      if(expectedVersion!==undefined&&(!Number.isSafeInteger(expectedVersion)||expectedVersion<0))fail('VERSION_INVALID');
      const fingerprint=hash(JSON.stringify(command));
      return transaction(()=>{
        authenticate(token);
        const row=rowFor(tenant,id),receipt=db.prepare('SELECT * FROM receipts WHERE tenant_id=? AND workspace_id=? AND request_key=?').get(tenant,id,key);
        if(receipt){if(receipt.command_hash!==fingerprint)fail('IDEMPOTENCY_CONFLICT');return JSON.parse(receipt.result);}
        if(expectedVersion!==undefined&&expectedVersion!==row.version)fail('VERSION_CONFLICT');
        if(db.prepare('SELECT count(*) AS n FROM receipts WHERE tenant_id=? AND workspace_id=?').get(tenant,id).n>=1000)fail('CAPACITY_LIMIT');
        const time=now(),ws=load(row);advance(row,ws,time);let result;
        if(command.type==='add')result=ws.addRecord({name:command.name,dueOn:command.dueOn});
        else if(command.type==='receive')result=ws.receive(command.recordId,command.requirementId,Object.hasOwn(command,'expiresOn')?{expiresOn:command.expiresOn}:{});
        else if(command.type==='archive')result=ws.archive(command.recordId);
        else result={enabled:command.enabled};
        const snapshot=ws.snapshot();syncInbox(row,snapshot,time);
        db.prepare('UPDATE workspaces SET snapshot=?,version=version+1,observed_ms=?,next_run=? WHERE tenant_id=? AND id=?')
          .run(JSON.stringify(snapshot),time,Math.min(time,row.next_run),tenant,id);
        if(command.type==='automation')db.prepare('UPDATE workspaces SET enabled=?,failures=0,last_error=NULL,lease_token=NULL,lease_until=NULL,next_run=? WHERE tenant_id=? AND id=?')
          .run(command.enabled?1:0,time,tenant,id);
        const answer={version:row.version+1,result};
        db.prepare('INSERT INTO receipts VALUES(?,?,?,?,?)').run(tenant,id,key,fingerprint,JSON.stringify(answer));return answer;
      });
    },
    claimDue(){return transaction(()=>{
      const time=now(),row=db.prepare(`SELECT w.* FROM workspaces w JOIN tenants t ON t.id=w.tenant_id
        WHERE t.active=1 AND w.enabled=1 AND w.failures<? AND w.next_run<=? AND (w.lease_until IS NULL OR w.lease_until<=?)
        ORDER BY w.next_run,w.tenant_id,w.id LIMIT 1`).get(DEFAULTS.maxAttempts,time,time);
      if(!row)return null;const leaseToken=crypto.randomBytes(24).toString('hex');
      db.prepare('UPDATE workspaces SET lease_token=?,lease_until=? WHERE tenant_id=? AND id=?').run(leaseToken,time+DEFAULTS.leaseMs,row.tenant_id,row.id);
      return {tenantId:row.tenant_id,workspaceId:row.id,leaseToken};
    });},
    finishClaim(claim){return transaction(()=>{
      const time=now(),row=leased(claim,time),ws=load(row);advance(row,ws,time);ws.runAutomation();
      const snapshot=ws.snapshot();const notifications=syncInbox(row,snapshot,time);
      if(now()>=row.lease_until)fail('LEASE_LOST');
      db.prepare('UPDATE workspaces SET snapshot=?,version=version+1,observed_ms=?,next_run=?,last_success=?,failures=0,last_error=NULL,lease_token=NULL,lease_until=NULL WHERE tenant_id=? AND id=?')
        .run(JSON.stringify(snapshot),time,time+DEFAULTS.intervalMs,time,row.tenant_id,row.id);return {notifications};
    });},
    failClaim(claim,error){return transaction(()=>{
      const time=now(),row=leased(claim,time),failures=row.failures+1,backoff=60000*2**Math.min(failures-1,8);
      db.prepare('UPDATE workspaces SET failures=?,last_error=?,next_run=?,lease_token=NULL,lease_until=NULL WHERE tenant_id=? AND id=?')
        .run(failures,errorCode(error),time+backoff,row.tenant_id,row.id);return {failures,quarantined:failures>=DEFAULTS.maxAttempts};
    });},
    sweep({limit=DEFAULTS.batchSize}={}){
      if(!Number.isSafeInteger(limit)||limit<1||limit>100)fail('BATCH_INVALID');
      const report={claimed:0,completed:0,failed:0,notifications:0,leaseLost:0};
      for(let i=0;i<limit;i++){
        const claim=runtime.claimDue();if(!claim)break;report.claimed++;
        try{report.notifications+=runtime.finishClaim(claim).notifications;report.completed++;}
        catch(error){try{runtime.failClaim(claim,error);report.failed++;}catch(next){if(next.message!=='LEASE_LOST')throw next;report.leaseLost++;}}
      }
      return report;
    }
  };
  return Object.freeze(runtime);
}
module.exports={openRuntime,DEFAULTS,errorCode};
