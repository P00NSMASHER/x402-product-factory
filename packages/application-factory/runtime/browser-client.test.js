"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'browser-transport.js'),moduleValue=fs.existsSync(file)?require(file):{};
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
async function setup(overrides={}){
  assert.equal(typeof moduleValue.createConnection,'function','resilient browser transport must exist');
  const calls=[];let mode='ok',release;
  const c=moduleValue.createConnection({uuid:()=> 'test-key',onUnauthorized:overrides.onUnauthorized,
    fetchImpl:async(url,opts)=>{calls.push({url,opts});
      if(url==='/app/api/session')return response({csrfToken:'csrf-a',expiresAt:Date.now()+100000});
      if(mode==='network')throw new Error('connection reset');
      if(mode==='blocked')return new Promise(resolve=>release=resolve);
      if(mode==='unauthorized')return response({error:'UNAUTHORIZED'},401);
      if(mode==='conflict')return response({error:'VERSION_CONFLICT'},409);
      if(mode==='invalid-json')return {ok:true,status:200,json:async()=>{throw new Error('truncated');}};
      return response({version:1,result:{id:'r1'}});
    }});
  await c.login('a'.repeat(43));return {c,calls,setMode:value=>mode=value,release:value=>release(value)};
}
test('uncertain write retains exact command body and idempotency key for retry',async()=>{
  const x=await setup(),command={type:'add',name:'Once',dueOn:'2026-10-13'};x.setMode('network');
  await assert.rejects(()=>x.c.command('supplier-desk',command,0),/NETWORK_UNCERTAIN/);assert.equal(x.c.hasPending(),true);
  command.name='mutated locally';x.setMode('ok');await x.c.retry();
  const writes=x.calls.filter(c=>c.url.endsWith('/commands'));assert.equal(writes.length,2);
  assert.equal(writes[0].opts.body,writes[1].opts.body);assert.equal(writes[0].opts.headers['Idempotency-Key'],writes[1].opts.headers['Idempotency-Key']);
  assert.equal(x.c.hasPending(),false);
});
test('new writes are blocked while an uncertain write awaits reconciliation',async()=>{
  const x=await setup();x.setMode('network');await assert.rejects(()=>x.c.command('supplier-desk',{type:'archive',recordId:'r1'}));
  await assert.rejects(()=>x.c.command('agency-intake',{type:'archive',recordId:'r2'}),/WRITE_PENDING/);
});
test('definite conflicts clear pending state but never silently retry a changed command',async()=>{
  const x=await setup();x.setMode('conflict');await assert.rejects(()=>x.c.command('supplier-desk',{type:'archive',recordId:'r1'}),/VERSION_CONFLICT/);
  assert.equal(x.c.hasPending(),false);assert.equal(x.calls.filter(c=>c.url.endsWith('/commands')).length,1);
});
test('invalid JSON on a successful response is uncertain rather than a fresh-write permission',async()=>{
  const x=await setup();x.setMode('invalid-json');await assert.rejects(()=>x.c.command('supplier-desk',{type:'archive',recordId:'r1'}),/NETWORK_UNCERTAIN/);
  assert.equal(x.c.hasPending(),true);
});
test('unauthorized read clears session and pending work before another account signs in',async()=>{
  let count=0;const x=await setup({onUnauthorized:()=>count++});x.setMode('unauthorized');
  await assert.rejects(()=>x.c.read('/app/api/workspaces'),/UNAUTHORIZED/);assert.equal(count,1);assert.equal(x.c.hasPending(),false);
  assert.equal(x.c.isAuthenticated(),false);
});
test('late responses after disconnect cannot restore another session',async()=>{
  const x=await setup();x.setMode('blocked');const late=x.c.read('/app/api/workspaces');x.c.disconnect();
  x.release(response([{id:'private-a'}]));await assert.rejects(()=>late,/STALE_RESPONSE/);assert.equal(x.c.isAuthenticated(),false);
});
test('transport cannot attach credentials or CSRF to an external URL',async()=>{
  const x=await setup();await assert.rejects(()=>x.c.read('https://hostile.example/steal'),/PATH_INVALID/);
  assert.equal(x.calls.length,1);assert.equal(x.calls[0].opts.credentials,'same-origin');assert.equal(x.calls[0].opts.redirect,'error');
});
test('browser client has no persistent credential storage or dynamic HTML insertion',()=>{
  const file=path.join(__dirname,'browser-client.js');assert.equal(fs.existsSync(file),true);
  const s=fs.readFileSync(file,'utf8');assert.doesNotMatch(s,/localStorage|sessionStorage|innerHTML|insertAdjacentHTML|document\.write/);
  assert.match(s,/textContent/);
});
test('a late logout response cannot disconnect a newer successful login',async()=>{
  const x=await setup();x.setMode('blocked');const stale=x.c.logout();await x.c.login('a'.repeat(43));
  x.release(response({signedOut:true}));await assert.rejects(()=>stale,/STALE_RESPONSE/);assert.equal(x.c.isAuthenticated(),true);
});

test('attachment upload sends bounded binary data with CSRF and stable idempotency key',async()=>{
  const x=await setup(),bytes=Uint8Array.from(Buffer.from('%PDF-1.7\nsynthetic\n%%EOF'));
  x.setMode('network');
  await assert.rejects(()=>x.c.upload('supplier-desk','r1','insurance',{name:'policy.pdf',mediaType:'application/pdf',bytes}),/NETWORK_UNCERTAIN/);
  assert.equal(x.c.hasPending(),true);x.setMode('ok');await x.c.retry();
  const sends=x.calls.filter(c=>c.url.endsWith('/documents'));
  assert.equal(sends.length,2);
  assert.equal(sends[0].opts.headers['Content-Type'],'application/octet-stream');
  assert.equal(sends[0].opts.headers['X-Record-Id'],'r1');
  assert.equal(sends[0].opts.headers['X-Requirement-Id'],'insurance');
  assert.equal(sends[0].opts.headers['X-Document-Name'],'policy.pdf');
  assert.equal(sends[0].opts.headers['X-Document-Type'],'application/pdf');
  assert.equal(sends[0].opts.headers['X-CSRF-Token'],'csrf-a');
  assert.equal(sends[0].opts.headers['Idempotency-Key'],sends[1].opts.headers['Idempotency-Key']);
  assert.equal(sends[0].opts.body,sends[1].opts.body);
  assert.equal(x.c.hasPending(),false);
});
test('unresolved upload blocks other writes and logout clears its sensitive byte buffer',async()=>{
  const x=await setup(),bytes=Uint8Array.from(Buffer.from('%PDF-1.7\nsynthetic\n%%EOF'));x.setMode('network');
  await assert.rejects(()=>x.c.upload('supplier-desk','r1','insurance',{name:'policy.pdf',mediaType:'application/pdf',bytes}),/NETWORK_UNCERTAIN/);
  await assert.rejects(()=>x.c.command('supplier-desk',{type:'archive',recordId:'r1'}),/WRITE_PENDING/);
  x.c.disconnect();assert.equal(x.c.hasPending(),false);
});
test('pilot login sends explicit synthetic consent, never puts access codes in URLs and uses normal session state',async()=>{
 const calls=[];const c=moduleValue.createConnection({fetchImpl:async(url,opts)=>{calls.push({url,opts});return response({csrfToken:'pilot-csrf',expiresAt:10000});}});
 assert.equal(typeof c.loginPilot,'function');await c.loginPilot('z'.repeat(43),true);assert.equal(c.isAuthenticated(),true);
 assert.equal(calls[0].url,'/app/api/pilot');assert.deepEqual(JSON.parse(calls[0].opts.body),{inviteCode:'z'.repeat(43),consent:true});assert.equal(calls[0].opts.credentials,'same-origin');
});
