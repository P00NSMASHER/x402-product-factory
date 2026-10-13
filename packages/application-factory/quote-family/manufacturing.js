'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {validateRecipe}=require('./kernel'),catalog=require('./recipes.json');
const SOURCE=path.resolve(__dirname),REPO=path.resolve(__dirname,'../../..');
const BASE_FILES=['kernel.js','store.js','server.js','index.html','style.css','client.js','run.js'];
const fail=code=>{throw Error(code);};
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function validDir(dir,code){
 const stat=fs.lstatSync(dir),real=fs.realpathSync(dir);
 if(!stat.isDirectory()||stat.isSymbolicLink()||
  (process.platform==='win32'?real.toLowerCase():real)!==(process.platform==='win32'?path.resolve(dir).toLowerCase():path.resolve(dir))||
  (process.platform!=='win32'&&(stat.mode&0o077)))fail(code);
}
function outsideRepo(dir){
 if(typeof dir!=='string'||!path.isAbsolute(dir))fail('OUTPUT_UNSAFE');
 const dest=path.resolve(dir),r=path.relative(REPO,dest);
 if(!r||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r)))fail('OUTPUT_UNSAFE');
 return dest;
}
function compileQuoteApp(raw,{sourceRoot=SOURCE}={}){
 if(typeof sourceRoot!=='string'||path.resolve(sourceRoot)!==SOURCE)fail('SOURCE_INVALID');
 const recipe=validateRecipe(raw),files=Object.create(null);
 for(const filename of BASE_FILES){const abs=path.join(SOURCE,filename),stat=fs.lstatSync(abs);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>256*1024)fail('SOURCE_INVALID');
  files[filename]=fs.readFileSync(abs,'utf8');
 }
 files['recipe.json']=JSON.stringify(recipe,null,2)+'\n';
 files['package.json']=JSON.stringify({name:'factory-'+recipe.id,version:'0.0.0',private:true,
  description:recipe.outcome,engines:{node:'>=22.13.0'},scripts:{start:'node run.js serve',
   provision:'node run.js provision',sweep:'node run.js sweep'}},null,2)+'\n';
 files['README.md']='# '+recipe.title+' — local synthetic quote-to-order candidate\n\n'+recipe.outcome+'\n\n'+
  'A complete local responsive web application with durable SQLite, separate operator/reviewer keys, itemized quotes in integer cents, manual approval, order handoff, private audit events, idempotent writes, and headless quote expiry.\n\n'+
  'Use ONLY synthetic testing data. It is not approved for live customer information, cloud hosting, real payment, invoices, production security, public marketing, legal/tax calculations or actual buyer use. Product prices are manual example inputs, not recommended or independently observed market prices.\n\n'+
  'Node.js 22.13+ required. Create a PRIVATE absolute state directory OUTSIDE this package. Provision role credentials into separate operator-only/reviewer-only files:\n\n'+
  '```sh\nnode run.js provision --state-dir /absolute/private/quotes --tenant synthetic-company\n'+
  'node run.js serve --state-dir /absolute/private/quotes --port 8788\n```\n\n'+
  'Browse http://127.0.0.1:8788/app and paste either private role key. HTTP binds to loopback only; never expose it publicly. No credentials are output to the console. The browser never stores keys in localStorage, sessionStorage or cookies. The server performs private internal quote expiry checks even when no browser is open.\n\n'+
  'This is not a billing or payment integration. Orders are handoff records only. A reviewer must approve a nonexpired quote before the operator can convert it, and the system has no email, CRM or payments transport. All releases remain disabled.\n';
 const inventory=Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)).map(([n,v])=>[n,hash(v)]));
 const manifest={schemaVersion:1,generator:'isolated-quote-to-order-v1',recipeId:recipe.id,family:recipe.family,
  mode:'local-synthetic-candidate',releaseApproved:false,billingEnabled:false,externalDelivery:false,
  checkoutEnabled:false,marketValidated:false,realCustomers:null,collectedRevenue:null,
  capabilities:['durable-quotes','line-price-math','role-separated-approval','idempotent-orders',
   'automatic-expiration','private-audit-inbox','responsive-browser'],files:inventory};
 const digest=hash(JSON.stringify(manifest));files['manifest.json']=JSON.stringify({...manifest,digest},null,2)+'\n';
 return {recipeId:recipe.id,files,manifest:{...manifest,digest},digest};
}
function verifyQuoteApp(dir,expectedDigest){
 try{
  if(!/^[a-f0-9]{64}$/.test(expectedDigest)||typeof dir!=='string'||!path.isAbsolute(dir))fail('PACKAGE_INVALID');
  validDir(dir,'PACKAGE_INVALID');
  const names=fs.readdirSync(dir).sort();if(names.length>40)fail('PACKAGE_INVALID');
  const stat=fs.lstatSync(path.join(dir,'manifest.json'));if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768)fail('PACKAGE_INVALID');
  const {digest,...manifest}=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  if(digest!==expectedDigest||hash(JSON.stringify(manifest))!==digest||manifest.schemaVersion!==1||
   manifest.generator!=='isolated-quote-to-order-v1'||manifest.family!=='quote-to-order'||
   manifest.billingEnabled!==false||manifest.checkoutEnabled!==false||manifest.externalDelivery!==false||
   manifest.releaseApproved!==false||manifest.marketValidated!==false||manifest.realCustomers!==null||
   manifest.collectedRevenue!==null||!manifest.files||Array.isArray(manifest.files))fail('PACKAGE_INVALID');
  const expected=[...Object.keys(manifest.files),'manifest.json'].sort();if(JSON.stringify(expected)!==JSON.stringify(names))fail('PACKAGE_INVALID');
  for(const name of Object.keys(manifest.files)){
   if(!/^[a-zA-Z0-9._-]+$/.test(name)||name==='manifest.json')fail('PACKAGE_INVALID');
   const p=path.join(dir,name),s=fs.lstatSync(p);
   if(!s.isFile()||s.isSymbolicLink()||s.size>256*1024||hash(fs.readFileSync(p))!==manifest.files[name])fail('PACKAGE_INVALID');
  }
  const recipe=validateRecipe(JSON.parse(fs.readFileSync(path.join(dir,'recipe.json'),'utf8')));
  if(recipe.id!==manifest.recipeId)return fail('PACKAGE_INVALID');
  return {...manifest,digest};
 }catch{fail('PACKAGE_INVALID');}
}
function writeQuoteApp(app,outputDir){
 const output=outsideRepo(outputDir),parent=path.dirname(output);
 fs.mkdirSync(parent,{recursive:true,mode:0o700});validDir(parent,'OUTPUT_UNSAFE');
 if(fs.existsSync(output))fail('OUTPUT_EXISTS');
 const stage=fs.mkdtempSync(path.join(parent,'.quote-stage-'));
 try{
  for(const [name,contents] of Object.entries(app.files))fs.writeFileSync(path.join(stage,name),contents,{flag:'wx',mode:0o600});
  verifyQuoteApp(stage,app.digest);
  if(fs.existsSync(output))fail('OUTPUT_EXISTS');fs.renameSync(stage,output);
  return {output,digest:app.digest};
 }finally{if(fs.existsSync(stage))fs.rmSync(stage,{recursive:true,force:true});}
}
function validAcceptance(row,id,digest){return row&&row.kind==='quote-app-assembled-acceptance'&&row.passed===true&&
 row.recipeId===id&&row.artifactDigest===digest&&
 ['tenantIsolation','twoRoleGate','idempotentOrder','restartPersistence','internalExpiry','htmlServed'].every(k=>row[k]===true)&&
 row.externalMessagesSent===0&&row.paymentsSent===0&&row.realCustomers===null&&row.collectedRevenue===null&&row.releaseApproved===false;}
function acceptQuoteApp(root,digest){
 const app=verifyQuoteApp(root,digest);
 const env={PATH:process.env.PATH||'',TZ:'UTC'};
 for(const key of ['SystemRoot','WINDIR','TEMP','TMP','TMPDIR'])if(process.env[key])env[key]=process.env[key];
 const child=spawnSync(process.execPath,[path.join(__dirname,'exercise-package.cjs'),root,digest],
  {encoding:'utf8',env,timeout:18000,killSignal:'SIGKILL',maxBuffer:128*1024,windowsHide:true});
 if(child.error||child.status!==0)fail('ACCEPTANCE_FAILED');
 let result;try{result=JSON.parse(child.stdout);}catch{fail('ACCEPTANCE_FAILED');}
 if(!validAcceptance(result,app.recipeId,digest))fail('ACCEPTANCE_FAILED');
 verifyQuoteApp(root,digest);return result;
}
function privateJson(file,value){
 const tmp=file+'.'+crypto.randomBytes(7).toString('hex')+'.tmp';
 try{fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(tmp,file);}
 finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
function manufactureQuoteBatch({outputRoot,recipes=catalog,accept=acceptQuoteApp}={}){
 const dir=outsideRepo(outputRoot),validated=recipes.map(validateRecipe);
 if(!Array.isArray(recipes)||recipes.length<1||recipes.length>12||new Set(validated.map(r=>r.id)).size!==validated.length)fail('BATCH_INVALID');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});validDir(dir,'OUTPUT_UNSAFE');
 const lock=path.join(dir,'.quote-build.lock');let fd;
 try{fd=fs.openSync(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')fail('MANUFACTURING_BUSY');throw e;}
 const result={kind:'quote-family-manufacturing',accepted:0,failed:0,reused:0,apps:[],
  verification:accept===acceptQuoteApp?'executed-packaged-quote-lifecycle':'injected-test-only',
  realCustomers:null,collectedRevenue:null,transmittedMessages:0,paymentsSent:0,releaseApproved:false};
 try{
  const receipts=path.join(dir,'verification'),quarantine=path.join(dir,'.quarantine');
  for(const d of [receipts,quarantine]){fs.mkdirSync(d,{recursive:true,mode:0o700});validDir(d,'OUTPUT_UNSAFE');}
  for(const recipe of validated){const app=compileQuoteApp(recipe),folder=path.join(dir,recipe.id+'-'+app.digest);
   const denied=path.join(quarantine,recipe.id+'.json');let accepted=false,reused=false,proof,reason='ACCEPTANCE_FAILED';
   if(fs.existsSync(denied))reason='PREVIOUS_FAILURE';
   else try{
    if(fs.existsSync(folder)){reused=true;verifyQuoteApp(folder,app.digest);proof=accept(folder,app.digest);}
    else{const staging=fs.mkdtempSync(path.join(dir,'.candidate-'));
     try{const built=path.join(staging,'app');writeQuoteApp(app,built);proof=accept(built,app.digest);
      if(!validAcceptance(proof,recipe.id,app.digest))fail('ACCEPTANCE_FAILED');
      verifyQuoteApp(built,app.digest);fs.renameSync(built,folder);
     }finally{fs.rmSync(staging,{recursive:true,force:true});}
    }
    if(!validAcceptance(proof,recipe.id,app.digest))fail('ACCEPTANCE_FAILED');
    verifyQuoteApp(folder,app.digest);privateJson(path.join(receipts,recipe.id+'.json'),proof);accepted=true;
   }catch{reason=fs.existsSync(folder)?'EXISTING_ARTIFACT_REJECTED':'ACCEPTANCE_FAILED';}
   if(accepted){result.accepted++;if(reused)result.reused++;result.apps.push({id:recipe.id,digest:app.digest,status:'accepted',reused});}
   else{result.failed++;const record={id:recipe.id,digest:app.digest,status:'quarantined',reason};privateJson(denied,record);result.apps.push(record);}
  }
  privateJson(path.join(dir,'manufacturing-report.json'),result);return result;
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
module.exports={compileQuoteApp,writeQuoteApp,verifyQuoteApp,manufactureQuoteBatch,acceptQuoteApp,validAcceptance};
