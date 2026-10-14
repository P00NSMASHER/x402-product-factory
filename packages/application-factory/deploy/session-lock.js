'use strict';
// Local crash-reclaimable private session ownership. Never grants external access.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const fail=code=>{throw Error(code);};
function live(pid){
 try{process.kill(pid,0);return true;}
 catch(e){if(e.code==='ESRCH')return false;return true;}
}
function acquireSession(root){
 if(typeof root!=='string'||!path.isAbsolute(root))fail('SESSION_LOCK_UNSAFE');
 const resolved=path.resolve(root),stat=fs.lstatSync(resolved);
 if(!stat.isDirectory()||stat.isSymbolicLink()||fs.realpathSync(resolved)!==resolved||
   (process.platform!=='win32'&&((stat.mode&0o077)!==0||
    (typeof process.getuid==='function'&&stat.uid!==process.getuid()))))
   fail('SESSION_LOCK_UNSAFE');
 const file=path.join(resolved,'.factory-private-session-owner.json');
 if(fs.existsSync(file)){
  const existing=fs.lstatSync(file);
  if(!existing.isFile()||existing.isSymbolicLink()||existing.size>1000||
    existing.size<30||(process.platform!=='win32'&&(existing.mode&0o077)!==0))
   fail('SESSION_LOCK_UNSAFE');
  let row;try{row=JSON.parse(fs.readFileSync(file,'utf8'));}
  catch{fail('SESSION_LOCK_UNSAFE');}
  if(!row||row.kind!=='private-fleet-session-owner'||!Number.isSafeInteger(row.pid)||
    row.pid<1||typeof row.nonce!=='string'||!/^[a-f0-9]{32}$/.test(row.nonce))
   fail('SESSION_LOCK_UNSAFE');
  if(live(row.pid))fail('SESSION_ALREADY_ACTIVE');
  // Dead process means its bound localhost listeners are gone. Fail closed on
  // unlink race as far as the single-host filesystem exposes it.
  if(fs.lstatSync(file).ino!==existing.ino)fail('SESSION_LOCK_RACE');
  fs.unlinkSync(file);
 }
 const nonce=crypto.randomBytes(16).toString('hex');
 const body={kind:'private-fleet-session-owner',pid:process.pid,nonce};
 let fd;
 try{fd=fs.openSync(file,'wx',0o600);
  fs.writeFileSync(fd,JSON.stringify(body)+'\n');fs.fsyncSync(fd);
 }catch(e){if(e.code==='EEXIST')fail('SESSION_ALREADY_ACTIVE');throw e;}
 finally{if(fd!==undefined)fs.closeSync(fd);}
 let released=false;
 function release(){
  if(released)return;released=true;
  if(!fs.existsSync(file))return;
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1000)fail('SESSION_LOCK_UNSAFE');
  let present;try{present=JSON.parse(fs.readFileSync(file,'utf8'));}
  catch{fail('SESSION_LOCK_UNSAFE');}
  if(present.kind!==body.kind||present.pid!==body.pid||present.nonce!==nonce)
   fail('SESSION_LOCK_OWNERSHIP_CHANGED');
  fs.unlinkSync(file);
 }
 return {file,release,reclaimedDeadOwner:true};
}
module.exports={acquireSession};
