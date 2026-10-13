"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const Service=require("./tenant-service");

async function setup(fn) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"tenant-service-"));
  Service.init(dir);
  const alice=Service.provision(dir,"tenant-alpha","supplier-desk","editor");
  const bob=Service.provision(dir,"tenant-bravo","supplier-desk","editor");
  const viewer=Service.provision(dir,"tenant-alpha","supplier-desk","viewer");
  const client=Service.provision(dir,"tenant-alpha","agency-intake","editor");
  let server;
  async function start(){
    server=Service.createTenantServer(dir);
    await new Promise((resolve,reject)=>{
      server.once("error",reject);server.listen(0,"127.0.0.1",resolve);
    });
    return "http://127.0.0.1:" + server.address().port;
  }
  async function stop(){
    if (server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    server=null;
  }
  let url;
  async function request(token,method,route,body,headers={}) {
    const h={...headers};
    if (token) h.Authorization="Bearer " + token;
    if (body!==undefined && h["Content-Type"]===undefined) h["Content-Type"]="application/json";
    const res=await fetch(url+route,{method,headers:h,body:body===undefined?undefined:
      typeof body==="string"?body:JSON.stringify(body),cache:"no-store"});
    return {status:res.status,value:await res.json()};
  }
  try {
    url=await start();
    await fn({dir,alice,bob,viewer,client,request,stop,async restart(){await stop();url=await start();}});
  } finally {
    await stop();
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
const route="/v1/workspaces/supplier-desk";
const create=(name,expectedVersion=0)=>({expectedVersion,command:{type:"addRecord",name,dueOn:"2026-10-20"}});

test("offline provisioning stores only token hashes; revocation takes immediate effect",async()=>{
  await setup(async({dir,alice,request})=>{
    const registry=fs.readFileSync(path.join(dir,"identities.json"),"utf8");
    assert.ok(!registry.includes(alice.token));
    assert.equal((await request(alice.token,"GET",route)).status,200);
    Service.revoke(dir,alice.id);
    assert.equal((await request(alice.token,"GET",route)).status,401);
    assert.equal((await request("A".repeat(43),"GET",route)).status,401);
    assert.equal((await request(null,"GET",route)).status,401);
  });
});

test("two tenants cannot read or mutate each other's record IDs",async()=>{
  await setup(async({alice,bob,request})=>{
    let response=await request(alice.token,"POST",route+"/commands",create("Private Alpha"));
    assert.equal(response.status,200);
    assert.equal(response.value.version,1);
    assert.equal(response.value.snapshot.records[0].name,"Private Alpha");
    response=await request(bob.token,"GET",route);
    assert.equal(response.status,200);
    assert.equal(response.value.version,0);
    assert.deepEqual(response.value.snapshot.records,[]);
    response=await request(bob.token,"POST",route+"/commands",{
      expectedVersion:0,command:{type:"archive",recordId:"r1"}
    });
    assert.equal(response.status,400);
    response=await request(bob.token,"POST",route+"/commands",create("Private Bravo"));
    assert.equal(response.status,200);
    assert.equal(response.value.snapshot.records[0].name,"Private Bravo");
    assert.notEqual((await request(alice.token,"GET",route)).value.snapshot.workspaceId,
                    (await request(bob.token,"GET",route)).value.snapshot.workspaceId);
    assert.equal((await request(alice.token,"GET",route)).value.snapshot.records[0].name,"Private Alpha");
  });
});

test("client tenant claims and mismatched recipe credentials are rejected",async()=>{
  await setup(async({alice,bob,client,viewer,request})=>{
    assert.equal((await request(alice.token,"GET",route,undefined,{"X-Tenant-ID":"tenant-bravo"})).status,400);
    assert.equal((await request(bob.token,"POST",route+"/commands",{
      ...create("Fake"),tenantId:"tenant-alpha"
    })).status,400);
    assert.equal((await request(bob.token,"POST",route+"/commands",{
      expectedVersion:0,command:{...create("Fake").command,tenantId:"tenant-alpha"}
    })).status,400);
    assert.equal((await request(client.token,"GET",route)).status,403);
    assert.equal((await request(alice.token,"GET","/v1/workspaces/agency-intake")).status,403);
    assert.equal((await request(viewer.token,"GET",route)).status,200);
    assert.equal((await request(viewer.token,"GET",route+"/export")).status,200);
    assert.equal((await request(viewer.token,"POST",route+"/commands",create("No"))).status,403);
    assert.equal((await request(viewer.token,"POST",route+"/restore",{
      expectedVersion:0,export:{}
    })).status,403);
    assert.equal((await request(alice.token,"GET","/v1/workspaces/../../etc")).status,404);
  });
});

test("signed snapshots cannot be imported into another tenant, edited, or forged",async()=>{
  await setup(async({alice,bob,request})=>{
    assert.equal((await request(alice.token,"POST",route+"/commands",create("Alpha secret"))).status,200);
    const own=(await request(alice.token,"GET",route+"/export")).value;
    assert.equal(own.format,"factory-tenant-export-v1");
    assert.equal((await request(bob.token,"POST",route+"/restore",{
      expectedVersion:0,export:own
    })).status,403);
    const forged=structuredClone(own);forged.tenantId="tenant-bravo";
    assert.equal((await request(bob.token,"POST",route+"/restore",{
      expectedVersion:0,export:forged
    })).status,400);
    const changed=structuredClone(own);changed.snapshot.records[0].name="Injected";
    assert.equal((await request(alice.token,"POST",route+"/restore",{
      expectedVersion:1,export:changed
    })).status,400);
    assert.equal((await request(alice.token,"POST",route+"/restore",{
      expectedVersion:1,snapshot:own.snapshot
    })).status,400);
    assert.equal((await request(alice.token,"GET",route)).value.version,1);
    assert.equal((await request(bob.token,"GET",route)).value.snapshot.records.length,0);
  });
});

test("authorized signed restores are version checked, scoped and persistent across restart",async()=>{
  await setup(async({alice,request,restart})=>{
    assert.equal((await request(alice.token,"POST",route+"/commands",create("First"))).status,200);
    const signed=(await request(alice.token,"GET",route+"/export")).value;
    assert.equal((await request(alice.token,"POST",route+"/commands",create("Second",1))).status,200);
    assert.equal((await request(alice.token,"POST",route+"/restore",{
      expectedVersion:1,export:signed
    })).status,409);
    const restored=await request(alice.token,"POST",route+"/restore",{expectedVersion:2,export:signed});
    assert.equal(restored.status,200);
    assert.equal(restored.value.version,3);
    assert.equal(restored.value.snapshot.records.length,1);
    assert.equal(restored.value.snapshot.records[0].name,"First");
    await restart();
    const persisted=await request(alice.token,"GET",route);
    assert.equal(persisted.status,200);
    assert.equal(persisted.value.version,3);
    assert.equal(persisted.value.snapshot.records[0].name,"First");
  });
});

test("optimistic version compare prevents two simultaneous stale writes",async()=>{
  await setup(async({alice,request})=>{
    const results=await Promise.all([
      request(alice.token,"POST",route+"/commands",create("One")),
      request(alice.token,"POST",route+"/commands",create("Two"))
    ]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    assert.equal((await request(alice.token,"GET",route)).value.snapshot.records.length,1);
  });
});

test("signed backup recovers valid previous commit and rejects corrupted primary and backup",async()=>{
  await setup(async({dir,alice,request})=>{
    assert.equal((await request(alice.token,"POST",route+"/commands",create("First"))).status,200);
    assert.equal((await request(alice.token,"POST",route+"/commands",create("Second",1))).status,200);
    const file=Service.storagePath({dir},"tenant-alpha","supplier-desk");
    fs.writeFileSync(file,'{"partial":');
    let result=await request(alice.token,"GET",route);
    assert.equal(result.status,200);
    assert.equal(result.value.recovered,true);
    assert.equal(result.value.version,1);
    assert.equal(result.value.snapshot.records.length,1);
    // Data tampering without the MAC is rejected, even if JSON parses.
    let state=JSON.parse(fs.readFileSync(file,"utf8"));
    state.snapshot.records[0].name="TAMPERED";
    fs.writeFileSync(file,JSON.stringify(state));
    result=await request(alice.token,"GET",route);
    assert.equal(result.status,200);
    assert.equal(result.value.recovered,true);
    assert.equal(result.value.snapshot.records[0].name,"First");
    fs.writeFileSync(file,"{}");
    fs.writeFileSync(file+".bak","{}");
    result=await request(alice.token,"GET",route);
    assert.equal(result.status,503);
    assert.equal(result.value.error,"STORAGE_INTEGRITY");
  });
});

test("uploaded files, multipart bodies, unknown fields, and oversized bodies are refused",async()=>{
  await setup(async({dir,alice,request})=>{
    assert.equal((await request(alice.token,"POST",route+"/upload",{file:"sensitive"})).status,415);
    assert.equal((await request(alice.token,"POST",route+"/commands","--fake",{
      "Content-Type":"multipart/form-data; boundary=fake"
    })).status,415);
    assert.equal((await request(alice.token,"POST",route+"/commands",{
      expectedVersion:0,command:{type:"addRecord",name:"Safe",dueOn:"2026-10-20",file:"secret"}
    })).status,400);
    assert.equal((await request(alice.token,"POST",route+"/commands","x".repeat(70000))).status,413);
    assert.equal((await request(alice.token,"GET",route)).value.version,0);
    assert.deepEqual(fs.readdirSync(path.join(dir,"workspaces")),[]);
  });
});

test("checklist receipt metadata and reminders persist without sending or storing document bytes",async()=>{
  await setup(async({dir,alice,request})=>{
    const added=await request(alice.token,"POST",route+"/commands",create("Synthetic vendor"));
    assert.equal(added.status,200);
    const received=await request(alice.token,"POST",route+"/commands",{
      expectedVersion:1,command:{type:"receive",recordId:"r1",requirementId:"business-profile",expiresOn:null}
    });
    assert.equal(received.status,200);
    const reminders=await request(alice.token,"POST",route+"/commands",{
      expectedVersion:2,command:{type:"runAutomation"}
    });
    assert.equal(reminders.status,200);
    assert.ok(reminders.value.snapshot.outbox.every(x=>["simulated","cancelled"].includes(x.status)));
    assert.equal(reminders.value.snapshot.records[0].documents["business-profile"].receivedOn,"2026-10-13");
    const file=Service.storagePath({dir},"tenant-alpha","supplier-desk");
    assert.ok(fs.existsSync(file));
    assert.equal(fs.statSync(file).mode & 0o777,0o600);
    assert.equal((await request(alice.token,"GET",route+"/export")).status,200);
    assert.equal((await request(alice.token,"GET",route)).value.version,3);
  });
});

test("symlink storage targets are never followed",async()=>{
  await setup(async({dir,alice,request})=>{
    const destination=path.join(dir,"outside.json");
    fs.writeFileSync(destination,"private");
    const file=Service.storagePath({dir},"tenant-alpha","supplier-desk");
    fs.symlinkSync(destination,file);
    const response=await request(alice.token,"GET",route);
    assert.equal(response.status,503);
    assert.equal(fs.readFileSync(destination,"utf8"),"private");
  });
});

test("one process per data directory and no public host binding",async()=>{
  await setup(async({dir,request})=>{
    assert.throws(()=>Service.createTenantServer(dir),/SERVICE_ALREADY_RUNNING_OR_STALE_LOCK/);
    const health=await request(null,"GET","/health");
    assert.equal(health.status,200);
    assert.equal(health.value.uploads,false);
    assert.equal(health.value.delivery,false);
    assert.equal(health.value.billing,false);
  });
});
