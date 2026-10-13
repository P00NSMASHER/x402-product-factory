"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {openRuntime}=require('./runtime');
const recipes=require('../recipes.json');
function runAcceptance(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-autonomy-acceptance-'));
  const filename=path.join(dir,'runtime.sqlite'),credentials=[];let runtime;
  try{
    runtime=openRuntime({filename,recipes});const today=new Date().toISOString().slice(0,10);
    for(let i=0;i<100;i++){
      const {token}=runtime.provisionTenant('synthetic-'+i);credentials.push(token);
      runtime.createWorkspace(token,{id:'main',recipeId:recipes[i%recipes.length].id});
      runtime.command(token,'main',{type:'add',name:'Synthetic workflow '+i,dueOn:today},'initial-intake');
    }
    runtime.close();runtime=null;let completed=0,workerProcesses=0;
    const script=path.resolve(__dirname,'../../..','scripts/run-application-runtime.js');
    for(let i=0;i<4;i++){
      const run=spawnSync(process.execPath,[script,'sweep','--state-dir',dir],{encoding:'utf8',timeout:10000});
      assert.equal(run.status,0,'worker process must complete');const report=JSON.parse(run.stdout);
      assert.equal(report.failed,0);completed+=report.completed;workerProcesses++;
    }
    runtime=openRuntime({filename,recipes});let notifications=0;
    for(const token of credentials){const inbox=runtime.inbox(token,'main');assert.equal(inbox.length,1);notifications+=inbox.length;}
    const second=runtime.sweep();assert.equal(second.notifications,0);
    assert.equal(completed,credentials.length);
    return {kind:'synthetic-durable-runtime-acceptance',passed:true,editions:recipes.length,
      workspacesCreated:credentials.length,workspaceRunsCompleted:completed,workerProcesses,
      notificationsPersisted:notifications,duplicateNotifications:second.notifications,
      realCustomers:null,collectedRevenue:null,externalMessagesSent:0,paymentsSent:0,
      releaseApproved:false,limitations:['Local API and internal inbox only; no hosted deployment or email delivery.','Synthetic execution does not demonstrate sales, retention or production security certification.']};
  }finally{runtime?.close();fs.rmSync(dir,{recursive:true,force:true});}
}
if(require.main===module)console.log(JSON.stringify(runAcceptance(),null,2));
module.exports={runAcceptance};
