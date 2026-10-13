'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {compileApplication,writeApplication,verifyApplication}=require('../manufacturing/assembler');
const recipes=require('../recipes.json');
test('manufacturing emits a verifiable honest pilot preview and no checkout for every edition',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-growth-assembly-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  for(const recipe of recipes){
    const app=compileApplication(recipe),preview=app.files['growth/index.html'],brief=app.files['growth/offer.json'];
    assert.equal(typeof preview,'string');assert.equal(typeof brief,'string');
    const offer=JSON.parse(brief);assert.equal(offer.buyer,recipe.buyer);assert.equal(offer.checkoutEnabled,false);
    assert.equal(offer.collectedRevenue,null);assert.equal(app.manifest.releaseApproved,false);
    assert.match(preview,/Not available for purchase/);assert.doesNotMatch(preview,/<form\b|https?:\/\/|mailto:/i);
    const dest=path.join(dir,recipe.id);writeApplication(app,dest);assert.equal(verifyApplication(dest,app.digest).digest,app.digest);
    fs.appendFileSync(path.join(dest,'growth/index.html'),'tampered');assert.throws(()=>verifyApplication(dest,app.digest),/ARTIFACT_INVALID/);
  }
});
