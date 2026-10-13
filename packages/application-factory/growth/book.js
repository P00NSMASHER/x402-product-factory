'use strict';
// Private, HMAC-authenticated, operator-attested evidence register. No payment verification.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validateRecipe}=require('../kernel');
const {evaluateEvidence}=require('./decision');
const fail=code=>{throw new Error(code);};
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const mac=(key,data)=>crypto.createHmac('sha256',key).update(JSON.stringify(data)).digest('hex');
const isDigest=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const sorts=['qualified_conversation','pilot_paid','repeat_paid','outcome_delivered','refund','unit_cost'];
const sourceTypes={qualified_conversation:'interview_record',pilot_paid:'payment_record',repeat_paid:'payment_record',refund:'payment_record',outcome_delivered:'delivery_record',unit_cost:'cost_record'};
function validateEvent(entry,recipeIds){
  const keys=['recipeId','kind','origin','buyerHash','referenceHash','source','cents'];
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).sort().join('|')!==keys.sort().join('|')||
    !recipeIds.has(entry.recipeId)||!sorts.includes(entry.kind)||!['external','synthetic'].includes(entry.origin)||
    !isDigest(entry.buyerHash)||!isDigest(entry.referenceHash)||entry.source!==sourceTypes[entry.kind]||
    !(entry.cents===null||(Number.isSafeInteger(entry.cents)&&entry.cents>=0&&entry.cents<=1000000000))||
    ((entry.kind==='pilot_paid'||entry.kind==='repeat_paid'||entry.kind==='refund')&&!(entry.cents>0))||
    (['qualified_conversation','outcome_delivered'].includes(entry.kind)&&entry.cents!==null)||
    (entry.kind==='unit_cost'&&entry.cents===null))fail('EVIDENCE_INVALID');
}
function isPrivate(pathName){
  const parent=path.dirname(pathName);fs.mkdirSync(parent,{recursive:true,mode:0o700});
  const info=fs.lstatSync(parent);if(!info.isDirectory()||info.isSymbolicLink())fail('EVIDENCE_PATH_UNSAFE');
  const resolved=fs.realpathSync(parent);if(resolved!==path.resolve(parent))fail('EVIDENCE_PATH_UNSAFE');
  if(process.platform!=='win32'&&((info.mode&0o077)!==0||(typeof process.getuid==='function'&&info.uid!==process.getuid())))fail('EVIDENCE_PATH_UNSAFE');
  if(fs.existsSync(pathName)){
    const stat=fs.lstatSync(pathName);
    if(!stat.isFile()||stat.isSymbolicLink())fail('EVIDENCE_PATH_UNSAFE');
    if(process.platform!=='win32'&&(stat.mode&0o077)!==0)fail('EVIDENCE_PATH_UNSAFE');
  }
}
function writeFile(filename,contents,exclusive=false){
  isPrivate(filename);
  if(exclusive){const fd=fs.openSync(filename,'wx',0o600);try{fs.writeFileSync(fd,contents);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return;}
  const temp=filename+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
  try{const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,contents);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,filename);
    if(process.platform!=='win32'){const dirfd=fs.openSync(path.dirname(filename),'r');try{fs.fsyncSync(dirfd);}finally{fs.closeSync(dirfd);}}
  }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
function openProofBook({filename,chainKey,reviewKeyHash,recipes,clock=Date.now}={}){
  if(typeof filename!=='string'||!path.isAbsolute(filename)||!Buffer.isBuffer(chainKey)||chainKey.length!==32||
    !isDigest(reviewKeyHash)||!Array.isArray(recipes)||!recipes.length||typeof clock!=='function')fail('EVIDENCE_CONFIG_INVALID');
  const ids=new Set(recipes.map(r=>validateRecipe(r).id));if(ids.size!==recipes.length)fail('EVIDENCE_CONFIG_INVALID');
  const secret=Buffer.from(chainKey);
  function seal(data){return JSON.stringify({...data,tag:mac(secret,data)},null,2)+'\n';}
  const base={schemaVersion:1,reviewerKeyHash:reviewKeyHash,createdAt:new Date(clock()).toISOString(),events:[]};
  isPrivate(filename);
  if(!fs.existsSync(filename))writeFile(filename,seal(base),true);
  function load(){
    isPrivate(filename);
    let body;try{const stat=fs.statSync(filename);if(stat.size>2000000)fail('EVIDENCE_TAMPERED');body=JSON.parse(fs.readFileSync(filename,'utf8'));}catch{fail('EVIDENCE_TAMPERED');}
    if(!body||typeof body!=='object'||Object.keys(body).sort().join('|')!=='createdAt|events|reviewerKeyHash|schemaVersion|tag'||
      body.schemaVersion!==1||body.reviewerKeyHash!==reviewKeyHash||!Array.isArray(body.events)||body.events.length>10000||!isDigest(body.tag))fail('EVIDENCE_TAMPERED');
    const {tag,...data}=body,expected=mac(secret,data);
    if(!crypto.timingSafeEqual(Buffer.from(tag,'hex'),Buffer.from(expected,'hex')))fail('EVIDENCE_TAMPERED');
    const references=new Set();for(const [i,e] of body.events.entries()){
      if(!e||e.seq!==i+1||!ids.has(e.recipeId)||!isDigest(e.referenceHash)||references.has(e.referenceHash)||
        !isDigest(e.buyerHash)||typeof e.attested!=='boolean'||!sorts.includes(e.kind)||!['external','synthetic'].includes(e.origin)||
        (e.attested&&e.origin!=='external'))fail('EVIDENCE_TAMPERED');references.add(e.referenceHash);
    }
    return data;
  }
  function lockAndApply(mutate){
    const lock=filename+'.lock';let fd;
    try{fd=fs.openSync(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')fail('EVIDENCE_LOCKED');throw e;}
    try{const data=load(),out=mutate(data);writeFile(filename,seal(data));return out;}
    finally{fs.closeSync(fd);fs.unlinkSync(lock);}
  }
  load();
  return Object.freeze({
    record(entry){validateEvent(entry,ids);return lockAndApply(data=>{
      if(data.events.length>=10000)fail('EVIDENCE_CAPACITY');
      if(data.events.some(e=>e.referenceHash===entry.referenceHash))fail('EVIDENCE_DUPLICATE');
      const row={seq:data.events.length+1,...entry,attested:false,createdAt:new Date(clock()).toISOString()};
      data.events.push(row);return {...row};
    });},
    attest(seq,reviewerKey){
      if(!Number.isSafeInteger(seq)||seq<1||!Buffer.isBuffer(reviewerKey)||reviewerKey.length!==32)fail('REVIEW_UNAUTHORIZED');
      const expected=Buffer.from(reviewKeyHash,'hex'),got=Buffer.from(sha(reviewerKey),'hex');
      if(!crypto.timingSafeEqual(expected,got))fail('REVIEW_UNAUTHORIZED');
      return lockAndApply(data=>{
        const row=data.events[seq-1];if(!row)fail('EVIDENCE_UNKNOWN');
        if(row.origin!=='external')fail('EVIDENCE_INELIGIBLE');
        if(!row.attested){row.attested=true;row.attestedAt=new Date(clock()).toISOString();}
        return {...row};
      });
    },
    events(recipeId){if(!ids.has(recipeId))fail('EVIDENCE_INVALID');return load().events.filter(e=>e.recipeId===recipeId).map(e=>({...e}));},
    report(recipeId){if(!ids.has(recipeId))fail('EVIDENCE_INVALID');return evaluateEvidence(recipeId,load().events);},
    allReports(){const rows=load().events;return [...ids].sort().map(id=>evaluateEvidence(id,rows));}
  });
}
module.exports={openProofBook};
