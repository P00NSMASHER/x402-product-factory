'use strict';
// Deterministic, source-pinned unattended SaaS queue across quote and inventory families.
// NO contacts, production deployment, payment, new GitHub schedule or invented buyers.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {loadOpportunities}=require('./cross-family');
const quote=require('../quote-family/manufacturing');
const inventory=require('../inventory-family/manufacturing');
const REPO=path.resolve(__dirname,'../../..');
const EPOCH=Date.parse('2026-10-13T00:00:00Z'),SLOT=21600000;
const fail=code=>{throw Error(code);},digest=v=>crypto.createHash('sha256').update(v).digest('hex');
const inDir=(parent,item)=>{const r=path.relative(parent,item);return r===''||
  (!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));};
function safeRoot(raw,{create=false}={}){
 if(typeof raw!=='string'||!path.isAbsolute(raw)||inDir(REPO,path.resolve(raw)))fail('CROSS_PATH_UNSAFE');
 const dir=path.resolve(raw);
 if(create)fs.mkdirSync(dir,{recursive:true,mode:0o700});
 let s;try{s=fs.lstatSync(dir);}catch{fail('CROSS_PATH_UNSAFE');}
 if(!s.isDirectory()||s.isSymbolicLink()||fs.realpathSync(dir)!==dir||
    (process.platform!=='win32'&&((s.mode&0o077)!==0||
     (typeof process.getuid==='function'&&s.uid!==process.getuid()))))fail('CROSS_PATH_UNSAFE');
 return dir;
}
function readPrivate(p,max=65536){
 let s;try{s=fs.lstatSync(p);}catch{fail('CROSS_RECEIPT_INVALID');}
 if(!s.isFile()||s.isSymbolicLink()||s.size<2||s.size>max||
    (process.platform!=='win32'&&((s.mode&0o077)!==0||
     (typeof process.getuid==='function'&&s.uid!==process.getuid()))))fail('CROSS_RECEIPT_INVALID');
 try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{fail('CROSS_RECEIPT_INVALID');}
}
function clock(at){
 if(typeof at!=='string'||!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(at))
  fail('CROSS_TIME_INVALID');
 const t=Date.parse(at);
 if(!Number.isFinite(t)||t<EPOCH||new Date(t).toISOString().slice(0,19)!==at.slice(0,19)||
    new Date(t).getUTCFullYear()>2099)fail('CROSS_TIME_INVALID');
 return Math.floor((t-EPOCH)/SLOT);
}
function expectedPackage(entry){
 return entry.family==='quote-to-order'?quote.compileQuoteApp(entry.recipe).digest:
   inventory.compileInventoryPackage(entry.recipe).digest;
}
function verifySlot(output,receipt,entries){
 if(receipt?.recoveredLate!==undefined){
  const stamp=receipt.executedAt;
  if(receipt.recoveredLate!==true||typeof stamp!=='string'||
     !/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(stamp)||
     !Number.isFinite(Date.parse(stamp))||
     new Date(Date.parse(stamp)).toISOString().slice(0,19)!==stamp.slice(0,19)||
     Date.parse(stamp)<EPOCH+(receipt.cycle+1)*SLOT)
    fail('CROSS_RECEIPT_INVALID');
 }else if(receipt?.executedAt!==undefined)fail('CROSS_RECEIPT_INVALID');
 if(!receipt||receipt.kind!=='cross-family-autonomous-slot'||receipt.schemaVersion!==1||
    !Number.isSafeInteger(receipt.cycle)||receipt.cycle<0||receipt.cycle>110000||
    !['quote-to-order','inventory-control'].includes(receipt.family)||
    typeof receipt.key!=='string'||!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(receipt.key)||
    !/^[a-f0-9]{64}$/.test(receipt.sourceDigest||'')||
    !/^[a-f0-9]{64}$/.test(receipt.packageDigest||'')||
    !/^[a-f0-9]{64}$/.test(receipt.digest||'')||
    receipt.digest!==digest(JSON.stringify({...receipt,digest:undefined}))||
    receipt.status!=='accepted'||receipt.accepted!==1||receipt.failed!==0||
    receipt.verification!==(receipt.family==='quote-to-order'?
      'executed-packaged-quote-lifecycle':'executed-packaged-inventory-lifecycle')||
    receipt.marketValidated!==false||receipt.releaseApproved!==false||
    receipt.realCustomers!==null||receipt.collectedRevenue!==null||
    receipt.transmittedMessages!==0||receipt.paymentsSent!==0)fail('CROSS_RECEIPT_INVALID');
 const entry=entries.find(x=>x.key===receipt.key&&x.family===receipt.family);
 if(!entry||entry.proposalDigest!==receipt.sourceDigest||
    expectedPackage(entry)!==receipt.packageDigest)fail('CROSS_SOURCE_DRIFT');
 const root=safeRoot(path.join(output,'packages','cycle-'+receipt.cycle));
 const pkg=path.join(root,receipt.key+'-'+receipt.packageDigest),s=fs.lstatSync(pkg);
 if(!s.isDirectory()||s.isSymbolicLink())fail('CROSS_PACKAGE_INVALID');
 const report=readPrivate(path.join(root,'manufacturing-report.json'));
 let verified,evidence;
 try{
  if(entry.family==='quote-to-order'){
   verified=quote.verifyQuoteApp(pkg,receipt.packageDigest);
   evidence=readPrivate(path.join(root,'verification',entry.key+'-'+receipt.packageDigest+'.json'));
   if(!quote.validAcceptance(evidence,entry.key,receipt.packageDigest))fail('CROSS_EVIDENCE_INVALID');
   if(report.kind!=='quote-family-manufacturing'||report.accepted!==1||report.failed!==0||
      report.verification!==receipt.verification||!Array.isArray(report.apps)||
      report.apps.length!==1||report.apps[0].id!==entry.key||
      report.apps[0].digest!==receipt.packageDigest||
      report.apps[0].status!=='accepted')fail('CROSS_EVIDENCE_INVALID');
  }else{
   verified=inventory.verifyInventoryPackage(pkg,receipt.packageDigest);
   evidence=readPrivate(path.join(root,'verification',entry.key+'-'+receipt.packageDigest+'.json'));
   if(!evidence||evidence.kind!=='assembled-inventory-acceptance'||evidence.passed!==true||
      evidence.recipeId!==entry.key||evidence.artifactDigest!==receipt.packageDigest||
      !inventory.CHECKS.every(k=>evidence[k]===true)||
      evidence.externalMessagesSent!==0||evidence.paymentsSent!==0||
      evidence.realCustomers!==null||evidence.collectedRevenue!==null||
      evidence.releaseApproved!==false)fail('CROSS_EVIDENCE_INVALID');
   if(report.kind!=='inventory-family-manufacturing'||report.accepted!==1||
      report.failed!==0||report.verification!==receipt.verification||
      !Array.isArray(report.results)||report.results.length!==1||
      report.results[0].status!=='accepted'||report.results[0].id!==entry.key||
      report.results[0].digest!==receipt.packageDigest)fail('CROSS_EVIDENCE_INVALID');
  }
 }catch{fail('CROSS_EVIDENCE_INVALID');}
 if(verified.recipeId!==entry.key||verified.releaseApproved!==false||
    verified.realCustomers!==null||verified.collectedRevenue!==null)fail('CROSS_EVIDENCE_INVALID');
 return entry;
}
function readJournal(output,entries){
 const receiptsDir=path.join(output,'receipts');
 if(!fs.existsSync(receiptsDir))return [];
 safeRoot(receiptsDir);
 const names=fs.readdirSync(receiptsDir);
 if(names.length>64)fail('CROSS_JOURNAL_CAPACITY');
 const list=[],ids=new Set(),cycles=new Set();
 for(const name of names){
  if(!/^cycle-(0|[1-9]\d{0,5})\.json$/.test(name))fail('CROSS_RECEIPT_INVALID');
  const row=readPrivate(path.join(receiptsDir,name));
  if(name!=='cycle-'+row?.cycle+'.json'||ids.has(row.key)||cycles.has(row.cycle))
   fail('CROSS_JOURNAL_DUPLICATE');
  verifySlot(output,row,entries);
  ids.add(row.key);cycles.add(row.cycle);list.push(row);
 }
 return list.sort((a,b)=>a.cycle-b.cycle);
}
function planCrossCycle({at=new Date().toISOString(),outputRoot,historicalRepair=false}={}){
 if(typeof historicalRepair!=='boolean')fail('CROSS_HISTORY_INVALID');
 const cycle=clock(at),entries=loadOpportunities();
 const root=outputRoot?safeRoot(outputRoot):null;
 const journal=root?readJournal(root,entries):[];
 if(journal.some(v=>v.cycle>cycle)&&!historicalRepair)fail('CROSS_FUTURE_RECEIPT');
 const existing=journal.find(v=>v.cycle===cycle);
 let selected=existing?entries.find(x=>x.key===existing.key):null;
 if(!selected){
  const completed=new Set(journal.map(v=>v.key));
  const remaining=entries.filter(v=>!completed.has(v.key));
  const prefer=cycle%2===0?'quote-to-order':'inventory-control';
  selected=remaining.find(v=>v.family===prefer)||remaining[0]||null;
 }
 return {kind:'cross-family-autonomous-plan',cycle,scheduleHours:6,
  selected:selected?{key:selected.key,family:selected.family,sourceDigest:selected.proposalDigest,
    packageDigest:expectedPackage(selected),technicalFitScore:selected.technicalFitScore}:null,
  completed:journal.length,available:entries.length,
  historicRepairMode:historicalRepair,
  exhausted:selected===null,nextAction:selected?'manufacture_and_verify_one':
    'new_independent_research_required',
  buyerDemandValidated:false,sourceVerification:'operator_provided_unverified',
  transmittedMessages:0,paymentsSent:0,realCustomers:null,collectedRevenue:null,
  publicDeploymentEnabled:false,releaseApproved:false};
}
function atomicReceipt(filename,value){
 const body={...value,digest:digest(JSON.stringify({...value,digest:undefined}))};
 const temp=filename+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
 try{
  const fd=fs.openSync(temp,'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(body,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(temp,filename);
 }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
 return body;
}
function runCrossCycle({at=new Date().toISOString(),outputRoot,historicalRepair=false}={}){
 if(typeof historicalRepair!=='boolean')fail('CROSS_HISTORY_INVALID');
 if(historicalRepair){
  const scheduled=clock(at),actual=clock(new Date().toISOString());
  if(scheduled>=actual)fail('CROSS_HISTORY_INVALID');
 }
 if(typeof outputRoot!=='string')fail('CROSS_PATH_UNSAFE');
 const output=safeRoot(outputRoot,{create:true});
 const roots={packages:path.join(output,'packages'),receipts:path.join(output,'receipts')};
 Object.values(roots).forEach(x=>safeRoot(x,{create:true}));
 const lock=path.join(output,'.cross-director.lock');
 let fd;try{fd=fs.openSync(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')fail('CROSS_BUSY');throw e;}
 try{
  const plan=planCrossCycle({at,outputRoot:output,historicalRepair});
  if(plan.exhausted)return {...plan,accepted:0,failed:0,reused:0,
    verifiedSlot:null,verification:'no-new-independent-idea'};
  const found=readJournal(output,loadOpportunities()).find(v=>v.cycle===plan.cycle);
  if(found)return {...plan,accepted:1,failed:0,reused:1,verifiedSlot:found,
   verification:'independently_reverified_packaged_lifecycle'};
  const entry=loadOpportunities().find(v=>v.key===plan.selected.key);
  if(!entry||entry.proposalDigest!==plan.selected.sourceDigest)fail('CROSS_SOURCE_DRIFT');
  const buildRoot=path.join(roots.packages,'cycle-'+plan.cycle);
  if(fs.existsSync(buildRoot))fail('CROSS_UNCOMMITTED_PACKAGE');
  const out=entry.family==='quote-to-order'?
   quote.manufactureQuoteBatch({outputRoot:buildRoot,recipes:[entry.recipe]}):
   inventory.manufactureInventoryBatch({outputRoot:buildRoot,catalog:[entry.recipe]});
  if(out.accepted!==1||out.failed!==0||out.releaseApproved!==false||
     out.verification!==(entry.family==='quote-to-order'?
      'executed-packaged-quote-lifecycle':'executed-packaged-inventory-lifecycle'))
   fail('CROSS_MANUFACTURING_FAILED');
  const late=historicalRepair?{recoveredLate:true,executedAt:new Date().toISOString()}:{};
  const receipt=atomicReceipt(path.join(roots.receipts,'cycle-'+plan.cycle+'.json'),
   {kind:'cross-family-autonomous-slot',schemaVersion:1,cycle:plan.cycle,...late,
    key:entry.key,family:entry.family,sourceDigest:entry.proposalDigest,
    packageDigest:plan.selected.packageDigest,status:'accepted',accepted:1,failed:0,
    verification:out.verification,marketValidated:false,releaseApproved:false,
    realCustomers:null,collectedRevenue:null,transmittedMessages:0,paymentsSent:0});
  verifySlot(output,receipt,loadOpportunities());
  return {...plan,accepted:1,failed:0,reused:0,verifiedSlot:receipt,
   verification:'independently_executed_packaged_lifecycle'};
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
module.exports={planCrossCycle,runCrossCycle,verifySlot,readJournal,safeRoot,clock};
