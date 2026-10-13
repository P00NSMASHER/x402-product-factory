'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const recipes=require('../recipes.json');
const {buildOffer,renderOffer}=require('./offers');
test('every edition gets its own evidence-honest offer with no live checkout',()=>{
  const all=recipes.map(buildOffer);assert.equal(new Set(all.map(o=>o.id)).size,3);
  for(const [i,offer] of all.entries()){
    assert.equal(offer.id,recipes[i].id);assert.equal(offer.buyer,recipes[i].buyer);
    assert.equal(offer.realCustomers,null);assert.equal(offer.collectedRevenue,null);
    assert.equal(offer.releaseApproved,false);assert.equal(offer.checkoutEnabled,false);
    assert.equal(offer.outreachEnabled,false);assert.equal(offer.metrics.qualifiedInterviews,null);
    assert.equal(offer.pilotPriceCents,null);assert.ok(offer.requirements.length);
    const page=renderOffer(offer);assert.match(page,/Not available for purchase/);
    assert.doesNotMatch(page,/https?:\/\/|mailto:|fetch\(|submit.*form|<script\b/i);
    assert.match(page,/Content-Security-Policy/);assert.match(page,/name="robots" content="noindex,nofollow"/);
  }
});
test('offer generation is byte-for-byte deterministic with credible language',()=>{
  for(const recipe of recipes){assert.deepEqual(buildOffer(recipe),buildOffer(structuredClone(recipe)));assert.equal(renderOffer(buildOffer(recipe)),renderOffer(buildOffer(recipe)));}
});
test('all recipe-provided display text is escaped and CSP has no external authority',()=>{
  const tricky={...recipes[0],title:'<img src=x onerror=alert(1)>',buyer:'" onclick="steal()',outcome:'<script>bad</script> & more',requirements:[{id:'insurance',label:'<h1>injected</h1>',renewable:true}]};
  const page=renderOffer(buildOffer(tricky));assert.doesNotMatch(page,/<img|<script>|"\s+onclick\s*=|<h1>injected/i);assert.match(page,/&lt;script&gt;/);assert.match(page,/&amp; more/);
});
test('100 unique configured editions manufacture separate offer identities',()=>{
  const outputs=Array.from({length:100},(_,i)=>buildOffer({...recipes[i%3],id:'synthetic-'+i}));
  assert.equal(new Set(outputs.map(o=>o.id)).size,100);
  assert.ok(outputs.every(o=>o.realCustomers===null&&o.checkoutEnabled===false));
});
test('unsupported recipe fields and oversized inputs fail closed',()=>{
  assert.throws(()=>buildOffer({...recipes[0],claimedRevenue:100}),/RECIPE_INVALID/);
  assert.throws(()=>renderOffer({id:'forged'}),/OFFER_INVALID/);
});
