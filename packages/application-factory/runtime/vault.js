"use strict";
// Operator-keyed, single-host evidence store. Not a production upload certification.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const MAX_OBJECT_BYTES=262144, DEFAULT_TENANT_BYTES=10*1024*1024, DEFAULT_TENANT_FILES=100;
const fail=code=>{throw new Error(code);};
const isId=value=>typeof value==='string'&&/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)&&value.length<=60;
const isRecord=value=>typeof value==='string'&&/^r[1-9]\d*$/.test(value)&&value.length<=16;
const isRequest=value=>typeof value==='string'&&/^[A-Za-z0-9._-]{1,80}$/.test(value);
const isName=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9 _().-]{0,119}$/.test(value);
const fields=(value,required)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).length===required.length&&required.every(k=>Object.hasOwn(value,k));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const mediaExtensions={'application/pdf':['.pdf'],'image/png':['.png'],'image/jpeg':['.jpg','.jpeg']};
function validateUpload(value){
  if(!fields(value,['tenantId','workspaceId','recordId','requirementId','requestKey','name','mediaType','bytes'])||
     ![value.tenantId,value.workspaceId,value.requirementId].every(isId)||!isRecord(value.recordId)||
     !isRequest(value.requestKey)||!isName(value.name)||
     !Object.hasOwn(mediaExtensions,value.mediaType)||!Buffer.isBuffer(value.bytes))fail('DOCUMENT_INVALID');
  if(!mediaExtensions[value.mediaType].some(ext=>value.name.toLowerCase().endsWith(ext)))fail('DOCUMENT_INVALID');
  if(value.bytes.length===0||value.bytes.length>MAX_OBJECT_BYTES)fail('DOCUMENT_TOO_LARGE');
  const bytes=value.bytes;
  const valid=value.mediaType==='application/pdf'?bytes.length>=8&&bytes.subarray(0,5).equals(Buffer.from('%PDF-')):
    value.mediaType==='image/png'?bytes.length>=9&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):
      bytes.length>=5&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&
        bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217;
  if(!valid)fail('DOCUMENT_INVALID');
}
function scope(value,needsId=false){
  if(!fields(value,needsId?['tenantId','workspaceId','id']:['tenantId','workspaceId'])||
    !isId(value.tenantId)||!isId(value.workspaceId)||
    (needsId&&!(typeof value.id==='string'&&/^[0-9a-f]{32}$/.test(value.id))))fail('DOCUMENT_INVALID');
}
function safeParent(filename){
  const dir=path.dirname(filename);
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const info=fs.lstatSync(dir),real=fs.realpathSync(dir);
  if(!info.isDirectory()||info.isSymbolicLink()||
    (process.platform==='win32'?real.toLowerCase():real)!==
    (process.platform==='win32'?path.resolve(dir).toLowerCase():path.resolve(dir)))fail('STATE_PATH_UNSAFE');
  if(process.platform!=='win32'&&(info.mode&0o077)!==0)fail('STATE_PATH_UNSAFE');
  if(fs.existsSync(filename)){
    const stat=fs.lstatSync(filename);
    if(!stat.isFile()||stat.isSymbolicLink())fail('STATE_PATH_UNSAFE');
  }else{
    const descriptor=fs.openSync(filename,'wx',0o600);fs.closeSync(descriptor);
  }
  if(process.platform!=='win32')fs.chmodSync(filename,0o600);
}
function metadata(row){return {id:row.id,recordId:row.record_id,requirementId:row.requirement_id,
  name:row.name,mediaType:row.media_type,size:row.size,sha256:row.sha256,createdAt:row.created_ms};}
function associatedData(row){return Buffer.from(JSON.stringify({tenantId:row.tenant_id,workspaceId:row.workspace_id,...metadata(row)}));}
function openVault({filename,key,maxBytesPerTenant=DEFAULT_TENANT_BYTES,maxDocumentsPerTenant=DEFAULT_TENANT_FILES}={}){
  if(typeof filename!=='string'||!path.isAbsolute(filename)||!Buffer.isBuffer(key)||key.length!==32||
     !Number.isSafeInteger(maxBytesPerTenant)||maxBytesPerTenant<1||maxBytesPerTenant>DEFAULT_TENANT_BYTES||
     !Number.isSafeInteger(maxDocumentsPerTenant)||maxDocumentsPerTenant<1||maxDocumentsPerTenant>DEFAULT_TENANT_FILES)fail('VAULT_CONFIG_INVALID');
  safeParent(filename);
  const privateKey=Buffer.from(key);
  const db=new DatabaseSync(filename);let closed=false;
  try{
    db.exec('PRAGMA busy_timeout=5000; PRAGMA trusted_schema=OFF; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    const version=db.prepare('PRAGMA user_version').get().user_version;
    const app=db.prepare('PRAGMA application_id').get().application_id;
    if(![0,1].includes(version)||(version===0&&app!==0)||(version===1&&app!==1178682197))fail('SCHEMA_UNSUPPORTED');
    if(version===0){
      if(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().n)fail('SCHEMA_UNSUPPORTED');
      db.exec("BEGIN IMMEDIATE; CREATE TABLE vault_documents ("+
        "id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL,"+
        "record_id TEXT NOT NULL, requirement_id TEXT NOT NULL, request_key TEXT NOT NULL,"+
        "fingerprint TEXT NOT NULL, name TEXT NOT NULL, media_type TEXT NOT NULL, size INTEGER NOT NULL,"+
        "sha256 TEXT NOT NULL, created_ms INTEGER NOT NULL, nonce BLOB NOT NULL, tag BLOB NOT NULL,"+
        "ciphertext BLOB NOT NULL, UNIQUE(tenant_id,workspace_id,request_key)) STRICT;"+
        "CREATE INDEX vault_scope ON vault_documents(tenant_id,workspace_id,record_id);"+
        "PRAGMA application_id=1178682197; PRAGMA user_version=1; COMMIT;");
    }
    if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')fail('STATE_CORRUPT');
  }catch(error){db.close();privateKey.fill(0);throw error;}
  function transaction(work){
    if(closed)fail('VAULT_CLOSED');db.exec('BEGIN IMMEDIATE');
    try{const result=work();db.exec('COMMIT');return result;}
    catch(error){db.exec('ROLLBACK');throw error;}
  }
  function getOne(value){
    scope(value,true);
    const row=db.prepare('SELECT * FROM vault_documents WHERE tenant_id=? AND workspace_id=? AND id=?')
      .get(value.tenantId,value.workspaceId,value.id);
    if(!row)fail('NOT_FOUND');return row;
  }
  return Object.freeze({
    put(value){
      validateUpload(value);
      return transaction(()=>{
        const digest=sha(value.bytes);
        const fingerprint=sha(JSON.stringify([value.recordId,value.requirementId,value.name,value.mediaType,digest]));
        const existing=db.prepare('SELECT * FROM vault_documents WHERE tenant_id=? AND workspace_id=? AND request_key=?')
          .get(value.tenantId,value.workspaceId,value.requestKey);
        if(existing){if(existing.fingerprint!==fingerprint)fail('IDEMPOTENCY_CONFLICT');return metadata(existing);}
        const size=db.prepare('SELECT count(*) AS n, coalesce(sum(size),0) AS bytes FROM vault_documents WHERE tenant_id=?')
          .get(value.tenantId);
        if(size.n>=maxDocumentsPerTenant||size.bytes+value.bytes.length>maxBytesPerTenant)fail('DOCUMENT_QUOTA');
        const row={id:crypto.randomBytes(16).toString('hex'),tenant_id:value.tenantId,workspace_id:value.workspaceId,
          record_id:value.recordId,requirement_id:value.requirementId,request_key:value.requestKey,
          fingerprint,name:value.name,media_type:value.mediaType,size:value.bytes.length,
          sha256:digest,created_ms:Date.now()};
        const nonce=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',privateKey,nonce);
        cipher.setAAD(associatedData(row));
        const ciphertext=Buffer.concat([cipher.update(value.bytes),cipher.final()]),tag=cipher.getAuthTag();
        db.prepare('INSERT INTO vault_documents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(row.id,row.tenant_id,row.workspace_id,row.record_id,row.requirement_id,row.request_key,
            row.fingerprint,row.name,row.media_type,row.size,row.sha256,row.created_ms,nonce,tag,ciphertext);
        return metadata(row);
      });
    },
    list(value){
      scope(value);
      if(closed)fail('VAULT_CLOSED');
      return db.prepare('SELECT * FROM vault_documents WHERE tenant_id=? AND workspace_id=? ORDER BY created_ms,id')
        .all(value.tenantId,value.workspaceId).map(metadata);
    },
    read(value){
      const row=getOne(value);
      try{
        if(row.nonce.length!==12||row.tag.length!==16)fail('DOCUMENT_INTEGRITY');
        const decipher=crypto.createDecipheriv('aes-256-gcm',privateKey,row.nonce);
        decipher.setAAD(associatedData(row));decipher.setAuthTag(row.tag);
        const bytes=Buffer.concat([decipher.update(row.ciphertext),decipher.final()]);
        if(bytes.length!==row.size||sha(bytes)!==row.sha256)fail('DOCUMENT_INTEGRITY');
        return {metadata:metadata(row),bytes};
      }catch{fail('DOCUMENT_INTEGRITY');}
    },
    remove(value){
      scope(value,true);
      return transaction(()=>Boolean(db.prepare('DELETE FROM vault_documents WHERE tenant_id=? AND workspace_id=? AND id=?')
        .run(value.tenantId,value.workspaceId,value.id).changes));
    },
    close(){if(!closed){db.close();privateKey.fill(0);closed=true;}}
  });
}
module.exports={openVault,MAX_OBJECT_BYTES};
