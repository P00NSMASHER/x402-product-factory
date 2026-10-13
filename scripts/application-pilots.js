'use strict';
const fs=require('node:fs'),path=require('node:path');
const {openRuntime}=require('../packages/application-factory/runtime/runtime');
const {outsideRepository}=require('./run-application-runtime');
const recipes=require('../packages/application-factory/recipes.json');
function main(args=process.argv.slice(2)){
 const [mode,...tail]=args,options=Object.create(null),allowed={issue:['--state-dir','--recipe-id','--output','--count','--duration-days','--invite-days'],report:['--state-dir'],revoke:['--state-dir','--invite-id']};
 if(!Object.hasOwn(allowed,mode)||tail.length%2)throw new Error('USAGE_INVALID');
 for(let i=0;i<tail.length;i+=2){if(!allowed[mode].includes(tail[i])||Object.hasOwn(options,tail[i])||!tail[i+1]||tail[i+1].startsWith('--'))throw new Error('USAGE_INVALID');options[tail[i]]=tail[i+1];}
 const dir=outsideRepository(options['--state-dir']);
 const integer=(name,fallback,max)=>{const raw=options[name]||String(fallback);if(!/^\d+$/.test(raw)||Number(raw)<1||Number(raw)>max)throw new Error('PILOT_INVALID');return Number(raw);};
 const count=integer('--count',1,100),durationDays=integer('--duration-days',7,14),inviteDays=integer('--invite-days',7,28);
 let output;
 if(mode==='issue'){
  if(!recipes.some(r=>r.id===options['--recipe-id']))throw new Error('PILOT_INVALID');
  output=outsideRepository(options['--output']);if(path.dirname(output)!==dir)throw new Error('PRIVATE_OUTPUT_REQUIRED');
 }
 const runtime=openRuntime({filename:path.join(dir,'runtime.sqlite'),recipes});
 try{
  if(mode==='report')return runtime.pilotReport();
  if(mode==='revoke')return runtime.revokePilot(options['--invite-id']);
  if(runtime.pilotReport().issuedInvitations+count>100)throw new Error('PILOT_CAPACITY');
  const fd=fs.openSync(output,'wx',0o600),issued=[];
  try{
   for(let i=0;i<count;i++)issued.push(runtime.issuePilot({recipeId:options['--recipe-id'],durationDays,inviteDays}));
   fs.writeFileSync(fd,JSON.stringify(issued,null,2)+'\n');fs.fsyncSync(fd);
  }catch(error){for(const invite of issued)runtime.revokePilot(invite.inviteId);fs.closeSync(fd);fs.unlinkSync(output);throw error;}
  fs.closeSync(fd);
  return {issued:issued.length,recipeId:options['--recipe-id'],invitationFile:output,mode:'synthetic-evaluation-only',releaseApproved:false};
 }finally{runtime.close();}
}
if(require.main===module){try{console.log(JSON.stringify(main(),null,2));}catch{console.error('Private pilot command failed. Check private paths, invitation capacity and arguments.');process.exitCode=1;}}
module.exports={main};
