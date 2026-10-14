'use strict';
// Local isolated SQLite state, opaque independent operator/reviewer credentials; no external purchasing.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite'),Kernel=require('./engine');
const fail=c=>{throw Error(c);},clone=v=>JSON.parse(JSON.stringify(v));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const keyRe=/^[a-zA-Z0-9_-]{1,100}$/;
const nameRe=/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
function privatePath(file){
 if(typeof file!=='string'||!path.isAbsolute(file))fail('STATE_PATH_UNSAFE');
 const dir=path.dirname(path.resolve(file));fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const stat=fs.lstatSync(dir),resolved=fs.realpathSync(dir);
 if(!stat.isDirectory()||stat.isSymbolicLink()||
    (process.platform==='win32'?resolved.toLowerCase():resolved)!==
    (process.platform==='win32'?dir.toLowerCase():dir)||
    (process.platform!=='win32'&&(stat.mode&0o077)!==0))fail('STATE_PATH_UNSAFE');
 if(fs.existsSync(file)){const s=fs.lstatSync(file);
  if(!s.isFile()||s.isSymbolicLink()||(process.platform!=='win32'&&(s.mode&0o077)!==0))fail('STATE_PATH_UNSAFE');
 }else{const fd=fs.openSync(file,'wx',0o600);fs.closeSync(fd);}
}
function openStore({filename,recipe:input,clock=Date.now}={}){
 const recipe=Kernel.validateRecipe(input);if(typeof clock!=='function')fail('CONFIG_INVALID');
 privatePath(filename);const db=new DatabaseSync(filename);let closed=false;
 const today=()=>{const x=clock();if(!Number.isSafeInteger(x)||x<946684800000||x>4133980799999)fail('CLOCK_INVALID');return new Date(x).toISOString().slice(0,10);};
 const tx=fn=>{if(closed)fail('STORE_CLOSED');db.exec('BEGIN IMMEDIATE');
   try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
 try{
  db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  const version=db.prepare('PRAGMA user_version').get().user_version,appId=db.prepare('PRAGMA application_id').get().application_id;
  if(![0,1].includes(version)||(version===1&&appId!==1195972672)||(version===0&&appId!==0))fail('SCHEMA_UNSUPPORTED');
  if(version===0){
   if(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().n)fail('SCHEMA_UNSUPPORTED');
   db.exec('BEGIN IMMEDIATE;'+
    'CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT;'+
    'CREATE TABLE tenants(id TEXT PRIMARY KEY,operator_hash TEXT NOT NULL UNIQUE,reviewer_hash TEXT NOT NULL UNIQUE) STRICT;'+
    'CREATE TABLE items(tenant_id TEXT NOT NULL REFERENCES tenants(id),sku TEXT NOT NULL,state TEXT NOT NULL,PRIMARY KEY(tenant_id,sku)) STRICT;'+
    'CREATE TABLE receipts(tenant_id TEXT NOT NULL REFERENCES tenants(id),request_key TEXT NOT NULL,command_hash TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(tenant_id,request_key)) STRICT;'+
    'PRAGMA application_id=1195972672; PRAGMA user_version=1; COMMIT;');
   db.prepare("INSERT INTO metadata VALUES('recipe',?)").run(JSON.stringify(recipe));
  }else{
   const stored=db.prepare("SELECT value FROM metadata WHERE key='recipe'").get();
   if(!stored||stored.value!==JSON.stringify(recipe))fail('RECIPE_MISMATCH');
  }
 }catch(error){db.close();throw error;}
 function identity(token){
  if(closed)fail('STORE_CLOSED');
  if(typeof token!=='string'||!/^[a-zA-Z0-9_-]{43}$/.test(token))fail('UNAUTHORIZED');
  const h=hash(token),operator=db.prepare('SELECT id FROM tenants WHERE operator_hash=?').get(h);
  if(operator)return {tenantId:operator.id,role:'operator'};
  const reviewer=db.prepare('SELECT id FROM tenants WHERE reviewer_hash=?').get(h);
  if(reviewer)return {tenantId:reviewer.id,role:'reviewer'};
  fail('UNAUTHORIZED');
 }
 function row(tenantId,sku){
  const item=db.prepare('SELECT state FROM items WHERE tenant_id=? AND sku=?').get(tenantId,sku);
  if(!item)fail('ITEM_UNKNOWN');
  let state;try{state=JSON.parse(item.state);}catch{fail('STATE_INVALID');}
  Kernel.projectItem(recipe,state,today());return state;
 }
 function context(token){
  const user=identity(token),date=today();
  const items=db.prepare('SELECT sku,state FROM items WHERE tenant_id=? ORDER BY sku').all(user.tenantId)
   .map(r=>{let state;try{state=JSON.parse(r.state);}catch{fail('STATE_INVALID');}
     return Kernel.projectItem(recipe,state,date);});
  return {tenantId:user.tenantId,role:user.role,recipe:clone(recipe),date,items,
    paymentEnabled:false,purchaseEnabled:false,realCustomers:null,collectedRevenue:null,releaseApproved:false};
 }
 function provision(tenantId){
  if(typeof tenantId!=='string'||!nameRe.test(tenantId)||tenantId.length>60)fail('TENANT_INVALID');
  const operatorKey=crypto.randomBytes(32).toString('base64url'),reviewerKey=crypto.randomBytes(32).toString('base64url'),date=today();
  tx(()=>{if(db.prepare('SELECT id FROM tenants WHERE id=?').get(tenantId))fail('TENANT_EXISTS');
   if(db.prepare('SELECT count(*) AS n FROM tenants').get().n>=200)fail('TENANT_LIMIT');
   db.prepare('INSERT INTO tenants VALUES(?,?,?)').run(tenantId,hash(operatorKey),hash(reviewerKey));
   for(const item of recipe.items)db.prepare('INSERT INTO items VALUES(?,?,?)')
     .run(tenantId,item.id,JSON.stringify(Kernel.openItem(recipe,item.id,date)));
  });
  return {tenantId,operatorKey,reviewerKey,roleSeparation:true};
 }
 function command(token,sku,cmd,requestKey,expectedRevision){
  const user=identity(token);
  if(typeof requestKey!=='string'||!keyRe.test(requestKey))fail('KEY_INVALID');
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1||expectedRevision>1000000)fail('VERSION_INVALID');
  if(!cmd||typeof cmd!=='object'||Array.isArray(cmd))fail('COMMAND_INVALID');
  const digest=hash(JSON.stringify({sku,cmd,expectedRevision}));
  return tx(()=>{
   const prior=db.prepare('SELECT command_hash,result FROM receipts WHERE tenant_id=? AND request_key=?')
     .get(user.tenantId,requestKey);
   if(prior){if(prior.command_hash!==digest)fail('IDEMPOTENCY_CONFLICT');return JSON.parse(prior.result);}
   if(db.prepare('SELECT count(*) AS n FROM receipts WHERE tenant_id=?').get(user.tenantId).n>=3000)fail('RECEIPT_LIMIT');
   const state=row(user.tenantId,sku);
   if(state.revision!==expectedRevision)fail('VERSION_CONFLICT');
   const next=Kernel.applyCommand(recipe,state,cmd,user.role,today());
   db.prepare('UPDATE items SET state=? WHERE tenant_id=? AND sku=?')
     .run(JSON.stringify(next),user.tenantId,sku);
   const result={item:Kernel.projectItem(recipe,next,today()),version:next.revision,
     mode:'synthetic-internal-only',outboundOrders:0,paymentsSent:0,releaseApproved:false};
   db.prepare('INSERT INTO receipts VALUES(?,?,?,?)')
     .run(user.tenantId,requestKey,digest,JSON.stringify(result));
   return clone(result);
  });
 }
 function sweep(){return tx(()=>{
  const date=today(),list=db.prepare('SELECT tenant_id,sku,state FROM items ORDER BY tenant_id,sku').all();
  let proposed=0,blocked=0;for(const entry of list){
   const state=JSON.parse(entry.state),info=Kernel.projectItem(recipe,state,date);
   if(!info.recommendation.quantity||info.proposals.some(p=>['pending_review','approved_internal'].includes(p.status)))continue;
   try{const next=Kernel.applyCommand(recipe,state,{type:'request_reorder'},'operator',date);
    db.prepare('UPDATE items SET state=? WHERE tenant_id=? AND sku=?')
      .run(JSON.stringify(next),entry.tenant_id,entry.sku);proposed++;
   }catch(error){if(['BUDGET_CAP','ORDER_LIMIT'].includes(error.message)){blocked++;continue;}throw error;}
  }
  return {scanned:list.length,proposed,blocked,emailsSent:0,paymentsSent:0,
    externalOrdersPlaced:0,releaseApproved:false};
 });}
 return Object.freeze({recipe:()=>clone(recipe),identity,context,provision,command,sweep,
  close(){if(!closed){db.close();closed=true;}}});
}
module.exports={openStore};
