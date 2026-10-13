'use strict';
// Operator-only public-organization research. No buyer contact or network transport.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const recipes=require('../packages/application-factory/recipes.json');
const {planTargets,renderResearchMarkdown}=require('../packages/application-factory/growth/prospecting');
const {createCampaign}=require('../packages/application-factory/growth/campaign');
const fail=code=>{throw new Error(code);};
function safeFile(filename,limit){
  if(typeof filename!=='string'||!path.isAbsolute(filename))fail('INPUT_PATH_INVALID');
  const stat=fs.lstatSync(filename);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>limit)fail('INPUT_PATH_INVALID');
  return fs.readFileSync(filename,'utf8');
}
function privateDirectory(dirname){
  if(typeof dirname!=='string'||!path.isAbsolute(dirname))fail('OUTPUT_PATH_INVALID');
  fs.mkdirSync(dirname,{recursive:true,mode:0o700});const stat=fs.lstatSync(dirname);
  if(!stat.isDirectory()||stat.isSymbolicLink()||fs.realpathSync(dirname)!==path.resolve(dirname)||
     (process.platform!=='win32'&&(stat.mode&0o077)!==0))fail('OUTPUT_PATH_INVALID');
}
function inputTargets(filename){
  let body;try{body=JSON.parse(safeFile(filename,1024*1024));}catch{fail('RESEARCH_INPUT_INVALID');}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join('|')!=='schemaVersion|targets'||
     body.schemaVersion!==1||!Array.isArray(body.targets))fail('RESEARCH_INPUT_INVALID');
  return body.targets;
}
function readKey(filename){
  const text=safeFile(filename,70).trim();
  if(!/^[0-9a-fA-F]{64}$/.test(text))fail('KEY_INVALID');
  if(process.platform!=='win32'&&(fs.statSync(filename).mode&0o077)!==0)fail('KEY_INVALID');
  return Buffer.from(text,'hex');
}
function main(args=process.argv.slice(2)){
  const [command,...rest]=args;
  const options={};if(!['plan','init','event','report'].includes(command)||rest.length%2)fail('USAGE_INVALID');
  for(let i=0;i<rest.length;i+=2){const k=rest[i];if(!/^--[a-z-]+$/.test(k)||Object.hasOwn(options,k)||
    typeof rest[i+1]!=='string'||!rest[i+1]||rest[i+1].startsWith('--'))fail('USAGE_INVALID');options[k]=rest[i+1];}
  const allowed={plan:['--input','--output-dir','--as-of'],init:['--input','--ledger','--key-file'],
    event:['--ledger','--key-file','--domain','--kind','--request-key'],report:['--ledger','--key-file']};
  const required={plan:['--input','--output-dir'],init:['--input','--ledger','--key-file'],
    event:['--ledger','--key-file','--domain','--kind','--request-key'],report:['--ledger','--key-file']};
  if(Object.keys(options).some(k=>!allowed[command].includes(k))||required[command].some(k=>!options[k]))fail('USAGE_INVALID');
  if(command==='plan'){
    const asOf=options['--as-of']||new Date().toISOString().slice(0,10);
    const plan=planTargets(inputTargets(options['--input']),recipes,asOf);
    const dir=path.resolve(options['--output-dir']);if(!path.isAbsolute(options['--output-dir']))fail('OUTPUT_PATH_INVALID');
    const parent=path.dirname(dir);privateDirectory(parent);if(fs.existsSync(dir))fail('OUTPUT_EXISTS');
    const stage=fs.mkdtempSync(path.join(parent,'.research-stage-'));
    try{
      const markdown=renderResearchMarkdown(plan),json=JSON.stringify(plan,null,2)+'\n';
      const files={'buyer-research.md':markdown,'research-queue.json':json};
      files['integrity.json']=JSON.stringify({version:1,artifacts:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,crypto.createHash('sha256').update(v).digest('hex')])),
        releaseApproved:false,transmittedMessages:0},null,2)+'\n';
      for(const [name,text] of Object.entries(files))fs.writeFileSync(path.join(stage,name),text,{flag:'wx',mode:0o600});
      fs.renameSync(stage,dir);
    }finally{if(fs.existsSync(stage))fs.rmSync(stage,{recursive:true,force:true});}
    return {kind:'draft-buyer-research-kit',targets:plan.targets.length,draftOnly:true,transmittedMessages:0,releaseApproved:false};
  }
  const key=readKey(options['--key-file']);let campaign;
  try{
    if(command==='init')planTargets(inputTargets(options['--input']),recipes,new Date().toISOString().slice(0,10));
    campaign=createCampaign({filename:options['--ledger'],key,recipes});
    if(command==='init'){campaign.importTargets(inputTargets(options['--input']));return campaign.report();}
    if(command==='event')return campaign.record({domain:options['--domain'],kind:options['--kind'],key:options['--request-key']});
    return {...campaign.report(),nextActions:campaign.nextActions()};
  }finally{campaign?.close();key.fill(0);}
}
if(require.main===module){try{console.log(JSON.stringify(main(),null,2));}catch{console.error('Offline acquisition kit rejected invalid or unsafe input. No messages were sent.');process.exitCode=1;}}
module.exports={main};
