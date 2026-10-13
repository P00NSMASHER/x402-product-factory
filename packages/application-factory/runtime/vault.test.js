"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
let openVault;
try{({openVault}=require('./vault'));}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
const pdf=Buffer.from('%PDF-1.7\nSynthetic document only\n%%EOF\n');
const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.from('synthetic image')]);
const jpg=Buffer.concat([Buffer.from('ffd8ff','hex'),Buffer.from('synthetic image'),Buffer.from('ffd9','hex')]);
const KEY=crypto.createHash('sha256').update('synthetic-fixture-vault-key').digest();
function setup(t,options={}){
  assert.equal(typeof openVault,'function','an encrypted document vault must exist');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-vault-test-'));
  const filename=path.join(dir,'vault.sqlite');
  const opened=[];
  const open=(overrides={})=>{const store=openVault({filename,key:KEY,...options,...overrides});opened.push(store);return store;};
  const vault=open();
  t.after(()=>{for(const v of opened)try{v.close();}catch{}fs.rmSync(dir,{recursive:true,force:true});});
  return {vault,open,filename,dir};
}
function input(extra={}){
  return {tenantId:'tenant-a',workspaceId:'supplier-desk',recordId:'r1',
    requirementId:'insurance',name:'insurance.pdf',mediaType:'application/pdf',
    requestKey:'request-1',bytes:pdf,...extra};
}
test('encrypts bytes, persists them across restart, and does not expose them in metadata',t=>{
  const x=setup(t);const saved=x.vault.put(input());
  assert.match(saved.id,/^[0-9a-f]{32}$/);
  assert.equal(saved.name,'insurance.pdf');assert.equal(saved.size,pdf.length);
  assert.equal(saved.sha256,crypto.createHash('sha256').update(pdf).digest('hex'));
  assert.equal(Object.hasOwn(saved,'bytes'),false);
  assert.equal(x.vault.list({tenantId:'tenant-a',workspaceId:'supplier-desk'}).length,1);
  assert.equal(x.vault.list({tenantId:'tenant-a',workspaceId:'supplier-desk'})[0].bytes,undefined);
  assert.equal(fs.readFileSync(x.filename).includes(pdf),false);
  x.vault.close();
  const reopened=x.open(),read=reopened.read({tenantId:'tenant-a',workspaceId:'supplier-desk',id:saved.id});
  assert.deepEqual(read.bytes,pdf);assert.equal(read.metadata.sha256,saved.sha256);
});
test('does not expose documents across tenants or workspaces even with a correct document ID',t=>{
  const x=setup(t);const item=x.vault.put(input());
  for(const scope of [{tenantId:'tenant-b',workspaceId:'supplier-desk'},
    {tenantId:'tenant-a',workspaceId:'agency-intake'}]){
    assert.deepEqual(x.vault.list(scope),[]);
    assert.throws(()=>x.vault.read({...scope,id:item.id}),/NOT_FOUND/);
    assert.equal(x.vault.remove({...scope,id:item.id}),false);
  }
  assert.deepEqual(x.vault.read({tenantId:'tenant-a',workspaceId:'supplier-desk',id:item.id}).bytes,pdf);
});
test('retains one record for a retried upload and refuses conflicting idempotency keys',t=>{
  const x=setup(t),first=x.vault.put(input());
  assert.deepEqual(x.vault.put(input({bytes:Buffer.from(pdf)})),first);
  assert.equal(x.vault.list({tenantId:'tenant-a',workspaceId:'supplier-desk'}).length,1);
  assert.throws(()=>x.vault.put(input({bytes:Buffer.concat([pdf,Buffer.from('changed')])})),/IDEMPOTENCY_CONFLICT/);
  assert.throws(()=>x.vault.put(input({name:'renamed.pdf'})),/IDEMPOTENCY_CONFLICT/);
});
test('independent tenant may reuse the same request key without collision',t=>{
  const x=setup(t);const a=x.vault.put(input()),b=x.vault.put(input({tenantId:'tenant-b'}));
  assert.notEqual(a.id,b.id);
  assert.equal(x.vault.list({tenantId:'tenant-b',workspaceId:'supplier-desk'}).length,1);
});
test('accepts bounded PDF PNG and JPEG signatures without trusting a filename extension',t=>{
  const x=setup(t);const list=[
    input({requestKey:'pdf',bytes:pdf,name:'sample.pdf'}),
    input({requestKey:'png',bytes:png,name:'photo.png',mediaType:'image/png'}),
    input({requestKey:'jpeg',bytes:jpg,name:'photo.jpg',mediaType:'image/jpeg'})
  ];
  for(const item of list)assert.equal(x.vault.put(item).mediaType,item.mediaType);
  assert.equal(x.vault.list({tenantId:'tenant-a',workspaceId:'supplier-desk'}).length,3);
});
test('rejects disallowed executable formats and false content signatures',t=>{
  const x=setup(t);
  for(const bad of [input({mediaType:'text/html'}),input({name:'shell.exe'}),
    input({bytes:Buffer.from('<script>evil</script>')}),input({mediaType:'image/png'}),
    input({name:'../private.pdf'}),input({name:'x\\evil.pdf'}),input({name:'x\nfoo.pdf'})]){
    assert.throws(()=>x.vault.put(bad),/DOCUMENT_INVALID/);
  }
  assert.deepEqual(x.vault.list({tenantId:'tenant-a',workspaceId:'supplier-desk'}),[]);
});
test('rejects empty and oversized uploads before creating any record',t=>{
  const x=setup(t);
  for(const bytes of [Buffer.alloc(0),Buffer.concat([pdf,Buffer.alloc(262144)])])
    assert.throws(()=>x.vault.put(input({bytes})),/DOCUMENT_TOO_LARGE|DOCUMENT_INVALID/);
  assert.deepEqual(x.vault.list({tenantId:'tenant-a',workspaceId:'supplier-desk'}),[]);
});
test('tenant byte quotas reject excess uploads without partial writes',t=>{
  const x=setup(t,{maxBytesPerTenant:pdf.length+5});x.vault.put(input());
  assert.throws(()=>x.vault.put(input({requestKey:'second'})),/DOCUMENT_QUOTA/);
  assert.equal(x.vault.list({tenantId:'tenant-a',workspaceId:'supplier-desk'}).length,1);
});
test('ciphertext corruption is detected and never returned as plaintext',t=>{
  const x=setup(t),saved=x.vault.put(input());
  const db=new DatabaseSync(x.filename);
  db.prepare('UPDATE vault_documents SET ciphertext=? WHERE id=?').run(Buffer.from('tampered data'),saved.id);db.close();
  assert.throws(()=>x.vault.read({tenantId:'tenant-a',workspaceId:'supplier-desk',id:saved.id}),/DOCUMENT_INTEGRITY/);
});
test('wrong encryption key fails closed without deleting or altering persisted records',t=>{
  const x=setup(t),item=x.vault.put(input());x.vault.close();
  const other=x.open({key:crypto.randomBytes(32)});
  assert.throws(()=>other.read({tenantId:'tenant-a',workspaceId:'supplier-desk',id:item.id}),/DOCUMENT_INTEGRITY/);
  assert.equal(other.list({tenantId:'tenant-a',workspaceId:'supplier-desk'}).length,1);
});
test('delete is scoped and idempotent; revoked content cannot be downloaded',t=>{
  const x=setup(t),item=x.vault.put(input());
  assert.equal(x.vault.remove({tenantId:'tenant-a',workspaceId:'supplier-desk',id:item.id}),true);
  assert.equal(x.vault.remove({tenantId:'tenant-a',workspaceId:'supplier-desk',id:item.id}),false);
  assert.throws(()=>x.vault.read({tenantId:'tenant-a',workspaceId:'supplier-desk',id:item.id}),/NOT_FOUND/);
});
test('refuses invalid tenant/workspace identity and arbitrary supplied fields',t=>{
  const x=setup(t);
  for(const bad of [input({tenantId:'../other'}),input({workspaceId:'../other'}),
    input({recordId:'../r1'}),input({requirementId:'../req'}),input({requestKey:'?' }),
    input({shell:'run'})])assert.throws(()=>x.vault.put(bad),/DOCUMENT_INVALID/);
});
test('requires a caller-provided 256-bit encryption key and an absolute private storage path',()=>{
  assert.equal(typeof openVault,'function');
  assert.throws(()=>openVault({filename:'relative.sqlite',key:KEY}),/VAULT_CONFIG_INVALID/);
  assert.throws(()=>openVault({filename:'/tmp/example-vault-invalid.sqlite',key:Buffer.alloc(12)}),/VAULT_CONFIG_INVALID/);
});
test('rejects symbolic-link storage and unsupported schema instead of creating replacement evidence',t=>{
  const x=setup(t);x.vault.close();const target=path.join(x.dir,'link.sqlite');fs.symlinkSync(x.filename,target);
  assert.throws(()=>openVault({filename:target,key:KEY}),/STATE_PATH_UNSAFE/);
  fs.unlinkSync(target);
  const db=new DatabaseSync(x.filename);db.exec('PRAGMA user_version=99');db.close();
  assert.throws(()=>openVault({filename:x.filename,key:KEY}),/SCHEMA_UNSUPPORTED/);
});
test('vault file uses owner-private permissions on POSIX',t=>{
  const x=setup(t);if(process.platform!=='win32')assert.equal(fs.statSync(x.filename).mode&0o777,0o600);
});
