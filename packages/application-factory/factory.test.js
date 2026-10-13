"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const corePath = path.join(__dirname,"kernel.js");
const compilerPath = path.join(__dirname,"generator.js");
function load() {
  assert.ok(fs.existsSync(corePath) && fs.existsSync(compilerPath),
    "A real family workflow engine and application compiler must exist");
  return {K:require(corePath),G:require(compilerPath),recipes:require("./recipes.json")};
}
const TODAY="2026-10-13";
function setup(index=0) {
  const {K,G,recipes}=load();
  const recipe=recipes[index];
  const engine=K.createWorkspace(recipe,{workspaceId:"demo-space",today:TODAY});
  return {K,G,recipe,engine};
}
function add(engine,name="Synthetic Supplier") {
  return engine.addRecord({name,dueOn:"2026-10-12"});
}
test("compiles three actual family recipes into self-contained applications",()=>{
  const {G,recipes}=load(); const outputs=G.compileBatch(recipes);
  assert.equal(outputs.length,3);
  for(const output of outputs){
    assert.match(output.files["index.html"],/Content-Security-Policy/);
    const policy=output.files["index.html"].match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1].replace(/&#39;/g,"'");
    assert.match(policy,/connect-src 'none'/);
    assert.match(output.files["index.html"],/sha256-/);
    const manifest=JSON.parse(output.files["manifest.json"]);
    assert.equal(manifest.mode,"local-prototype");
    assert.equal(manifest.realCustomers,null);
    assert.equal(manifest.releaseApproved,false);
    assert.equal(manifest.externalDelivery,false);
    assert.match(output.files["OFFER.md"],/unvalidated/i);
  }
  assert.equal(new Set(outputs.map(x=>x.digest)).size,3);
});
test("repeated manufacturing is byte-for-byte deterministic",()=>{
  const {G,recipes}=load(); assert.deepEqual(G.compileBatch(recipes),G.compileBatch(recipes));
});
test("editions differ in workflow requirements and renewal policy, not only brand",()=>{
  const {recipes}=load();
  assert.equal(new Set(recipes.map(r=>JSON.stringify(r.requirements))).size,3);
  assert.equal(recipes[2].requirements.some(r=>r.renewable),false);
  assert.equal(recipes[1].requirements.some(r=>r.renewable),true);
});
test("100 unique editions compile and complete actual engine journeys",()=>{
  const {K,G,recipes}=load();
  const batch=Array.from({length:100},(_,i)=>({...recipes[i%3],id:"edition-"+i}));
  assert.equal(G.compileBatch(batch).length,100);
  for(const recipe of batch){
    const e=K.createWorkspace(recipe,{workspaceId:"manufacturing-check",today:TODAY});
    const row=add(e); assert.equal(e.runAutomation().length,1);
    assert.equal(e.runAutomation().length,0);
    for(const req of recipe.requirements)e.receive(row.id,req.id,{expiresOn:req.renewable?"2027-01-01":null});
    assert.equal(e.summary(row.id).status,"complete");
    assert.equal(e.runAutomation().length,0);
    const restored=K.createWorkspace(recipe,{workspaceId:"manufacturing-check",today:TODAY,snapshot:e.snapshot()});
    assert.deepEqual(restored.snapshot(),e.snapshot());
  }
});
for(const id of ["../escape","a/b","a\\b","<img>","", "UPPER", "__proto__"]){
  test("rejects unsafe edition ID "+JSON.stringify(id),()=>{
    const {G,recipes}=load();assert.throws(()=>G.compile({...recipes[0],id}),/RECIPE_INVALID/);
  });
}
for(const mutate of [
  r=>{r.billingEnabled=true;},r=>{r.requirements=[];},r=>{r.requirements[0].unknown=true;},
  r=>{r.requirements.push({...r.requirements[0]});},r=>{r.reminderEveryDays=0;},
  r=>{r.title="";},r=>{r.requirements[0].renewable="true";},
  r=>{r.defaultDueDays=0;},r=>{r.renewalWindowDays=1000;}
])test("rejects unsupported recipe fields and invalid family rules",()=>{
  const {G,recipes}=load();const r=structuredClone(recipes[0]);mutate(r);
  assert.throws(()=>G.compile(r),/RECIPE_INVALID/);
});
test("duplicate edition IDs abort entire batch before output",()=>{
  const {G,recipes}=load();assert.throws(()=>G.compileBatch([recipes[0],recipes[0]]),/DUPLICATE_EDITION/);
});
test("compiler refuses excessive batches",()=>{
  const {G,recipes}=load();assert.throws(()=>G.compileBatch(Array(101).fill(recipes[0])),/BATCH_LIMIT/);
});
test("stored and rendered user text cannot break out of script/data blocks",()=>{
  const {G,recipes}=load();const payload='</script><script>globalThis.stolen=true</script>';
  const out=G.compile({...recipes[0],title:payload});
  assert.equal(out.files["index.html"].includes(payload),false);
  assert.match(out.files["index.html"],/\\u003c/);
});
test("generated executable script contains the real working workflow kernel",()=>{
  const {G,recipes}=load(); const html=G.compile(recipes[0]).files["index.html"];
  const script=html.match(/<script id="factory-kernel">([\s\S]*?)<\/script>/)[1];
  const ctx=vm.createContext({});vm.runInContext(script,ctx);
  assert.equal(typeof ctx.FactoryKernel.createWorkspace,"function");
});
test("missing required documents yield a collecting record",()=>{
  const {engine,recipe}=setup();const row=add(engine);
  assert.equal(engine.summary(row.id).missing,recipe.requirements.length);
  assert.equal(engine.summary(row.id).status,"collecting");
});
test("reminders are idempotent, interval-limited and explicitly simulated",()=>{
  const {engine,recipe}=setup();add(engine);
  const first=engine.runAutomation();assert.equal(first.length,1);
  assert.equal(first[0].status,"simulated");
  assert.equal(engine.runAutomation().length,0);
  engine.advanceDay("2026-10-14");assert.equal(engine.runAutomation().length,0);
  engine.advanceDay("2026-10-"+String(13+recipe.reminderEveryDays));
  assert.equal(engine.runAutomation().length,1);
  assert.equal(engine.snapshot().outbox.some(x=>x.status==="sent"),false);
});
test("future-deadline records do not get premature reminders",()=>{
  const {engine}=setup();engine.addRecord({name:"Not yet due",dueOn:"2026-11-01"});
  assert.deepEqual(engine.runAutomation(),[]);
});
test("renewal expiry and reminder windows use calendar days",()=>{
  const {engine,recipe}=setup(1);const row=add(engine);
  for(const req of recipe.requirements)engine.receive(row.id,req.id,{expiresOn:req.renewable?"2026-10-15":null});
  assert.equal(engine.summary(row.id).status,"renewal_due");
  assert.equal(engine.runAutomation()[0].kind,"renewal");
  engine.advanceDay("2026-10-16");assert.equal(engine.summary(row.id).status,"expired");
});
test("nonrenewable documents reject an expiration date",()=>{
  const {engine,recipe}=setup(2);const row=add(engine);
  assert.throws(()=>engine.receive(row.id,recipe.requirements[0].id,{expiresOn:"2027-01-01"}),/EXPIRY_NOT_ALLOWED/);
});
test("received renewable documents require a valid nonpast date",()=>{
  const {engine,recipe}=setup(1);const row=add(engine);
  const req=recipe.requirements.find(r=>r.renewable);
  for(const expiresOn of [null,"2025-02-29","2026-04-31","2026-10-12","bad"]){
    assert.throws(()=>engine.receive(row.id,req.id,{expiresOn}),/EXPIRY_INVALID/);
  }
});
test("completion cancels pending simulation reminders",()=>{
  const {engine,recipe}=setup();const row=add(engine);engine.runAutomation();
  for(const req of recipe.requirements)engine.receive(row.id,req.id,{expiresOn:req.renewable?"2027-01-01":null});
  assert.equal(engine.summary(row.id).status,"complete");
  assert.ok(engine.snapshot().outbox.every(x=>x.status==="cancelled"));
});
test("archiving suppresses further reminders and receipt changes",()=>{
  const {engine,recipe}=setup();const row=add(engine);engine.runAutomation();engine.archive(row.id);
  assert.equal(engine.summary(row.id).status,"archived");assert.deepEqual(engine.runAutomation(),[]);
  assert.throws(()=>engine.receive(row.id,recipe.requirements[0].id,{}),/RECORD_ARCHIVED/);
});
test("invalid commands do not mutate a workspace",()=>{
  const {engine}=setup();const row=add(engine);const prior=engine.snapshot();
  assert.throws(()=>engine.receive(row.id,"nonexistent",{}),/DOCUMENT_UNKNOWN/);
  assert.throws(()=>engine.addRecord({name:"",dueOn:TODAY}),/RECORD_INVALID/);
  assert.throws(()=>engine.addRecord({name:"X",dueOn:"2026-02-30"}),/RECORD_INVALID/);
  assert.deepEqual(engine.snapshot(),prior);
});
test("snapshots are deep copies, not mutable references",()=>{
  const {engine}=setup();const row=add(engine);const snap=engine.snapshot();snap.records[0].name="corrupt";
  assert.equal(engine.summary(row.id).name,"Synthetic Supplier");
});
test("snapshot cannot be restored into another workspace or edition",()=>{
  const {engine,K,recipe}=setup();add(engine);const snapshot=engine.snapshot();
  assert.throws(()=>K.createWorkspace(recipe,{workspaceId:"other-space",today:TODAY,snapshot}),/SNAPSHOT_INVALID/);
  assert.throws(()=>K.createWorkspace({...recipe,id:"different-edition"},{workspaceId:"demo-space",today:TODAY,snapshot}),/SNAPSHOT_INVALID/);
});
for(const mutate of [s=>{s.records[0].dueOn="bad";},s=>{s.records.push({...s.records[0]});},
  s=>{s.nextId=1;},s=>{s.outbox=[{status:"sent"}];},s=>{s.records[0].documents={};},
  s=>{s.today="2026-02-30";},s=>{s.version=99;}]){
  test("corrupt snapshots fail closed before restoration",()=>{
    const {engine,K,recipe}=setup();add(engine);const snapshot=engine.snapshot();mutate(snapshot);
    assert.throws(()=>K.createWorkspace(recipe,{workspaceId:"demo-space",today:TODAY,snapshot}),/SNAPSHOT_INVALID/);
  });
}
test("clock cannot move backward",()=>{
  const {engine}=setup();assert.throws(()=>engine.advanceDay("2026-10-12"),/CLOCK_INVALID/);
});
test("writing artifacts uses a new output directory and refuses overwrite",()=>{
  const {G,recipes}=load();const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"app-factory-"));
  try{
    const output=path.join(tmp,"bundle");G.writeBatch(recipes,output);
    assert.ok(fs.existsSync(path.join(output,recipes[0].id,"index.html")));
    assert.ok(fs.existsSync(path.join(output,"index.html")));
    assert.throws(()=>G.writeBatch(recipes,output),/OUTPUT_EXISTS/);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test("gallery contains real local application links and no fabricated sales",()=>{
  const {G,recipes}=load();const html=G.gallery(G.compileBatch(recipes));
  for(const r of recipes)assert.ok(html.includes(r.id+"/index.html"));
  assert.match(html,/Not measured/);assert.match(html,/prototype/i);
});
