'use strict';
// Copies only trusted factory implementation files; never crawls live state or arbitrary dependencies.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validateRecipe}=require('../kernel');
const {buildOffer,renderOffer}=require('../growth/offers');
const ROOT=path.resolve(__dirname,'../../..');
const PREFIX='packages/application-factory/';
const SOURCE_FILES=Object.freeze([
  PREFIX+'kernel.js',
  PREFIX+'growth/offers.js',
  ...['runtime.js','http.js','worker.js','browser-routes.js','browser-sessions.js','browser-transport.js',
    'browser-client.js','browser.html','browser.css','vault.js','vault-http.js','recovery.js','recovery-supervisor.js'].map(n=>PREFIX+'runtime/'+n),
  'scripts/run-application-runtime.js','scripts/application-recovery.js'
]);
const fail=code=>{throw new Error(code);};
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const normalize=p=>process.platform==='win32'?p.toLowerCase():p;
function canonicalDirectory(dir,code){
  const stat=fs.lstatSync(dir);
  if(!stat.isDirectory()||stat.isSymbolicLink()||normalize(fs.realpathSync(dir))!==normalize(path.resolve(dir)))fail(code);
}
function sourceFiles(sourceRoot){
  try{
    if(typeof sourceRoot!=='string'||!path.isAbsolute(sourceRoot))fail('SOURCE_INVALID');
    canonicalDirectory(sourceRoot,'SOURCE_INVALID');
    return Object.fromEntries(SOURCE_FILES.map(rel=>{
      const filename=path.join(sourceRoot,rel),stat=fs.lstatSync(filename);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024||normalize(fs.realpathSync(filename))!==normalize(filename))fail('SOURCE_INVALID');
      return [rel,fs.readFileSync(filename,'utf8')];
    }));
  }catch{fail('SOURCE_INVALID');}
}
function compileApplication(input,{sourceRoot=ROOT}={}){
  const recipe=validateRecipe(input),files=sourceFiles(sourceRoot);
  files[PREFIX+'recipes.json']=JSON.stringify([recipe],null,2)+'\n';
  const offer=buildOffer(recipe);
  files['growth/offer.json']=JSON.stringify(offer,null,2)+'\n';
  files['growth/index.html']=renderOffer(offer);
  files['package.json']=JSON.stringify({name:'factory-'+recipe.id,version:'0.0.0',private:true,
    description:recipe.outcome,engines:{node:'>=22.13.0'},scripts:{start:'node scripts/run-application-runtime.js serve',
      provision:'node scripts/run-application-runtime.js provision',sweep:'node scripts/run-application-runtime.js sweep',recovery:'node scripts/application-recovery.js'}},null,2)+'\n';
  files['README.md']='# '+recipe.title+' — assembled local candidate\n\n'+recipe.outcome+
    '\n\nThis package contains its own browser interface, persistent SQLite service, internal automation, opt-in encrypted evidence and verified recovery tools. Use synthetic data only; this is not a commercial launch or production security certification.\n\n'+
    'Requires Node.js 22.13+. No npm install or network dependencies are needed. Create private state OUTSIDE this application directory:\n\n'+
    '```sh\nnode scripts/run-application-runtime.js provision --state-dir /absolute/private/state --tenant example-team --credential-file /absolute/private/state/operator.json\n'+
    'node scripts/run-application-runtime.js serve --state-dir /absolute/private/state --port 8789\n```\n\n'+
    'Open the loopback service /app path, then use the privately issued workspace key. Do not expose the loopback HTTP service publicly. Closing the browser does not stop the running service; stopping the service stops its worker.\n\n'+
    'Evidence storage is disabled unless FACTORY_VAULT_KEY_HEX supplies an operator-managed random 256-bit hex key. Recovery additionally requires FACTORY_BACKUP_KEY_HEX and FACTORY_BACKUP_DIR. Never save keys or customer state in this package. Backups are local; key loss is not recoverable by this package.\n\n'+
    'Draft pilot page: growth/index.html (concept only, no contact collection or checkout). This package does not include an authenticated buyer-proof ledger; use the operator-only Growth Lab in the source repository to track redacted evidence. Public signup, hosted TLS, malware scanning, key custody/rotation, off-site backup, billing, customer acquisition and independent privacy/security approval are outstanding. No email, SMS, payments, telemetry, or sales are enabled.\n';
  const inventory=Object.fromEntries(Object.entries(files).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,content])=>[name,hash(content)]));
  const manifest={schemaVersion:1,generator:'full-stack-local-v1',recipeId:recipe.id,family:recipe.family,
    mode:'local-candidate',releaseApproved:false,billingEnabled:false,externalDelivery:false,realCustomers:null,collectedRevenue:null,marketValidation:'unverified',marketProof:null,
    capabilities:['buyer-offer-preview','browser-workspace','credential-scoped-api','persistent-workflow','headless-internal-automation','opt-in-encrypted-evidence','opt-in-verified-recovery'],files:inventory};
  const digest=hash(JSON.stringify(manifest));files['manifest.json']=JSON.stringify({...manifest,digest},null,2)+'\n';
  return {id:recipe.id,digest,manifest:{...manifest,digest},files};
}
function walkFiles(root){
  const names=[];
  function walk(dir,rel=''){
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const name=rel+entry.name,full=path.join(dir,entry.name);
      if(entry.isSymbolicLink())fail('ARTIFACT_INVALID');
      if(entry.isDirectory())walk(full,name+'/');else if(entry.isFile())names.push(name);else fail('ARTIFACT_INVALID');
      if(names.length>64)fail('ARTIFACT_INVALID');
    }
  }walk(root);return names.sort();
}
function verifyApplication(directory,expectedDigest){
  try{
    if(typeof expectedDigest!=='string'||!/^[0-9a-f]{64}$/.test(expectedDigest))fail('ARTIFACT_INVALID');
    canonicalDirectory(directory,'ARTIFACT_INVALID');
    const filename=path.join(directory,'manifest.json');
    if(fs.lstatSync(filename).size>65536||!fs.lstatSync(filename).isFile()||fs.lstatSync(filename).isSymbolicLink())fail('ARTIFACT_INVALID');
    const {digest,...manifest}=JSON.parse(fs.readFileSync(filename,'utf8'));
    if(digest!==expectedDigest||hash(JSON.stringify(manifest))!==expectedDigest||manifest.schemaVersion!==1||manifest.releaseApproved!==false||
       !manifest.files||typeof manifest.files!=='object'||Array.isArray(manifest.files))fail('ARTIFACT_INVALID');
    const expected=[...Object.keys(manifest.files),'manifest.json'].sort(),actual=walkFiles(directory);
    if(JSON.stringify(expected)!==JSON.stringify(actual))fail('ARTIFACT_INVALID');
    for(const rel of Object.keys(manifest.files)){
      if(!/^[A-Za-z0-9._/-]+$/.test(rel)||rel.startsWith('/')||rel.split('/').some(p=>!p||p==='.'||p==='..'))fail('ARTIFACT_INVALID');
      const file=path.join(directory,rel),stat=fs.lstatSync(file);
      if(!stat.isFile()||stat.size>1024*1024||hash(fs.readFileSync(file))!==manifest.files[rel])fail('ARTIFACT_INVALID');
    }
    return {...manifest,digest};
  }catch{fail('ARTIFACT_INVALID');}
}
function writeApplication(app,destination){
  if(!app||!app.files||typeof destination!=='string'||!path.isAbsolute(destination))fail('OUTPUT_UNSAFE');
  const output=path.resolve(destination),parent=path.dirname(output);
  try{canonicalDirectory(parent,'OUTPUT_UNSAFE');}catch{fail('OUTPUT_UNSAFE');}
  if(fs.existsSync(output))fail('OUTPUT_EXISTS');
  const stage=fs.mkdtempSync(path.join(parent,'.assemble-'));let claimed=false;
  try{
    for(const [rel,content]of Object.entries(app.files)){
      if(!/^[A-Za-z0-9._/-]+$/.test(rel)||rel.startsWith('/')||rel.split('/').some(p=>!p||p==='.'||p==='..')||typeof content!=='string')fail('ARTIFACT_INVALID');
      const file=path.join(stage,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content,{flag:'wx',mode:0o600});
    }
    verifyApplication(stage,app.digest);
    // Exclusively claim the output. Callers keep it private until acceptance succeeds.
    fs.mkdirSync(output,{mode:0o700});claimed=true;
    for(const name of fs.readdirSync(stage))fs.renameSync(path.join(stage,name),path.join(output,name));
    verifyApplication(output,app.digest);return {output,digest:app.digest};
  }catch(error){if(claimed)fs.rmSync(output,{recursive:true,force:true});if(error.code==='EEXIST')fail('OUTPUT_EXISTS');throw error;}
  finally{fs.rmSync(stage,{recursive:true,force:true});}
}
module.exports={SOURCE_FILES,compileApplication,writeApplication,verifyApplication};
