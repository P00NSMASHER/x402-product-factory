'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
let createCampaign;try{({createCampaign}=require('./campaign'));}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
const recipes=require('../recipes.json');
const asOf='2026-10-13',KEY=Buffer.alloc(32,13);
const company=(name='Keystone Distribution',domain='example-operations.org')=>({company:name,homepage:'https://'+domain,recipeId:'supplier-desk',observations:[{url:'https://'+domain+'/overview',observedOn:asOf,signal:'business_category',note:'Website identifies the business as an industrial supplier.'}]});
function setup(t){assert.equal(typeof createCampaign,'function');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-acquisition-state-'));let date=asOf;
  const filename=path.join(dir,'campaign.json'),opened=[];const open=(key=KEY)=>{const c=createCampaign({filename,key,recipes,clock:()=>Date.parse(date+'T12:00:00Z')});opened.push(c);return c;};
  const campaign=open();t.after(()=>{opened.forEach(c=>c.close());fs.rmSync(dir,{force:true,recursive:true});});return {campaign,open,filename,setDate:d=>date=d};}
test('imports public company only and reopens HMAC-protected private state',t=>{
  const s=setup(t),first=s.campaign.importTargets([company()]);assert.equal(first.added,1);
  const text=fs.readFileSync(s.filename,'utf8');assert.ok(!text.includes('private@example.com'));
  if(process.platform!=='win32')assert.equal(fs.statSync(s.filename).mode&0o777,0o600);
  const again=s.open();assert.equal(again.report().targets,1);assert.equal(again.report().realCustomers,null);
});
test('repeat imports never duplicate account records or erase suppression',t=>{
  const s=setup(t);s.campaign.importTargets([company()]);s.campaign.record({domain:'example-operations.org',kind:'do_not_contact',key:'suppression-1'});
  assert.equal(s.campaign.importTargets([company()]).added,0);
  assert.equal(s.campaign.report().suppressed,1);assert.deepEqual(s.campaign.nextActions(),[]);
});
test('outreach cannot be recorded before human review and never triggers a send',t=>{
  const s=setup(t);s.campaign.importTargets([company()]);
  assert.throws(()=>s.campaign.record({domain:'example-operations.org',kind:'reported_outreach',key:'send-1'}),/CAMPAIGN_SEQUENCE/);
  s.campaign.record({domain:'example-operations.org',kind:'reviewed',key:'review-1'});
  const sent=s.campaign.record({domain:'example-operations.org',kind:'reported_outreach',key:'send-1'});
  assert.equal(sent.kind,'reported_outreach');assert.equal(s.campaign.report().operatorReportedOutreach,1);
  assert.equal(s.campaign.report().transmittedMessages,0);assert.equal(s.campaign.report().realCustomers,null);
});
test('idempotent operation replay cannot inflate progression and conflicting key fails',t=>{
  const s=setup(t);s.campaign.importTargets([company()]);const event={domain:'example-operations.org',kind:'reviewed',key:'review-1'};
  const a=s.campaign.record(event);assert.deepEqual(s.campaign.record({...event}),a);
  assert.equal(s.campaign.report().reviewed,1);
  assert.throws(()=>s.campaign.record({...event,kind:'reported_reply'}),/CAMPAIGN_CONFLICT/);
});
test('reported replies and interest require sequence, never become verified demand evidence',t=>{
  const s=setup(t);s.campaign.importTargets([company()]);
  assert.throws(()=>s.campaign.record({domain:'example-operations.org',kind:'reported_pilot_interest',key:'interest-a'}),/CAMPAIGN_SEQUENCE/);
  s.campaign.record({domain:'example-operations.org',kind:'reviewed',key:'a'});
  s.campaign.record({domain:'example-operations.org',kind:'reported_outreach',key:'b'});
  assert.throws(()=>s.campaign.record({domain:'example-operations.org',kind:'reported_pilot_interest',key:'interest-b'}),/CAMPAIGN_SEQUENCE/);
  s.campaign.record({domain:'example-operations.org',kind:'reported_reply',key:'c'});
  s.campaign.record({domain:'example-operations.org',kind:'reported_pilot_interest',key:'d'});
  const report=s.campaign.report();assert.equal(report.operatorReportedPilotInterest,1);
  assert.equal(report.independentlyVerifiedBuyerDemand,null);assert.equal(report.checkoutEnabled,false);
});
test('do not contact suppresses future reviews even if imported again',t=>{
  const s=setup(t);s.campaign.importTargets([company()]);s.campaign.record({domain:'example-operations.org',kind:'do_not_contact',key:'stop'});
  assert.throws(()=>s.campaign.record({domain:'example-operations.org',kind:'reviewed',key:'after-stop'}),/CAMPAIGN_SUPPRESSED/);
  assert.equal(s.campaign.importTargets([company()]).added,0);assert.deepEqual(s.campaign.nextActions(),[]);
});
test('not_interested blocks follow-ups while a new website never resets that outcome',t=>{
  const s=setup(t);s.campaign.importTargets([company()]);s.campaign.record({domain:'example-operations.org',kind:'not_interested',key:'stop'});
  assert.deepEqual(s.campaign.nextActions(),[]);
  assert.equal(s.campaign.report().suppressed,1);
});
test('automated follow-up only recommends review after seven days and never messages',t=>{
  const s=setup(t);s.campaign.importTargets([company()]);s.campaign.record({domain:'example-operations.org',kind:'reviewed',key:'a'});
  s.campaign.record({domain:'example-operations.org',kind:'reported_outreach',key:'b'});
  assert.equal(s.campaign.nextActions().length,0);
  s.setDate('2026-10-20');assert.equal(s.campaign.nextActions()[0].action,'review_followup');
  assert.equal(s.campaign.nextActions()[0].sendEnabled,false);
  s.campaign.record({domain:'example-operations.org',kind:'reported_reply',key:'c'});
  assert.equal(s.campaign.nextActions()[0].action,'review_buyer_reply');
});
test('tampered state wrong key and symlink state fail closed',t=>{
  const s=setup(t);s.campaign.importTargets([company()]);s.campaign.close();
  assert.throws(()=>s.open(crypto.randomBytes(32)),/CAMPAIGN_TAMPERED/);
  const old=fs.readFileSync(s.filename,'utf8');fs.writeFileSync(s.filename,old.replace('Keystone Distribution','Other Name'));
  assert.throws(()=>s.open(),/CAMPAIGN_TAMPERED/);
});
test('unknown URLs and personal data are rejected before any ledger modifications',t=>{
  const s=setup(t);for(const candidate of [{...company(),email:'real@company.com'},company('Unsafe','localhost')])
    assert.throws(()=>s.campaign.importTargets([candidate]),/TARGET_INVALID/);
  assert.equal(s.campaign.report().targets,0);
});
test('bounded campaign rejects more than 300 candidates and no partial import occurs',t=>{
  const s=setup(t),targets=Array.from({length:301},(_,i)=>company('Corp '+i,'org'+i+'.com'));
  assert.throws(()=>s.campaign.importTargets(targets),/TARGET_CAPACITY/);assert.equal(s.campaign.report().targets,0);
});
test('invalid config and forged events fail closed without changes',t=>{
  const s=setup(t);s.campaign.importTargets([company()]);
  for(const extra of [{recipient:'person@example.com'},{paid:true},{send:true},{kind:'pilot_paid'}])
    assert.throws(()=>s.campaign.record({domain:'example-operations.org',kind:'reviewed',key:'x',...extra}),/CAMPAIGN_EVENT_INVALID/);
  assert.equal(s.campaign.report().reviewed,0);
});
