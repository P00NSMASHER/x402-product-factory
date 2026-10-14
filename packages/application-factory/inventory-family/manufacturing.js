'use strict';
// Compile complete self-contained synthetic inventory applications and independently execute each package.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {validateRecipe}=require('./engine'),recipes=require('./recipes.json');
const ROOT=path.resolve(__dirname,'../../..'),SOURCE=path.resolve(__dirname);
const NAMES=['engine.js','store.js','server.js','client.js','index.html','style.css','run.js'];
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const fail=code=>{throw Error(code);};
const normalized=p=>process.platform==='win32'?p.toLowerCase():p;
function safeDir(p){const st=fs.lstatSync(p);if(!st.isDirectory()||st.isSymbolicLink()||
 normalized(fs.realpathSync(p))!==normalized(path.resolve(p))||
 (process.platform!=='win32'&&(st.mode&0o077)))fail('OUTPUT_UNSAFE');}
function compileInventoryPackage(raw,{sourceRoot=SOURCE}={}){
 const recipe=validateRecipe(raw);
 if(typeof sourceRoot!=='string'||!path.isAbsolute(sourceRoot))fail('SOURCE_INVALID');
 safeDir(sourceRoot);
 const files={};
 for(const name of NAMES){
  const file=path.join(sourceRoot,name),st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size>1024*1024||
    normalized(fs.realpathSync(file))!==normalized(file))fail('SOURCE_INVALID');
  files[name]=fs.readFileSync(file,'utf8');
 }
 files['recipe.json']=JSON.stringify(recipe,null,2)+'\n';
 files['package.json']=JSON.stringify({name:'factory-'+recipe.id,version:'0.0.0',private:true,
  engines:{node:'>=22.13.0'},scripts:{start:'node run.js serve',provision:'node run.js provision',sweep:'node run.js sweep'}},null,2)+'\n';
 files['README.md']='# '+recipe.title+' - independently assembled local inventory candidate\n\n'+recipe.outcome+
  '\n\nSynthetic example stock and sample costs ONLY. No real vendors, customers, purchase orders, payments or commercial validation are connected.\n'+
  'Use Node.js 22.13+ on a trusted local machine. State and credentials must live OUTSIDE this package.\n\n'+
  '  node run.js provision --state-dir /absolute/private/inventory --tenant synthetic-team\n'+
  '  node run.js serve --state-dir /absolute/private/inventory --port 8791\n\n'+
  'Open http://127.0.0.1:8791/app. Issue separate operator and reviewer access files to different synthetic evaluators.\n'+
  'Automatic internal reorder drafts only; no third-party ordering, invoicing, email, payment, TLS, public deployment or real customer-data consent.\n';
 const inventory=Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)).map(([n,c])=>[n,sha(c)]));
 const manifest={schemaVersion:1,generator:'independent-inventory-family-v1',
  recipeId:recipe.id,family:'inventory-control',files:inventory,
  mode:'synthetic-local-candidate',marketValidated:false,releaseApproved:false,
  supplierPurchaseEnabled:false,paymentEnabled:false,realCustomers:null,collectedRevenue:null};
 const digest=sha(JSON.stringify(manifest));
 files['manifest.json']=JSON.stringify({...manifest,digest},null,2)+'\n';
 return {id:recipe.id,digest,manifest:{...manifest,digest},files};
}
function verifyInventoryPackage(directory,digest){
 try{
  if(typeof digest!=='string'||!/^[a-f0-9]{64}$/.test(digest))fail('ARTIFACT_INVALID');
  safeDir(directory);
  const names=fs.readdirSync(directory).sort(),manifestFile=path.join(directory,'manifest.json'),
    stat=fs.lstatSync(manifestFile);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)fail('ARTIFACT_INVALID');
  const {digest:provided,...body}=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  if(provided!==digest||sha(JSON.stringify(body))!==digest||body.schemaVersion!==1||
    body.family!=='inventory-control'||body.releaseApproved!==false||body.marketValidated!==false||
    body.supplierPurchaseEnabled!==false||body.paymentEnabled!==false||
    body.realCustomers!==null||body.collectedRevenue!==null||
    !body.files||typeof body.files!=='object'||Array.isArray(body.files))fail('ARTIFACT_INVALID');
  if(names.length>20||JSON.stringify(names)!==JSON.stringify([...Object.keys(body.files),'manifest.json'].sort()))fail('ARTIFACT_INVALID');
  for(const [name,expected] of Object.entries(body.files)){
   if(!/^[A-Za-z0-9._-]+$/.test(name)||!NAMES.includes(name)&&!['README.md','recipe.json','package.json'].includes(name)||
    !/^[a-f0-9]{64}$/.test(expected))fail('ARTIFACT_INVALID');
   const f=path.join(directory,name),stat=fs.lstatSync(f);
   if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024||sha(fs.readFileSync(f))!==expected)fail('ARTIFACT_INVALID');
  }
  validateRecipe(JSON.parse(fs.readFileSync(path.join(directory,'recipe.json'),'utf8')));
  return {...body,digest};
 }catch{fail('ARTIFACT_INVALID');}
}
function stagePackage(compiled,directory){
 fs.mkdirSync(directory,{mode:0o700});safeDir(directory);
 for(const [name,content] of Object.entries(compiled.files))
  fs.writeFileSync(path.join(directory,name),content,{flag:'wx',mode:0o600});
 verifyInventoryPackage(directory,compiled.digest);return directory;
}
const CHECKS=['tenantIsolation','idempotentStock','roleSeparation','verifiedReorderWorkflow',
  'automaticInternalReplenishment','restartPersistence','loopbackBrowser','nonBilling'];
function validReceipt(row,recipeId,digest){
 return row&&row.kind==='assembled-inventory-acceptance'&&row.passed===true&&
  row.recipeId===recipeId&&row.artifactDigest===digest&&
  CHECKS.every(k=>row[k]===true)&&row.externalMessagesSent===0&&row.paymentsSent===0&&
  row.realCustomers===null&&row.collectedRevenue===null&&row.releaseApproved===false;
}
function acceptInventoryPackage(root,digest){
 const recipe=verifyInventoryPackage(root,digest),scratch=fs.mkdtempSync(path.join(os.tmpdir(),'factory-inventory-execution-'));
 try{
  const env={PATH:process.env.PATH||'',TZ:'UTC'};
  for(const k of ['SystemRoot','WINDIR','TMP','TEMP','TMPDIR'])if(process.env[k])env[k]=process.env[k];
  const child=spawnSync(process.execPath,[path.join(__dirname,'exercise-package.cjs'),root,scratch,digest],
    {encoding:'utf8',env,timeout:22000,killSignal:'SIGKILL',maxBuffer:128*1024,windowsHide:true});
  if(child.error||child.status!==0)fail('ACCEPTANCE_FAILED');
  let result;try{result=JSON.parse(child.stdout);}catch{fail('ACCEPTANCE_FAILED');}
  if(!validReceipt(result,recipe.recipeId,digest))fail('ACCEPTANCE_FAILED');
  verifyInventoryPackage(root,digest);return result;
 }finally{fs.rmSync(scratch,{recursive:true,force:true});}
}
function saveJson(file,value){
 const temp=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
 try{fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(temp,file);}
 finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
function manufactureInventoryBatch({outputRoot,catalog=recipes}={}){
 if(!Array.isArray(catalog)||catalog.length<1||catalog.length>12||
  new Set(catalog.map(r=>r?.id)).size!==catalog.length)fail('BATCH_INVALID');
 const list=catalog.map(validateRecipe);
 if(typeof outputRoot!=='string'||!path.isAbsolute(outputRoot))fail('OUTPUT_UNSAFE');
 const destinationRoot=path.resolve(outputRoot),relative=path.relative(ROOT,destinationRoot);
 if(!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))fail('OUTPUT_UNSAFE');
 fs.mkdirSync(destinationRoot,{recursive:true,mode:0o700});safeDir(destinationRoot);
 const lock=path.join(destinationRoot,'.inventory-build.lock');let fd;
 try{fd=fs.openSync(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')fail('MANUFACTURING_BUSY');throw e;}
 const report={kind:'inventory-family-manufacturing',family:'inventory-control',
  accepted:0,failed:0,reused:0,results:[],verification:'executed-packaged-inventory-lifecycle',
  marketValidated:false,realCustomers:null,collectedRevenue:null,
  paymentsSent:0,externalMessagesSent:0,releaseApproved:false};
 try{
  const verifyDir=path.join(destinationRoot,'verification'),quarantine=path.join(destinationRoot,'.quarantine');
  for(const dir of [verifyDir,quarantine]){fs.mkdirSync(dir,{recursive:true,mode:0o700});safeDir(dir);}
  for(const recipe of list){
   let pkg;try{pkg=compileInventoryPackage(recipe);}catch(e){report.failed++;report.results.push({id:recipe.id,status:'quarantined',reason:'SOURCE_INVALID'});continue;}
   const artifact=recipe.id+'-'+pkg.digest,dest=path.join(destinationRoot,artifact);
   const banned=path.join(quarantine,artifact+'.json');
   let result;
   if(fs.existsSync(banned)){
    result={id:recipe.id,digest:pkg.digest,status:'quarantined',reason:'PREVIOUS_FAILURE',attempts:0};
   }else if(fs.existsSync(dest)){
    try{
     verifyInventoryPackage(dest,pkg.digest);
     const evidence=acceptInventoryPackage(dest,pkg.digest);
     saveJson(path.join(verifyDir,artifact+'.json'),evidence);
     result={id:recipe.id,digest:pkg.digest,artifact,status:'accepted',reused:true,attempts:1};
    }catch{result={id:recipe.id,digest:pkg.digest,status:'quarantined',reason:'EXISTING_ARTIFACT_REJECTED',attempts:1};}
   }else{
    for(let attempt=1;attempt<=2&&!result;attempt++){
     const stage=fs.mkdtempSync(path.join(destinationRoot,'.inventory-stage-'));
     try{
      const candidate=stagePackage(pkg,path.join(stage,'app'));
      const evidence=acceptInventoryPackage(candidate,pkg.digest);
      if(fs.existsSync(dest))fail('OUTPUT_EXISTS');
      fs.renameSync(candidate,dest);
      saveJson(path.join(verifyDir,artifact+'.json'),evidence);
      result={id:recipe.id,digest:pkg.digest,artifact,status:'accepted',reused:false,attempts:attempt};
     }catch{
      if(attempt===2)result={id:recipe.id,digest:pkg.digest,status:'quarantined',reason:'ACCEPTANCE_FAILED',attempts:attempt};
     }finally{fs.rmSync(stage,{recursive:true,force:true});}
    }
   }
   if(result.status==='accepted'){report.accepted++;if(result.reused)report.reused++;}
   else{report.failed++;saveJson(banned,result);}
   report.results.push(result);saveJson(path.join(destinationRoot,'manufacturing-report.json'),report);
  }
  return report;
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
module.exports={compileInventoryPackage,verifyInventoryPackage,manufactureInventoryBatch,acceptInventoryPackage,CHECKS};
