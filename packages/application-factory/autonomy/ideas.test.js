'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const catalog=require('./catalog');
let api;try{api=require('./ideas');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;api={};}
const SOURCE_DATE='2026-10-13';
const example=(cycle=72,overrides={})=>({
 schemaVersion:1,cycle,
 hypothesis:{
  customerProblem:'Equipment administrators repeatedly chase custody and service readiness records.',
  buyerTrigger:'A service team transfers equipment to a new job location.',
  expensiveFailure:'A missing current inspection record delays the equipment dispatch.',
  discoveryQuestion:'How much time passes between equipment return and the next dispatch today?',
  differentiator:'Track equipment custody, inspection and safety release as a single dated readiness queue.',
  status:'unverified'
 },
 sources:[{url:'https://www.osha.gov/laws-regs',observedOn:SOURCE_DATE},
          {url:'https://www.sba.gov/business-guide',observedOn:SOURCE_DATE}],
 recipe:{version:1,family:'document-workflow',id:'equipment-custody-cycle-'+cycle,title:'Equipment Custody Intake '+cycle,
  buyer:'Small equipment service teams coordinating loaner and rental equipment',
  outcome:'Collect custody, post-return inspection and next-dispatch release paperwork.',
  recordLabel:'Loaner item',defaultDueDays:6,reminderEveryDays:2,renewalWindowDays:23,
  requirements:[
   {id:'custody-register',label:'Custody chain register',renewable:false},
   {id:'inspection-release',label:'Equipment inspection release',renewable:true},
   {id:'handoff-authorization',label:'Equipment handoff authorization',renewable:false},
   {id:'service-condition-report',label:'Service condition report',renewable:false}
  ]},
 ...overrides
});
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-idea-admission-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function put(dir,cycle=72,extra={},filename='cycle-'+cycle+'.json'){fs.writeFileSync(path.join(dir,filename),JSON.stringify(example(cycle,extra))+'\n',{mode:0o600});}
const backlog=dir=>{assert.equal(typeof api.loadIdeaBacklog,'function','missing blueprint reader');return api.loadIdeaBacklog({directory:dir,existingRecipes:catalog.buildCandidateCatalog()});};
test('admits one evidence-neutral buyer workflow beyond the 72 curated editions',t=>{
 const dir=setup(t);put(dir);const rows=backlog(dir);
 assert.equal(rows.length,1);assert.equal(rows[0].cycle,72);assert.equal(rows[0].recipe.id,'equipment-custody-cycle-72');
 assert.equal(rows[0].marketValidated,false);assert.equal(rows[0].realCustomers,null);
 assert.equal(rows[0].collectedRevenue,null);assert.equal(rows[0].releaseApproved,false);
 assert.equal(rows[0].sources.length,2);
});
test('review inputs are distinct mechanisms, not cosmetic names',t=>{
 const dir=setup(t);put(dir);
 const copy=example(73);copy.recipe.title='A different marketing name';
 copy.recipe.requirements=example(72).recipe.requirements;
 copy.recipe.defaultDueDays=example(72).recipe.defaultDueDays;
 copy.recipe.reminderEveryDays=example(72).recipe.reminderEveryDays;
 copy.recipe.renewalWindowDays=example(72).recipe.renewalWindowDays;
 fs.writeFileSync(path.join(dir,'cycle-73.json'),JSON.stringify(copy));
 assert.throws(()=>backlog(dir),/IDEA_DUPLICATE|IDEA_INVALID/);
});
test('two mechanically distinct app ideas in separate cycles are sorted and accepted',t=>{
 const dir=setup(t);put(dir,72);
 const second=example(73);second.recipe.id='field-work-certificate-73';second.recipe.requirements=[
  {id:'preinstall-survey',label:'Pre-installation survey',renewable:false},
  {id:'building-access-permission',label:'Site entry permission',renewable:true},
  {id:'commissioning-log',label:'Commissioning reference',renewable:false},
  {id:'acceptance-record',label:'Owner sign-off',renewable:false}
 ];second.recipe.outcome='Coordinate pre-installation surveys and closeout sign-off.';
 fs.writeFileSync(path.join(dir,'cycle-73.json'),JSON.stringify(second));
 const rows=backlog(dir);assert.deepEqual(rows.map(r=>r.cycle),[72,73]);
 assert.notDeepEqual(rows[0].recipe.requirements,rows[1].recipe.requirements);
});
test('rejects attempts to assert verified buyers, sales, payment, deployment or release',t=>{
 const dir=setup(t);
 for(const [i,extra] of [{revenue:100},{marketValidated:true},{buyerEmail:'buyer@example.com'},{releaseApproved:true},{promoted:true}].entries()){
  put(dir,72,extra);assert.throws(()=>backlog(dir),/IDEA_INVALID/);fs.unlinkSync(path.join(dir,'cycle-72.json'));
 }
});
test('blocks invalid URLs and stale, fabricated or future research dates',t=>{
 const dir=setup(t);
 for(const url of ['http://www.osha.gov','https://localhost/admin','https://user:pass@example.com/guide',
  'https://example.com:3000/','https://example.com/path?secret=1','https://127.0.0.1/foo',
  'https://example.invalid/document']){
  const value=example();value.sources[0].url=url;
  fs.writeFileSync(path.join(dir,'cycle-72.json'),JSON.stringify(value));
  assert.throws(()=>backlog(dir),/IDEA_INVALID/);
 }
 for(const observedOn of ['2026-11-02','2026-01-01','2026-02-30']){
  const value=example();value.sources[0].observedOn=observedOn;
  fs.writeFileSync(path.join(dir,'cycle-72.json'),JSON.stringify(value));
  assert.throws(()=>backlog(dir),/IDEA_INVALID/);
 }
});
test('rejects reusing an existing product identity or a metadata-only difference',t=>{
 const dir=setup(t),value=example();value.recipe.id=catalog.buildCandidateCatalog()[0].id;
 fs.writeFileSync(path.join(dir,'cycle-72.json'),JSON.stringify(value));assert.throws(()=>backlog(dir),/IDEA_DUPLICATE|IDEA_INVALID/);
 const shallow=example();shallow.recipe.requirements=catalog.buildCandidateCatalog()[0].requirements;
 fs.writeFileSync(path.join(dir,'cycle-72.json'),JSON.stringify(shallow));assert.throws(()=>backlog(dir),/IDEA_DUPLICATE|IDEA_INVALID/);
});
test('rejects malformed filenames and mismatched cycle assignments',t=>{
 const dir=setup(t);
 put(dir,72,{},'cycle-73.json');assert.throws(()=>backlog(dir),/IDEA_INVALID/);
 fs.renameSync(path.join(dir,'cycle-73.json'),path.join(dir,'draft-instructions.json'));
 assert.throws(()=>backlog(dir),/IDEA_INVALID/);
});
test('rejects symbolic links and oversized candidate inputs',t=>{
 const dir=setup(t),target=path.join(dir,'cycle-72.json');put(dir);
 const link=path.join(dir,'cycle-73.json');fs.symlinkSync(target,link);
 assert.throws(()=>backlog(dir),/IDEA_PATH_UNSAFE/);
 fs.unlinkSync(link);fs.writeFileSync(target,' '.repeat(16384));assert.throws(()=>backlog(dir),/IDEA_INVALID/);
});
test('empty or absent trusted blueprint directory does not create fake work',t=>{
 const dir=setup(t);assert.deepEqual(backlog(dir),[]);
 const missing=path.join(dir,'missing');assert.deepEqual(backlog(missing),[]);
});
test('catalog remains bounded and no raw code or command injection is accepted',t=>{
 const dir=setup(t);const value=example();
 value.recipe.requirements[0].label='<script>simulate</script>';fs.writeFileSync(path.join(dir,'cycle-72.json'),JSON.stringify(value));
 assert.throws(()=>backlog(dir),/IDEA_INVALID/);
});
