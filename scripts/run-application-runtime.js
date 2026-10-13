"use strict";
const fs=require('node:fs'),path=require('node:path');
const {openRuntime}=require('../packages/application-factory/runtime/runtime');
const {createRuntimeServer}=require('../packages/application-factory/runtime/http');
const recipes=require('../packages/application-factory/recipes.json');
const ROOT=path.resolve(__dirname,'..');
function outsideRepository(raw){
  if(typeof raw!=='string'||!path.isAbsolute(raw))throw new Error('ABSOLUTE_PRIVATE_PATH_REQUIRED');
  const value=path.resolve(raw),relative=path.relative(ROOT,value);
  if(relative===''||(!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)))throw new Error('STATE_MUST_BE_OUTSIDE_REPOSITORY');
  return value;
}
async function main(args=process.argv.slice(2)){
  const [mode,...tail]=args,flags={};
  if(!['provision','sweep','serve'].includes(mode)||tail.length%2)throw new Error('USAGE_INVALID');
  for(let i=0;i<tail.length;i+=2){const key=tail[i];if(!['--state-dir','--tenant','--credential-file','--port'].includes(key)||Object.hasOwn(flags,key))throw new Error('USAGE_INVALID');flags[key]=tail[i+1];}
  if(mode!=='provision'&&(flags['--tenant']||flags['--credential-file']))throw new Error('USAGE_INVALID');
  if(mode!=='serve'&&flags['--port'])throw new Error('USAGE_INVALID');
  const dir=outsideRepository(flags['--state-dir']);
  const runtime=openRuntime({filename:path.join(dir,'runtime.sqlite'),recipes});
  try{
    if(mode==='provision'){
      const output=outsideRepository(flags['--credential-file']);
      if(!flags['--tenant'])throw new Error('TENANT_REQUIRED');
      const fd=fs.openSync(output,'wx',0o600);let provisioned=false;
      try{
        const credential=runtime.provisionTenant(flags['--tenant']);provisioned=true;
        for(const recipe of recipes)runtime.createWorkspace(credential.token,{id:recipe.id,recipeId:recipe.id});
        fs.writeFileSync(fd,JSON.stringify(credential)+'\n');fs.fsyncSync(fd);
        console.log(JSON.stringify({tenantId:credential.tenantId,workspaces:recipes.length,credentialFile:output,releaseApproved:false}));
      }catch(error){if(provisioned)runtime.revokeTenant(flags['--tenant']);fs.closeSync(fd);fs.unlinkSync(output);throw error;}
      fs.closeSync(fd);runtime.close();return;
    }
    if(mode==='sweep'){console.log(JSON.stringify({...runtime.sweep(),externalMessagesSent:0,paymentsSent:0,releaseApproved:false}));runtime.close();return;}
    const rawPort=flags['--port']||'8789';if(!/^\d+$/.test(rawPort))throw new Error('PORT_INVALID');
    const server=createRuntimeServer({runtime});await server.listen({port:Number(rawPort)});
    console.log(JSON.stringify({listening:'127.0.0.1',port:server.address().port,automation:'running',externalDelivery:false,releaseApproved:false}));
    let stopping=false;
    async function stop(){if(stopping)return;stopping=true;await server.close();runtime.close();}
    process.once('SIGINT',stop);process.once('SIGTERM',stop);
    return {server,runtime};
  }catch(error){runtime.close();throw error;}
}
if(require.main===module)main().catch(()=>{console.error('Application runtime command failed; check private paths, credentials, configuration and local state.');process.exitCode=1;});
module.exports={main,outsideRepository};
