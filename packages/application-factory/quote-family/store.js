'use strict';
// Single-host durable ledger with per-tenant operator/reviewer credentials and bounded replay receipts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {validateRecipe,createQuote,changeQuote,projectQuote,validDay}=require('./kernel');
const fail=code=>{throw Error(code);};
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const identityPattern=/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const requestKeyPattern=/^[A-Za-z0-9_-]{8,100}$/;
const clone=value=>JSON.parse(JSON.stringify(value));
function openStore({filename,recipe,clock=Date.now}={}){
 if(typeof filename!=='string'||!path.isAbsolute(filename)||typeof clock!=='function')fail('STORE_CONFIG_INVALID');
 const catalog=validateRecipe(recipe);
 const parent=path.dirname(filename);fs.mkdirSync(parent,{recursive:true,mode:0o700});
 const ps=fs.lstatSync(parent);const real=fs.realpathSync(parent);
 if(!ps.isDirectory()||ps.isSymbolicLink()||real.toLowerCase()!==path.resolve(parent).toLowerCase()||
    (process.platform!=='win32'&&(ps.mode&0o077)))fail('STORE_PATH_UNSAFE');
 if(fs.existsSync(filename)){
  const s=fs.lstatSync(filename);
  if(!s.isFile()||s.isSymbolicLink()||(process.platform!=='win32'&&(s.mode&0o077)))fail('STORE_PATH_UNSAFE');
 }else{const fd=fs.openSync(filename,'wx',0o600);fs.closeSync(fd);}
 const db=new DatabaseSync(filename);let closed=false;
 try{
  db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  const version=db.prepare('PRAGMA user_version').get().user_version;
  const application=db.prepare('PRAGMA application_id').get().application_id;
  if((version!==0&&version!==1)||(version===1&&application!==1178682202)||(version===0&&application!==0))fail('STORE_SCHEMA_INVALID');
  if(version===0){
   if(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().n)fail('STORE_SCHEMA_INVALID');
   db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE tenants(id TEXT PRIMARY KEY,operator_hash TEXT NOT NULL UNIQUE,reviewer_hash TEXT NOT NULL UNIQUE,next_seq INTEGER NOT NULL DEFAULT 1) STRICT;
      CREATE TABLE quotes(tenant TEXT NOT NULL REFERENCES tenants(id),id TEXT NOT NULL,data TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(tenant,id)) STRICT;
      CREATE TABLE receipts(tenant TEXT NOT NULL REFERENCES tenants(id),key TEXT NOT NULL,signature TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(tenant,key)) STRICT;
      CREATE TABLE events(tenant TEXT NOT NULL REFERENCES tenants(id),id INTEGER NOT NULL,quote_id TEXT NOT NULL,kind TEXT NOT NULL,day TEXT NOT NULL,PRIMARY KEY(tenant,id)) STRICT;
      PRAGMA application_id=1178682202; PRAGMA user_version=1; COMMIT;`);
  }
 }catch(error){db.close();throw error;}
 function now(){const ms=clock();const d=new Date(ms);
   if(!Number.isFinite(d.getTime())||d.getUTCFullYear()<2000||d.getUTCFullYear()>2099)fail('CLOCK_INVALID');
   return d.toISOString().slice(0,10);
 }
 function transaction(action){if(closed)fail('STORE_CLOSED');db.exec('BEGIN IMMEDIATE');
  try{const value=action();db.exec('COMMIT');return value;}
  catch(error){db.exec('ROLLBACK');throw error;}
 }
 function authorize(token){
  if(closed)fail('STORE_CLOSED');
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))fail('UNAUTHORIZED');
  const digest=hash(token);
  const operator=db.prepare('SELECT id FROM tenants WHERE operator_hash=?').get(digest);
  if(operator)return {tenant:operator.id,role:'operator'};
  const reviewer=db.prepare('SELECT id FROM tenants WHERE reviewer_hash=?').get(digest);
  if(reviewer)return {tenant:reviewer.id,role:'reviewer'};
  fail('UNAUTHORIZED');
 }
 function getRaw(tenant,id){
  if(typeof id!=='string'||!/^q[1-9][0-9]{0,8}$/.test(id))fail('NOT_FOUND');
  const value=db.prepare('SELECT data FROM quotes WHERE tenant=? AND id=?').get(tenant,id);
  if(!value)fail('NOT_FOUND');
  let quote;try{quote=JSON.parse(value.data);}catch{fail('STORE_INTEGRITY');}
  if(quote.id!==id||quote.recipeId!==catalog.id)fail('STORE_INTEGRITY');
  return quote;
 }
 const view=q=>projectQuote(catalog,q,now());
 const verifyKey=k=>{if(typeof k!=='string'||!requestKeyPattern.test(k))fail('IDEMPOTENCY_KEY_INVALID');};
 function once(tenant,key,signature,action){
  verifyKey(key);
  const old=db.prepare('SELECT signature,result FROM receipts WHERE tenant=? AND key=?').get(tenant,key);
  if(old){if(old.signature!==signature)fail('IDEMPOTENCY_CONFLICT');return JSON.parse(old.result);}
  const count=db.prepare('SELECT count(*) AS n FROM receipts WHERE tenant=?').get(tenant).n;
  if(count>=20000)fail('RECEIPT_LIMIT');
  const result=action();db.prepare('INSERT INTO receipts VALUES(?,?,?,?)').run(tenant,key,signature,JSON.stringify(result));
  return result;
 }
 function event(tenant,id,kind,day){
  const serial=db.prepare('SELECT coalesce(max(id),0)+1 AS n FROM events WHERE tenant=?').get(tenant).n;
  if(serial>100000)fail('EVENT_LIMIT');
  db.prepare('INSERT INTO events VALUES(?,?,?,?,?)').run(tenant,serial,id,kind,day);
 }
 const store={
  recipe:()=>clone(catalog),
  provision(id){if(typeof id!=='string'||!identityPattern.test(id)||id.length>60)fail('TENANT_INVALID');
   const operatorToken=crypto.randomBytes(32).toString('base64url'),reviewerToken=crypto.randomBytes(32).toString('base64url');
   return transaction(()=>{
    if(db.prepare('SELECT 1 FROM tenants WHERE id=?').get(id))fail('TENANT_EXISTS');
    if(db.prepare('SELECT count(*) AS n FROM tenants').get().n>=500)fail('TENANT_LIMIT');
    db.prepare('INSERT INTO tenants(id,operator_hash,reviewer_hash,next_seq) VALUES(?,?,?,1)').run(id,hash(operatorToken),hash(reviewerToken));
    return {tenant:id,operatorToken,reviewerToken,mode:'synthetic-local-only',releaseApproved:false};
   });
  },
  identity(token){return authorize(token);},
  create(token,values,requestKey){const user=authorize(token);if(user.role!=='operator')fail('FORBIDDEN');
   return transaction(()=>once(user.tenant,requestKey,hash(JSON.stringify({type:'create',values})),()=>{
    const count=db.prepare('SELECT count(*) AS n FROM quotes WHERE tenant=?').get(user.tenant).n;
    if(count>=500)fail('QUOTE_LIMIT');
    const row=db.prepare('SELECT next_seq FROM tenants WHERE id=?').get(user.tenant);
    if(row.next_seq>999999999)fail('QUOTE_LIMIT');
    const newQuote=createQuote(catalog,{...values,id:'q'+row.next_seq},now());
    db.prepare('INSERT INTO quotes VALUES(?,?,?,?)').run(user.tenant,newQuote.id,JSON.stringify(newQuote),newQuote.revision);
    db.prepare('UPDATE tenants SET next_seq=next_seq+1 WHERE id=?').run(user.tenant);
    event(user.tenant,newQuote.id,'draft_created',now());return view(newQuote);
   }));
  },
  get(token,id){const user=authorize(token);return view(getRaw(user.tenant,id));},
  list(token){const user=authorize(token);return db.prepare('SELECT data FROM quotes WHERE tenant=? ORDER BY id').all(user.tenant)
    .map(row=>view(JSON.parse(row.data)));},
  command(token,id,command,expectedRevision,requestKey){const user=authorize(token);verifyKey(requestKey);
   return transaction(()=>once(user.tenant,requestKey,hash(JSON.stringify({id,command,expectedRevision,role:user.role})),()=>{
    const current=getRaw(user.tenant,id);
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision!==current.revision)fail('VERSION_CONFLICT');
    const next=changeQuote(catalog,current,command,user.role,now());
    const updated=db.prepare('UPDATE quotes SET data=?,revision=? WHERE tenant=? AND id=? AND revision=?')
      .run(JSON.stringify(next),next.revision,user.tenant,id,current.revision);
    if(updated.changes!==1)fail('VERSION_CONFLICT');
    event(user.tenant,id,next.history.at(-1).kind,now());return view(next);
   }));
  },
  inbox(token){const user=authorize(token);return db.prepare('SELECT quote_id AS quoteId,kind,day FROM events WHERE tenant=? ORDER BY id DESC LIMIT 100').all(user.tenant);},
  orders(token){const user=authorize(token);return db.prepare('SELECT data FROM quotes WHERE tenant=? ORDER BY id').all(user.tenant)
    .map(v=>JSON.parse(v.data)).filter(q=>q.order!==null).map(q=>clone(q.order));},
  summary(token){const rows=store.list(token);return {
   totalQuotes:rows.length,open:rows.filter(q=>['draft','pending_review','approved'].includes(q.status)).length,
   pendingReview:rows.filter(q=>q.status==='pending_review').length,
   approved:rows.filter(q=>q.status==='approved').length,
   orders:rows.filter(q=>q.status==='converted').length,
   expired:rows.filter(q=>q.status==='expired').length,currency:'USD',
   realCustomers:null,collectedRevenue:null,paymentsSent:0,externalMessagesSent:0,releaseApproved:false};
  },
  sweep(){return transaction(()=>{
   const today=now();let expired=0;
   const rows=db.prepare('SELECT tenant,id,data FROM quotes').all();
   for(const row of rows){const q=JSON.parse(row.data);
    if(!['draft','pending_review','approved'].includes(q.status)||q.validUntil>=today)continue;
    if(q.history.length>=100)fail('HISTORY_LIMIT');
    q.status='expired';q.revision++;q.history.push({kind:'quote_expired',day:today,role:'system'});
    db.prepare('UPDATE quotes SET data=?,revision=? WHERE tenant=? AND id=?').run(JSON.stringify(q),q.revision,row.tenant,row.id);
    event(row.tenant,row.id,'quote_expired',today);expired++;
   }
   return {expired,externalMessagesSent:0,paymentsSent:0,releaseApproved:false};
  });},
  close(){if(!closed){closed=true;db.close();}}
 };
 return Object.freeze(store);
}
module.exports={openStore};
