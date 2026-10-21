'use strict';
// Build-time-only contracts for local, source-hashed, synthetic app packages.
// IMPORTANT: generated apps remain self-contained; NEVER copy or require this module at runtime.
// Family-specific recipe, business rules, receipts and release boundaries stay in their owners.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../../..');
const fail=code=>{throw Error(code);};
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
const normalized=p=>process.platform==='win32'?p.toLowerCase():p;
const digest64=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const safeName=value=>typeof value==='string'&&/^[a-zA-Z0-9._-]+$/.test(value)&&value!=='manifest.json';
function privateDirectory(directory,code='OUTPUT_UNSAFE'){
 let st;
 try{
  if(typeof directory!=='string'||!path.isAbsolute(directory))fail(code);
  st=fs.lstatSync(directory);
  if(!st.isDirectory()||st.isSymbolicLink()||
     normalized(fs.realpathSync(directory))!==normalized(path.resolve(directory))||
     (process.platform!=='win32'&&((st.mode&0o077)!==0||
      (typeof process.getuid==='function'&&st.uid!==process.getuid()))))fail(code);
 }catch{fail(code);}
 return path.resolve(directory);
}
function outsideRepository(input,{root=ROOT,code='OUTPUT_UNSAFE'}={}){
 if(typeof input!=='string'||!path.isAbsolute(input)||typeof root!=='string'||
   !path.isAbsolute(root))fail(code);
 const resolved=path.resolve(input),relative=path.relative(path.resolve(root),resolved);
 if(!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))
  fail(code);
 return resolved;
}
function privatePackageFile(file,{code='PACKAGE_INVALID',maxBytes=1048576}={}){
 if(typeof file!=='string'||!path.isAbsolute(file)||!Number.isSafeInteger(maxBytes)||
   maxBytes<1||maxBytes>16777216)fail(code);
 try{
  const resolved=path.resolve(file),st=fs.lstatSync(resolved);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>maxBytes||
    normalized(fs.realpathSync(resolved))!==normalized(resolved)||
    (process.platform!=='win32'&&((st.mode&0o077)!==0||
     (typeof process.getuid==='function'&&st.uid!==process.getuid()))))fail(code);
  return st;
 }catch{fail(code);}
}
function trustedSourceFiles({sourceRoot,names,maxBytes,code='SOURCE_INVALID'}={}){
 if(typeof sourceRoot!=='string'||!path.isAbsolute(sourceRoot)||
   !Array.isArray(names)||names.length<1||names.length>32||
   !Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>1048576||
   new Set(names).size!==names.length)fail(code);
 try{
  const dir=fs.lstatSync(sourceRoot);
  if(!dir.isDirectory()||dir.isSymbolicLink()||
    normalized(fs.realpathSync(sourceRoot))!==normalized(path.resolve(sourceRoot)))fail(code);
  const files=Object.create(null);
  for(const name of names){
   if(!safeName(name))fail(code);
   const filename=path.join(sourceRoot,name),st=fs.lstatSync(filename);
   if(!st.isFile()||st.isSymbolicLink()||st.size>maxBytes||
      normalized(fs.realpathSync(filename))!==normalized(filename))fail(code);
   files[name]=fs.readFileSync(filename,'utf8');
  }
  return files;
 }catch{fail(code);}
}
function verifyBundledFiles(directory,expectedDigest,{
 code='PACKAGE_INVALID',requiredNames,maxFiles=40,maxManifestBytes=32768,maxFileBytes=262144
}={}){
 if(!digest64(expectedDigest)||!Array.isArray(requiredNames)||requiredNames.length<1||
   requiredNames.length>=maxFiles||new Set(requiredNames).size!==requiredNames.length||
   !requiredNames.every(safeName))fail(code);
 try{
  const dir=privateDirectory(directory,code),present=fs.readdirSync(dir).sort();
  if(present.length>maxFiles)fail(code);
  const name='manifest.json',file=path.join(dir,name),st=privatePackageFile(file,{code,maxBytes:maxManifestBytes});
  if(st.size<2)fail(code);
  const json=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!json||typeof json!=='object'||Array.isArray(json))fail(code);
  const {digest,...manifest}=json;
  if(digest!==expectedDigest||sha256(JSON.stringify(manifest))!==digest||
     !manifest.files||typeof manifest.files!=='object'||Array.isArray(manifest.files))fail(code);
  const names=Object.keys(manifest.files);
  if(names.length!==requiredNames.length||!requiredNames.every(n=>Object.hasOwn(manifest.files,n))||
      JSON.stringify([...names,'manifest.json'].sort())!==JSON.stringify(present))fail(code);
  for(const item of names){
   if(!safeName(item)||!digest64(manifest.files[item]))fail(code);
   const target=path.join(dir,item);
   privatePackageFile(target,{code,maxBytes:maxFileBytes});
   if(sha256(fs.readFileSync(target))!==manifest.files[item])fail(code);
  }
  return {...manifest,digest};
 }catch{fail(code);}
}
function privateJson(file,value,{code='OUTPUT_UNSAFE'}={}){
 if(typeof file!=='string'||!path.isAbsolute(file))fail(code);
 const dir=privateDirectory(path.dirname(file),code);
 if(path.basename(file)!==path.relative(dir,file))fail(code);
 try{
  if(fs.existsSync(file)){
   const st=fs.lstatSync(file);
   if(!st.isFile()||st.isSymbolicLink()||
      (process.platform!=='win32'&&(st.mode&0o077)!==0))fail(code);
  }
 }catch{fail(code);}
 const temp=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
 try{
  const fd=fs.openSync(temp,'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}
  finally{fs.closeSync(fd);}
  // Atomic replacement of an existing regular private receipt (never a symlink).
  if(fs.existsSync(file)){
   const existing=fs.lstatSync(file);
   if(!existing.isFile()||existing.isSymbolicLink())fail(code);
  }
  fs.renameSync(temp,file);
 }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
function immutablePrivateJson(file,value,{code='RECEIPT_IMMUTABLE'}={}){
 if(typeof file!=='string'||!path.isAbsolute(file))fail(code);
 const dir=privateDirectory(path.dirname(file),code);
 if(path.basename(file)!==path.relative(dir,file))fail(code);
 const body=JSON.stringify(value,null,2)+'\n';
 if(fs.existsSync(file)){
  try{
   const st=fs.lstatSync(file);
   if(!st.isFile()||st.isSymbolicLink()||st.size<2||st.size>65536||
      (process.platform!=='win32'&&(st.mode&0o077)!==0)||
      fs.readFileSync(file,'utf8')!==body)fail(code);
   return {created:false,digest:sha256(body)};
  }catch{fail(code);}
 }
 const temp=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
 try{
  const fd=fs.openSync(temp,'wx',0o600);
  try{fs.writeFileSync(fd,body);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  try{fs.linkSync(temp,file);}catch{fail(code);}
  if(process.platform!=='win32'){
   const parent=fs.openSync(dir,'r');try{fs.fsyncSync(parent);}finally{fs.closeSync(parent);}
  }
  return {created:true,digest:sha256(body)};
 }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
function readManufacturingFailure(file,{kind,id,code='OUTPUT_UNSAFE'}={}){
 if(typeof file!=='string'||!path.isAbsolute(file)||typeof kind!=='string'||
   !/^[a-z][a-z0-9-]{2,63}$/.test(kind)||typeof id!=='string'||
   !/^[a-z0-9][a-z0-9-]{1,63}$/.test(id))fail(code);
 const dir=privateDirectory(path.dirname(file),code);
 if(path.basename(file)!==path.relative(dir,file))fail(code);
 if(!fs.existsSync(file))return null;
 try{
  const st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size<2||st.size>65536||
    (process.platform!=='win32'&&((st.mode&0o077)!==0||
     (typeof process.getuid==='function'&&st.uid!==process.getuid()))))fail(code);
  const body=fs.readFileSync(file,'utf8'),row=JSON.parse(body),
   keys=Object.keys(row).sort().join(','),
   legacy=keys==='digest,id,reason,status'||keys==='attempts,digest,id,reason,status',
   v1=keys==='digest,id,kind,observedFailedAt,reason,schemaVersion,status'||
    keys==='attempts,digest,id,kind,observedFailedAt,reason,schemaVersion,status';
  if((!legacy&&!v1)||row.id!==id||!digest64(row.digest)||row.status!=='quarantined'||
    !['ACCEPTANCE_FAILED','EXISTING_ARTIFACT_REJECTED','PREVIOUS_FAILURE'].includes(row.reason)||
    (Object.hasOwn(row,'attempts')&&(!Number.isSafeInteger(row.attempts)||row.attempts<0||row.attempts>3))||
    (v1&&(row.schemaVersion!==1||row.kind!==kind||row.reason==='PREVIOUS_FAILURE'||
     typeof row.observedFailedAt!=='string'||
     !/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.observedFailedAt)||
     !Number.isFinite(Date.parse(row.observedFailedAt))||Date.parse(row.observedFailedAt)>Date.now()))||
    body!==JSON.stringify(row,null,2)+'\n')fail(code);
  return Object.freeze({...row,legacyRecord:legacy});
 }catch(error){if(error?.message===code)throw error;fail(code);}
}
function writeManufacturingFailure(file,{kind,id,digest,reason,attempts}={},
 {code='OUTPUT_UNSAFE'}={}){
 if(typeof kind!=='string'||!/^[a-z][a-z0-9-]{2,63}$/.test(kind)||
   typeof id!=='string'||!/^[a-z0-9][a-z0-9-]{1,63}$/.test(id)||!digest64(digest)||
   !['ACCEPTANCE_FAILED','EXISTING_ARTIFACT_REJECTED'].includes(reason)||
   (attempts!==undefined&&(!Number.isSafeInteger(attempts)||attempts<0||attempts>3)))fail(code);
 const record={schemaVersion:1,kind,observedFailedAt:new Date().toISOString(),
  id,digest,status:'quarantined',reason};
 if(attempts!==undefined)record.attempts=attempts;
 immutablePrivateJson(file,record,{code});return Object.freeze({...record});
}
function preserveIncompleteStages(root,{prefixes,code='MANUFACTURING_BUSY'}={}){
 try{
 const dir=privateDirectory(root,code);
 if(!Array.isArray(prefixes)||prefixes.length<1||prefixes.length>8||
    new Set(prefixes).size!==prefixes.length||
    !prefixes.every(value=>typeof value==='string'&&/^\.[a-z][a-z0-9-]{1,31}-$/.test(value)))fail(code);
 const names=fs.readdirSync(dir).filter(name=>prefixes.some(prefix=>name.startsWith(prefix))).sort();
 if(names.length>32)fail(code);
 if(names.length===0)return [];
 const history=path.join(dir,'.incomplete-history');
 if(fs.existsSync(history))privateDirectory(history,code);
 const tree=stage=>{
  let entryCount=0,bytes=0,latestMtimeMs=0;const rows=[];
  const walk=(folder,relative='')=>{
   for(const entry of fs.readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    if(!/^[A-Za-z0-9._-]+$/.test(entry.name)||entry.name==='.'||entry.name==='..')fail(code);
    const rel=relative+entry.name,target=path.join(folder,entry.name),st=fs.lstatSync(target);
    if(st.isSymbolicLink()||(process.platform!=='win32'&&
       (typeof process.getuid==='function'&&st.uid!==process.getuid())))fail(code);
    latestMtimeMs=Math.max(latestMtimeMs,st.mtimeMs);entryCount++;if(entryCount>128)fail(code);
    if(entry.isDirectory()){rows.push([rel+'/',st.mode&0o777]);walk(target,rel+'/');}
    else if(entry.isFile()){
     if(st.size>1048576)fail(code);bytes+=st.size;if(bytes>16777216)fail(code);
     rows.push([rel,st.mode&0o777,st.size,sha256(fs.readFileSync(target))]);
    }else fail(code);
   }
  };
  walk(stage);return {entryCount,bytes,latestMtimeMs,treeDigest:sha256(JSON.stringify(rows))};
 };
 const planned=names.map(name=>{
  const source=path.join(dir,name),st=fs.lstatSync(source);
  if(!st.isDirectory()||st.isSymbolicLink()||
     normalized(fs.realpathSync(source))!==normalized(path.resolve(source))||
     (process.platform!=='win32'&&((st.mode&0o077)!==0||
      (typeof process.getuid==='function'&&st.uid!==process.getuid()))))fail(code);
  const detail=tree(source),stem=name.slice(1)+'-'+detail.treeDigest,
   archived=path.join(history,stem),event=archived+'.json';
  if(fs.existsSync(archived))fail(code);
  let record;
  if(fs.existsSync(event)){
   try{
    const eventStat=fs.lstatSync(event),body=fs.readFileSync(event,'utf8'),saved=JSON.parse(body);
    if(!eventStat.isFile()||eventStat.isSymbolicLink()||eventStat.nlink!==1||
       eventStat.size<2||eventStat.size>65536||
       (process.platform!=='win32'&&((eventStat.mode&0o077)!==0||
        (typeof process.getuid==='function'&&eventStat.uid!==process.getuid())))||
       Object.keys(saved).sort().join(',')!==
        'bytes,entryCount,kind,observedIncompleteAt,originalName,schemaVersion,treeDigest'||
       saved.schemaVersion!==1||saved.kind!=='incomplete-private-build-preserved'||
       saved.originalName!==name||saved.treeDigest!==detail.treeDigest||
       saved.entryCount!==detail.entryCount||saved.bytes!==detail.bytes||
       typeof saved.observedIncompleteAt!=='string'||
       !/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(saved.observedIncompleteAt)||
       !Number.isFinite(Date.parse(saved.observedIncompleteAt))||
       Date.parse(saved.observedIncompleteAt)>Date.now()||
       Date.parse(saved.observedIncompleteAt)<Math.floor(detail.latestMtimeMs)||
       body!==JSON.stringify(saved,null,2)+'\n')fail(code);
    record=saved;
   }catch(error){if(error?.message===code)throw error;fail(code);}
  }else{
   const observedIncompleteAt=new Date().toISOString();
   if(Date.parse(observedIncompleteAt)<Math.floor(detail.latestMtimeMs))fail(code);
   record={schemaVersion:1,kind:'incomplete-private-build-preserved',observedIncompleteAt,
    originalName:name,treeDigest:detail.treeDigest,entryCount:detail.entryCount,bytes:detail.bytes};
  }
  return {source,archived,event,record,detail};
 });
 if(planned.reduce((sum,item)=>sum+item.detail.bytes,0)>67108864)fail(code);
 fs.mkdirSync(history,{recursive:true,mode:0o700});privateDirectory(history,code);
 const sync=directory=>{if(process.platform!=='win32'){
  const fd=fs.openSync(directory,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 }};
 for(const item of planned){
  immutablePrivateJson(item.event,item.record,{code});
  fs.renameSync(item.source,item.archived);sync(history);sync(dir);
 }
 return planned.map(item=>Object.freeze({...item.record,archivedName:path.basename(item.archived)}));
 }catch(error){if(error?.message===code)throw error;fail(code);}
}
function linuxProcessIdentity(pid){
 if(process.platform!=='linux'||!Number.isSafeInteger(pid)||pid<1||pid>2147483647)return null;
 try{
  const boot=fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim().toLowerCase();
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(boot))return null;
  const namespacePids=(fs.readFileSync('/proc/self/status','utf8').match(/^NSpid:\s+(.+)$/m)?.[1]||'')
   .trim().split(/\s+/).filter(Boolean),nested=namespacePids.length>1;
  let statFile;
  if(pid===process.pid)statFile='/proc/self/stat';
  else if(!nested)statFile='/proc/'+pid+'/stat';
  else{
   const namespace=fs.readlinkSync('/proc/self/ns/pid'),
    entries=fs.readdirSync('/proc').filter(name=>/^\d+$/.test(name));
   if(entries.length>65536)return null;
   for(const entry of entries){
    try{
     if(fs.readlinkSync('/proc/'+entry+'/ns/pid')!==namespace)continue;
     const ids=(fs.readFileSync('/proc/'+entry+'/status','utf8').match(/^NSpid:\s+(.+)$/m)?.[1]||'')
      .trim().split(/\s+/).filter(Boolean);
     if(Number(ids.at(-1))===pid){statFile='/proc/'+entry+'/stat';break;}
    }catch{}
   }
  }
  if(!statFile)return null;
  const stat=fs.readFileSync(statFile,'utf8'),end=stat.lastIndexOf(')');
  if(end<2)return null;
  // The first token after the executable name is field 3; starttime is field 22.
  const fields=stat.slice(end+1).trim().split(/\s+/),started=fields[19];
  if(!/^\d+$/.test(started))return null;
  return sha256(boot+':'+started);
 }catch{return null;}
}
function privateProcessLock(file,{code='MANUFACTURING_BUSY'}={}){
 if(typeof file!=='string'||!path.isAbsolute(file))fail(code);
 const dir=privateDirectory(path.dirname(file),code),name=path.basename(file);
 if(name!==path.relative(dir,file)||!safeName(name))fail(code);
 const sync=directory=>{if(process.platform!=='win32'){
  const fd=fs.openSync(directory,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 }};
 const read=()=>{
  try{
   const st=fs.lstatSync(file);
   if(!st.isFile()||st.isSymbolicLink()||st.size<2||st.size>2048||
      (process.platform!=='win32'&&((st.mode&0o077)!==0||
       (typeof process.getuid==='function'&&st.uid!==process.getuid()))))fail(code);
   const body=fs.readFileSync(file,'utf8'),row=JSON.parse(body),keys=Object.keys(row).sort().join(',');
   const legacy=keys==='pid,startedAt',v1=keys==='pid,schemaVersion,startedAt,token',
    v2=keys==='pid,processIdentity,schemaVersion,startedAt,token';
   if((!legacy&&!v1&&!v2)||(v1&&(row.schemaVersion!==1||!digest64(row.token)))||
      (v2&&(row.schemaVersion!==2||!digest64(row.token)||!digest64(row.processIdentity)))||
      !Number.isSafeInteger(row.pid)||row.pid<1||row.pid>2147483647||
      typeof row.startedAt!=='string'||!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.startedAt)||
      !Number.isFinite(Date.parse(row.startedAt)))fail(code);
   return {body,row,token:legacy?sha256(body).slice(0,64):row.token,legacy,st};
  }catch(error){if(error?.message===code)throw error;fail(code);}
 };
 const acceptExistingRecovery=(event,prior)=>{
  try{
   const st=fs.lstatSync(event);
   if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size<2||st.size>65536||
      (process.platform!=='win32'&&((st.mode&0o077)!==0||
       (typeof process.getuid==='function'&&st.uid!==process.getuid()))))fail(code);
   const body=fs.readFileSync(event,'utf8'),saved=JSON.parse(body);
   if(!saved||typeof saved!=='object'||Array.isArray(saved)||
      Object.keys(saved).sort().join(',')!==
       'kind,legacyRecord,observedDeadAt,original,originalDigest,schemaVersion'||
      saved.schemaVersion!==1||saved.kind!=='stale-private-process-lock-recovery'||
      saved.originalDigest!==sha256(prior.body)||saved.legacyRecord!==prior.legacy||
      typeof saved.observedDeadAt!=='string'||
      !/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(saved.observedDeadAt)||
      !Number.isFinite(Date.parse(saved.observedDeadAt))||
      Date.parse(saved.observedDeadAt)>Date.now()||
      Date.parse(saved.observedDeadAt)<Date.parse(prior.row.startedAt)||
      JSON.stringify(saved.original)!==JSON.stringify(prior.row)||
      body!==JSON.stringify(saved,null,2)+'\n')fail(code);
  }catch(error){if(error?.message===code)throw error;fail(code);}
 };
 const alive=prior=>{
  try{process.kill(prior.row.pid,0);}catch(error){return error?.code!=='ESRCH';}
  if(!prior.row.processIdentity)return true;
  const observed=linuxProcessIdentity(prior.row.pid);
  // Unsupported or temporarily unreadable identity evidence must never authorize recovery.
  return observed===null||observed===prior.row.processIdentity;
 };
 const token=crypto.randomBytes(32).toString('hex'),identity=linuxProcessIdentity(process.pid),
  startedAt=new Date().toISOString(),record=identity===null?
   {schemaVersion:1,pid:process.pid,startedAt,token}:
   {schemaVersion:2,pid:process.pid,processIdentity:identity,startedAt,token},
  body=JSON.stringify(record)+'\n';
 for(let attempt=0;attempt<2;attempt++){
  const temp=file+'.'+token+'.tmp';let linked=false;
  try{
   const fd=fs.openSync(temp,'wx',0o600);
   try{fs.writeFileSync(fd,body);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   try{fs.linkSync(temp,file);linked=true;}catch(error){if(error.code!=='EEXIST')throw error;}
  }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
  if(linked){
   sync(dir);let released=false;
   return Object.freeze({record:Object.freeze({...record}),release(){
    if(released)return;
    const owner=read();if(owner.body!==body)fail(code);
    fs.unlinkSync(file);sync(dir);released=true;
   }});
  }
  const prior=read();if(alive(prior))fail(code);
  const observedDeadAt=new Date().toISOString();
  if(Date.parse(observedDeadAt)<Date.parse(prior.row.startedAt))fail(code);
  const history=path.join(dir,'.lock-history');fs.mkdirSync(history,{recursive:true,mode:0o700});
  privateDirectory(history,code);
  const stem=name.replace(/^\.+/,'')+'-'+prior.token,
    archived=path.join(history,stem+'.lock'),event=path.join(history,stem+'.json');
  try{fs.linkSync(file,archived);}catch(error){
   if(error.code!=='EEXIST'||fs.readFileSync(archived,'utf8')!==prior.body)fail(code);
  }
  const archivedStat=fs.lstatSync(archived),currentStat=fs.lstatSync(file);
  if(fs.readFileSync(archived,'utf8')!==prior.body||archivedStat.dev!==currentStat.dev||
     archivedStat.ino!==currentStat.ino||archivedStat.nlink!==2||currentStat.nlink!==2)fail(code);
  const eventBody={schemaVersion:1,kind:'stale-private-process-lock-recovery',
   observedDeadAt,originalDigest:sha256(prior.body),
   legacyRecord:prior.legacy,original:prior.row};
  if(fs.existsSync(event))acceptExistingRecovery(event,prior);
  else immutablePrivateJson(event,eventBody,{code});
  try{fs.unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}
  sync(history);sync(dir);
 }
 fail(code);
}
module.exports={sha256,privateDirectory,outsideRepository,privatePackageFile,trustedSourceFiles,verifyBundledFiles,
 privateJson,immutablePrivateJson,readManufacturingFailure,writeManufacturingFailure,
 privateProcessLock,preserveIncompleteStages};


