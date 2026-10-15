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
  const name='manifest.json',file=path.join(dir,name),st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size<2||st.size>maxManifestBytes)fail(code);
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
   const target=path.join(dir,item),info=fs.lstatSync(target);
   if(!info.isFile()||info.isSymbolicLink()||info.size>maxFileBytes||
      sha256(fs.readFileSync(target))!==manifest.files[item])fail(code);
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
module.exports={sha256,privateDirectory,outsideRepository,trustedSourceFiles,verifyBundledFiles,
 privateJson,immutablePrivateJson};
