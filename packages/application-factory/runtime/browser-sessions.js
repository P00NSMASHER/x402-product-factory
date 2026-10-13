"use strict";
const crypto=require('node:crypto');
const COOKIE_NAME='factory_browser_session';
const SESSION_MS=30*60*1000;
const fail=code=>{throw new Error(code);};
const opaque=()=>crypto.randomBytes(32).toString('base64url');
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
// These short-lived sessions are local service state, not persistent customer signup.
function createSessions({validate,clock=Date.now,maxSessions=1000,maxPerCredential=5,maxFailedLogins=20}={}){
  if(typeof validate!=='function'||typeof clock!=='function'||
     ![maxSessions,maxPerCredential,maxFailedLogins].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=1000))fail('SESSION_CONFIG_INVALID');
  const sessions=new Map();let failures=[],lastTime=0;
  function now(){
    const time=clock();
    if(!Number.isSafeInteger(time)||time<lastTime){sessions.clear();fail('UNAUTHORIZED');}
    lastTime=time;
    for(const [id,s] of sessions)if(time>=s.expiresAt)sessions.delete(id);
    failures=failures.filter(n=>time-n<60000);return time;
  }
  function verify(credential){
    if(!validId(credential))fail('UNAUTHORIZED');
    try{validate(credential);}catch{fail('UNAUTHORIZED');}
  }
  return Object.freeze({
    issue(credential){
      const time=now();if(failures.length>=maxFailedLogins)fail('RATE_LIMIT');
      try{verify(credential);}catch(error){failures.push(time);throw error;}
      if(sessions.size>=maxSessions||[...sessions.values()].filter(s=>s.credential===credential).length>=maxPerCredential)fail('SESSION_LIMIT');
      const id=opaque(),csrf=opaque(),expiresAt=time+SESSION_MS;
      sessions.set(id,{credential,csrf,expiresAt});return {id,csrf,expiresAt};
    },
    read(id){
      now();if(!validId(id)||!sessions.has(id))fail('UNAUTHORIZED');const s=sessions.get(id);
      try{verify(s.credential);}catch(error){sessions.delete(id);throw error;}
      return {...s};
    },
    remove(id){sessions.delete(id);},
    clear(){sessions.clear();failures=[];}
  });
}
function cookieId(header){
  if(typeof header!=='string')return null;
  const entries=header.split(';').map(v=>v.trim()).filter(v=>v.startsWith(COOKIE_NAME+'='));
  if(entries.length!==1)return null;const id=entries[0].slice(COOKIE_NAME.length+1);return validId(id)?id:null;
}
// No Secure flag on this strictly loopback-only HTTP candidate. Do not expose publicly.
function sessionCookie(id){return `${COOKIE_NAME}=${id}; Path=/app; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS/1000}`;}
function expiredCookie(){return `${COOKIE_NAME}=; Path=/app; HttpOnly; SameSite=Strict; Max-Age=0`;}
module.exports={createSessions,cookieId,sessionCookie,expiredCookie,SESSION_MS};
