"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const vm=require("node:vm");
const {compileBatch}=require("./generator");
const recipes=require("./recipes.json");
function accept(count=100){
  assert.ok(Number.isInteger(count)&&count>=3&&count<=100);
  const candidates=Array.from({length:count},(_,i)=>({...recipes[i%recipes.length],id:"manufacturing-"+i}));
  const first=compileBatch(candidates),second=compileBatch(candidates);
  assert.deepEqual(first,second,"non-deterministic manufacturing output");
  for(const build of first){
    const manifest=JSON.parse(build.files["manifest.json"]);
    for(const [name,expected] of Object.entries(manifest.artifacts)){
      assert.equal(crypto.createHash("sha256").update(build.files[name]).digest("hex"),expected);
    }
    const html=build.files["index.html"];
    const config=JSON.parse(html.match(/id="factory-config">([\s\S]*?)<\/script>/)[1]);
    const script=html.match(/id="factory-kernel">([\s\S]*?)<\/script>/)[1];
    const context=vm.createContext({});
    vm.runInContext(script,context,{timeout:1000});
    const K=context.FactoryKernel;
    const workspace=K.createWorkspace(config.recipe,{workspaceId:"acceptance",today:"2026-10-13"});
    const row=workspace.addRecord({name:"Synthetic acceptance record",dueOn:"2026-10-12"});
    assert.equal(workspace.runAutomation().length,1);
    assert.equal(workspace.runAutomation().length,0);
    for(const req of config.recipe.requirements)workspace.receive(row.id,req.id,{expiresOn:req.renewable?"2027-01-01":null});
    assert.equal(workspace.summary(row.id).status,"complete");
    assert.equal(workspace.runAutomation().length,0);
    const state=workspace.snapshot();
    const restore=K.createWorkspace(config.recipe,{workspaceId:"acceptance",today:"2026-10-13",snapshot:state});
    assert.equal(JSON.stringify(restore.snapshot()),JSON.stringify(state));
    assert.equal(manifest.billingEnabled,false);assert.equal(manifest.externalDelivery,false);
  }
  return {schemaVersion:1,kind:"synthetic-manufacturing-acceptance",passed:true,
    recipeFamilies:1,demonstrationRecipes:recipes.length,generatedEditions:first.length,
    completeGeneratedKernelJourneys:count,deterministic:true,artifactHashesVerified:true,
    realCustomers:null,collectedRevenue:null,externalMessagesSent:0,paymentsSent:0,
    liveDeployment:false,releaseApproved:false,
    limitations:["Browser-only prototype; no authenticated server or secure uploads.",
      "Synthetic task execution is not customer acceptance, retention, or sales."]};
}
if(require.main===module){
  if(process.argv.slice(2).some(arg=>arg!=="--check"))throw new Error("USAGE: node packages/application-factory/acceptance.js --check");
  console.log(JSON.stringify(accept(),null,2));
}
module.exports={accept};
