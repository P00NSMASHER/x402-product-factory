'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {openProofBook}=require('./book');
const recipes=require('../recipes.json');
const chainKey=Buffer.alloc(32,23),reviewKey=Buffer.alloc(32,79);
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-growth-proof-')),
 filename=path.join(dir,'proof.json'),book=openProofBook({filename,chainKey,reviewKeyHash:hash(reviewKey),recipes});
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {dir,filename,book,reopen:()=>openProofBook({filename,chainKey,reviewKeyHash:hash(reviewKey),recipes})};}
const event=(kind,n=1,overrides={})=>({recipeId:'supplier-desk',kind,
  origin:'external',buyerHash:hash('synthetic-buyer-'+n),referenceHash:hash('synthetic-document-'+n+'-'+kind),
  source:kind.includes('paid')||kind==='refund'?'payment_record':kind==='unit_cost'?'cost_record':kind==='outcome_delivered'?'delivery_record':'interview_record',
  cents:kind.includes('paid')?24900:kind==='unit_cost'?7000:kind==='refund'?24900:null,...overrides});
test('recorded operator observations are unverified by default',t=>{
  const x=setup(t),row=x.book.record(event('qualified_conversation'));assert.equal(row.attested,false);
  assert.equal(x.book.report('supplier-desk').interviews,0);
  assert.equal(x.book.events('supplier-desk').length,1);
  assert.equal(x.book.report('supplier-desk').releaseApproved,false);
});
test('separate reviewer key attests external provenance and survives reopen',t=>{
  const x=setup(t),entry=x.book.record(event('qualified_conversation'));
  assert.throws(()=>x.book.attest(entry.seq,Buffer.alloc(32,40)),/REVIEW_UNAUTHORIZED/);
  assert.equal(x.book.report('supplier-desk').interviews,0);
  const after=x.book.attest(entry.seq,reviewKey);assert.equal(after.attested,true);
  assert.equal(x.reopen().report('supplier-desk').interviews,1);
});
test('synthetic input is forever ineligible for attestation or scale',t=>{
  const x=setup(t),one=x.book.record(event('pilot_paid',1,{origin:'synthetic'}));
  assert.throws(()=>x.book.attest(one.seq,reviewKey),/EVIDENCE_INELIGIBLE/);
  assert.equal(x.book.report('supplier-desk').operatorsReportedGrossCents,0);
});
test('no raw personal identifiers or external documents accepted in ledger',t=>{
  const x=setup(t);for(const key of ['email','customerName','notes','publicURL','rawInvoice']){
    assert.throws(()=>x.book.record({...event('qualified_conversation'),[key]:'Private example'}),/EVIDENCE_INVALID/);
  }
  assert.equal(x.book.events('supplier-desk').length,0);
});
test('exact provenance reference cannot be reused across products or buyers',t=>{
  const x=setup(t),a=event('pilot_paid');x.book.record(a);
  assert.throws(()=>x.book.record(a),/EVIDENCE_DUPLICATE/);
  assert.throws(()=>x.book.record({...a,recipeId:'agency-intake'}),/EVIDENCE_DUPLICATE/);
});
test('ledger tampering fails authenticated read rather than fabricating profit',t=>{
  const x=setup(t);x.book.record(event('pilot_paid'));const raw=fs.readFileSync(x.filename,'utf8');
  fs.writeFileSync(x.filename,raw.replace('24900','9999999'));
  assert.throws(()=>x.reopen(),/EVIDENCE_TAMPERED/);
});
test('wrong chain key cannot open an old ledger',t=>{
  const x=setup(t);x.book.record(event('qualified_conversation'));
  assert.throws(()=>openProofBook({filename:x.filename,chainKey:Buffer.alloc(32,77),reviewKeyHash:hash(reviewKey),recipes}),/EVIDENCE_TAMPERED/);
});
test('reject false financial fields, unsupported source and amounts outside signed integers',t=>{
  const x=setup(t);for(const bad of [event('pilot_paid',1,{cents:null}),event('pilot_paid',1,{cents:-1}),
    event('interview',1),event('pilot_paid',1,{source:'self_claim'}),event('unit_cost',1,{cents:2**54})]){
    assert.throws(()=>x.book.record(bad),/EVIDENCE_INVALID/);
  }
});
test('all input recipe ids are validated and no raw documents are persisted',t=>{
  const x=setup(t);assert.throws(()=>x.book.record(event('pilot_paid',1,{recipeId:'another-product'})),/EVIDENCE_INVALID/);
  assert.equal(fs.readFileSync(x.filename,'utf8').includes('synthetic-buyer'),false);
});
test('reject links and publicly accessible state directories on POSIX',t=>{
  const x=setup(t);fs.symlinkSync(x.filename,path.join(x.dir,'alias.json'));
  assert.throws(()=>openProofBook({filename:path.join(x.dir,'alias.json'),chainKey,reviewKeyHash:hash(reviewKey),recipes}),/EVIDENCE_PATH_UNSAFE/);
  if(process.platform!=='win32'){
    fs.chmodSync(x.dir,0o755);try{assert.throws(()=>x.reopen(),/EVIDENCE_PATH_UNSAFE/);}finally{fs.chmodSync(x.dir,0o700);}
  }
});
test('attesting twice is idempotent and changing stored bytes is not',t=>{
  const x=setup(t),one=x.book.record(event('qualified_conversation'));
  assert.deepEqual(x.book.attest(one.seq,reviewKey),x.book.attest(one.seq,reviewKey));
  assert.equal(x.book.report('supplier-desk').interviews,1);
});
