'use strict';
// Restore verified cross-family app history between ephemeral CI runners, never trust an archive label.
// Reads original source-hashed receipts and independently verified package bytes before copying.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {readJournal,verifySlot,safeRoot}=require('./cross-cycle');
const {loadOpportunities}=require('./cross-family');
const fail=code=>{throw Error(code);};
const exists=file=>{try{fs.lstatSync(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
function privateDir(raw){const d=safeRoot(raw,{create:true});return d;}
function privateFile(p){
 const st=fs.lstatSync(p);
 if(!st.isFile()||st.isSymbolicLink()||st.size<2||st.size>65536||
   (process.platform!=='win32'&&((st.mode&0o077)!==0||
    (typeof process.getuid==='function'&&st.uid!==process.getuid()))))fail('CROSS_CHECKPOINT_INVALID');
 return fs.readFileSync(p);
}
function same(a,b){return crypto.createHash('sha256').update(privateFile(a)).digest('hex')===
 crypto.createHash('sha256').update(privateFile(b)).digest('hex');}
function restoreCrossCheckpoint({sourceRoot,outputRoot,maxSlots=24}={}){
 if(!Number.isSafeInteger(maxSlots)||maxSlots<1||maxSlots>32)fail('CROSS_CHECKPOINT_CONFIG');
 const from=safeRoot(sourceRoot),to=safeRoot(outputRoot,{create:true});
 if(from===to||path.relative(from,to)===''||path.relative(to,from)==='')fail('CROSS_CHECKPOINT_PATH');
 const source=path.join(from,'cross-family'),target=path.join(to,'cross-family');
 const report={kind:'cross-family-checkpoint-restore',checked:0,imported:0,alreadyPresent:0,
  restoredKeys:[],mode:'synthetic-only',externalContacts:0,paymentsSent:0,
  realCustomers:null,collectedRevenue:null,releaseApproved:false};
 if(!exists(source))return report;
 safeRoot(source);
 const entries=loadOpportunities();
 const journal=readJournal(source,entries);
 if(journal.length>maxSlots)fail('CROSS_CHECKPOINT_CAPACITY');
 safeRoot(target,{create:true});
 const receiptDir=privateDir(path.join(target,'receipts')),
  packagesDir=privateDir(path.join(target,'packages'));
 const prior=readJournal(target,entries),previous=new Map(prior.map(x=>[x.cycle,x]));
 const lock=path.join(target,'.checkpoint-lock');let fd;
 try{fd=fs.openSync(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')fail('CROSS_CHECKPOINT_BUSY');throw e;}
 try{
  // Do not copy ANYTHING until original candidate identities have been checked.
  for(const row of journal){
   const old=previous.get(row.cycle);
   if(old&&(old.digest!==row.digest||old.key!==row.key))fail('CROSS_CHECKPOINT_CONFLICT');
   if([...previous.values()].some(x=>x.key===row.key&&x.cycle!==row.cycle))
    fail('CROSS_CHECKPOINT_CONFLICT');
   const dir=path.join(packagesDir,'cycle-'+row.cycle);
   if(!old&&exists(path.join(receiptDir,'cycle-'+row.cycle+'.json')))
    fail('CROSS_CHECKPOINT_CONFLICT');
   if(!old&&exists(dir))fail('CROSS_CHECKPOINT_CONFLICT');
  }
  for(const row of journal){
   report.checked++;
   if(previous.has(row.cycle)){
    report.alreadyPresent++;continue;
   }
   const fromPackage=path.join(source,'packages','cycle-'+row.cycle);
   const stage=fs.mkdtempSync(path.join(target,'.checkpoint-stage-'));
   try{
    const stagePackages=privateDir(path.join(stage,'packages'));
    const stageReceipts=privateDir(path.join(stage,'receipts'));
    const srcArtifact=path.join(fromPackage,row.key+'-'+row.packageDigest);
    const destPackage=path.join(stagePackages,'cycle-'+row.cycle);
    privateDir(destPackage);
    const srcStat=fs.lstatSync(srcArtifact);
    if(!srcStat.isDirectory()||srcStat.isSymbolicLink())fail('CROSS_CHECKPOINT_INVALID');
    const dstArtifact=path.join(destPackage,row.key+'-'+row.packageDigest);
    fs.cpSync(srcArtifact,dstArtifact,{recursive:true,dereference:false,errorOnExist:true,force:false});
    const proofName=row.key+'-'+row.packageDigest+'.json';
    const proofDir=privateDir(path.join(destPackage,'verification'));
    fs.copyFileSync(path.join(fromPackage,'verification',proofName),
      path.join(proofDir,proofName),fs.constants.COPYFILE_EXCL);
    fs.copyFileSync(path.join(fromPackage,'manufacturing-report.json'),
      path.join(destPackage,'manufacturing-report.json'),fs.constants.COPYFILE_EXCL);
    fs.copyFileSync(path.join(source,'receipts','cycle-'+row.cycle+'.json'),
      path.join(stageReceipts,'cycle-'+row.cycle+'.json'),fs.constants.COPYFILE_EXCL);
    // Preserve least privilege even when copied from a CI artifact archive.
    for(const file of [path.join(proofDir,proofName),path.join(destPackage,'manufacturing-report.json'),
       path.join(stageReceipts,'cycle-'+row.cycle+'.json')])
       if(process.platform!=='win32')fs.chmodSync(file,0o600);
    if(process.platform!=='win32')fs.chmodSync(dstArtifact,0o700);
    verifySlot(stage,row,entries); // Recheck from the actual copied bytes.
    const final=path.join(packagesDir,'cycle-'+row.cycle);
    if(exists(final)||exists(path.join(receiptDir,'cycle-'+row.cycle+'.json')))
     fail('CROSS_CHECKPOINT_CONFLICT');
    fs.renameSync(destPackage,final);
    fs.renameSync(path.join(stageReceipts,'cycle-'+row.cycle+'.json'),
      path.join(receiptDir,'cycle-'+row.cycle+'.json'));
    verifySlot(target,row,entries);
    report.imported++;report.restoredKeys.push(row.key);
   }finally{fs.rmSync(stage,{recursive:true,force:true});}
  }
  return report;
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
module.exports={restoreCrossCheckpoint};
