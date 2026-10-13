'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const recipes=require('../recipes.json');
let subject;try{subject=require('./prospecting');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;subject={};}
const asOf='2026-10-13';
const candidate=(overrides={})=>({company:'Keystone Distribution',homepage:'https://www.keystone-example.com',recipeId:'supplier-desk',
  observations:[{url:'https://www.keystone-example.com/about',observedOn:asOf,signal:'business_category',note:'Website categorizes itself as a local distribution business.'}],...overrides});
const another=(company,domain,recipeId='contractor-renewals',signal='business_category')=>candidate({company,homepage:'https://'+domain,recipeId,observations:[{url:'https://'+domain+'/about',observedOn:asOf,signal,note:'Website lists services for organizational customers.'}]});
test('validates and canonicalizes public company observations without network access',()=>{
  const v=subject.validateCandidate(candidate(),recipes,asOf);
  assert.equal(v.domain,'keystone-example.com');assert.equal(v.homepage,'https://keystone-example.com/');
  assert.equal(v.evidenceStatus,'operator_provided_unverified');assert.equal(v.customerVerified,false);
  assert.equal(v.observations[0].signal,'business_category');
});
test('rejects personal contact fields, forged commercial or qualification status and extra fields',()=>{
  for(const extra of [{email:'person@company.com'},{phone:'555-1212'},{customerVerified:true},{status:'paid'},{score:900},{source:'trusted'}])
    assert.throws(()=>subject.validateCandidate(candidate(extra),recipes,asOf),/TARGET_INVALID/);
});
test('rejects embedded contact info and markup in public observations and company names',()=>{
  const base=candidate();const cases=[
    candidate({company:'<script>alert(1)</script>'}),candidate({company:'Test\r\nBcc: hidden@corp.com'}),
    candidate({observations:[{...base.observations[0],note:'Reach bob@corp.com for purchasing details.'}]}),
    candidate({observations:[{...base.observations[0],note:'Call 555-867-5309 to discuss private bids.'}]})];
  for(const bad of cases)assert.throws(()=>subject.validateCandidate(bad,recipes,asOf),/TARGET_INVALID/);
});
test('rejects unsafe URLs, IPs, internal hosts, port overrides, credentials and query parameters',()=>{
  for(const homepage of ['http://example.com','https://localhost','https://127.0.0.1',
    'https://[::1]/','https://user:pass@example.com','https://example.com:8080/',
    'https://example.com?q=x','https://example.internal','https://test.local','https://example.com/#secret'])
    assert.throws(()=>subject.validateCandidate(candidate({homepage}),recipes,asOf),/TARGET_INVALID/);
});
test('source URL must be valid HTTPS, dated, and not older than 180 days',()=>{
  const base=candidate();for(const [url,observedOn] of [['http://x.com/a',asOf],['https://x.com/a?email=b',asOf],
    ['https://x.com','2026-03-01'],['https://x.com','2026-10-14'],['https://x.com','2026-02-30']]){
    assert.throws(()=>subject.validateCandidate(candidate({observations:[{...base.observations[0],url,observedOn}]}),recipes,asOf),/TARGET_INVALID/);
  }
});
test('unknown segments and fake signal enums fail closed',()=>{
  assert.throws(()=>subject.validateCandidate(candidate({recipeId:'product-025'}),recipes,asOf),/TARGET_INVALID/);
  const bad=candidate();bad.observations[0].signal='buyers_are_interested';
  assert.throws(()=>subject.validateCandidate(bad,recipes,asOf),/TARGET_INVALID/);
});
test('repeated domains and excess target count fail before a draft is produced',()=>{
  assert.throws(()=>subject.planTargets([candidate(),candidate({homepage:'https://keystone-example.com/'})],recipes,asOf),/TARGET_DUPLICATE/);
  const targets=Array.from({length:301},(_,i)=>another('Company '+i,'source'+i+'.example.com'));
  assert.throws(()=>subject.planTargets(targets,recipes,asOf),/TARGET_CAPACITY/);
});
test('100 distinct companies become deterministic ranked opportunities with explicit unknown demand',()=>{
  const targets=Array.from({length:100},(_,i)=>another('Company '+i,'source'+i+'.example.com','contractor-renewals',i%2?'renewal_process':'business_category'));
  const a=subject.planTargets(targets,recipes,asOf),b=subject.planTargets([...targets].reverse(),recipes,asOf);
  assert.deepEqual(a,b);assert.equal(a.targets.length,100);assert.equal(a.realCustomers,null);
  assert.equal(a.collectedRevenue,null);assert.equal(a.checkoutEnabled,false);assert.equal(a.outreachEnabled,false);
  assert.ok(a.targets.every(t=>t.demandVerified===false&&t.researchPriority>=0));
});
test('three industry editions generate differentiated discovery and clear release gates',()=>{
  const kits=recipes.map(r=>subject.buildDiscoveryKit(r));
  assert.equal(new Set(kits.map(k=>k.recipeId)).size,3);
  for(const kit of kits){assert.ok(kit.questions.length>=5);assert.equal(kit.outreachEnabled,false);
    assert.equal(kit.priceCents,null);assert.equal(kit.realCustomers,null);assert.equal(kit.contactCollectionEnabled,false);
    assert.ok(kit.releaseChecklist.includes('Independent security and privacy release review'));}
  assert.notEqual(kits[0].questions[1],kits[1].questions[1]);
});
test('drafts are truthful, evidence-neutral and require a reviewed sender/opt-out identity before external use',()=>{
  const plan=subject.planTargets([candidate()],recipes,asOf),t=plan.targets[0];
  assert.equal(t.outreachDrafts.length,3);
  for(const draft of t.outreachDrafts){assert.match(draft.body,/exploring|research|question|follow/i);
    assert.doesNotMatch(draft.body,/guarantee|your (team|company) struggles|we noticed you|we already work with|verified savings/i);}
  assert.ok(plan.releaseChecklist.includes('Operator-approved sender identification and unsubscribe handling'));
  assert.equal(plan.transmittedMessages,0);
});
test('source URLs are retained as research references but never interpolated into recipient-facing claims',()=>{
  const t=subject.planTargets([candidate()],recipes,asOf).targets[0];
  assert.ok(t.observations[0].url.includes('keystone-example.com'));
  assert.ok(!t.outreachDrafts.some(m=>m.body.includes('Website categorizes')));
});
test('draft markdown has no public signup, payment links, auto-send, or invented prices',()=>{
  const m=subject.renderResearchMarkdown(subject.planTargets([candidate()],recipes,asOf));
  assert.match(m,/DRAFT ONLY/);assert.match(m,/Keystone Distribution/);
  assert.doesNotMatch(m,/mailto:|https:\/\/buy|\$\d+\/(month|mo)|<form|contact us at/i);
});
