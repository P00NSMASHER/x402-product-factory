'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {compileApplication,writeApplication,verifyApplication}=require('../manufacturing/assembler');
const recipes=require('../recipes.json');
test('every full application includes a different content-hashed acquisition kit with no sales claims',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'factory-marketing-pack-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const questions=[];
  for(const recipe of recipes){
    const pkg=compileApplication(recipe),folder=path.join(directory,recipe.id);writeApplication(pkg,folder);
    assert.equal(verifyApplication(folder,pkg.digest).digest,pkg.digest);
    const kit=JSON.parse(pkg.files['growth/qualification.json']);questions.push(kit.questions[1]);
    assert.equal(kit.recipeId,recipe.id);assert.equal(kit.checkoutEnabled,false);assert.equal(kit.outreachEnabled,false);
    assert.equal(kit.priceCents,null);assert.equal(kit.collectedRevenue,null);
    assert.match(pkg.files['growth/research-questions.md'],/DRAFT ONLY/);
    assert.ok(pkg.files['scripts/create-acquisition-kit.js']);
    const modified=path.join(folder,'growth/research-questions.md');fs.appendFileSync(modified,'changed');
    assert.throws(()=>verifyApplication(folder,pkg.digest),/ARTIFACT_INVALID/);
  }
  assert.equal(new Set(questions).size,3);
});
test('one self-contained generated edition can prepare a prospect kit with no network or contact details',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'factory-marketing-cli-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const pkg=compileApplication(recipes[0]),installed=path.join(directory,'installed');writeApplication(pkg,installed);
  const source=path.join(directory,'targets.json'),out=path.join(directory,'drafts'),date=new Date().toISOString().slice(0,10);
  fs.writeFileSync(source,JSON.stringify({schemaVersion:1,targets:[{company:'Synthetic Supplies',homepage:'https://synthetic-supplies.example.com',
    recipeId:recipes[0].id,observations:[{url:'https://synthetic-supplies.example.com/about',observedOn:date,signal:'business_category',note:'Website identifies the supplier as a document distribution organization.'}]}]}));
  const p=spawnSync(process.execPath,[path.join(installed,'scripts/create-acquisition-kit.js'),'plan','--input',source,'--output-dir',out,'--as-of',date],{cwd:installed,encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH,TZ:'UTC'}});
  assert.equal(p.status,0,p.stderr);assert.equal(JSON.parse(p.stdout).transmittedMessages,0);
  assert.match(fs.readFileSync(path.join(out,'buyer-research.md'),'utf8'),/DRAFT ONLY/);
  assert.equal(verifyApplication(installed,pkg.digest).digest,pkg.digest);
});
