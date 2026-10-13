'use strict';
// Explicit operator-owned, offline sales research review: no network, no contact collection, no send/charge.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const recipes=require('../packages/application-factory/recipes.json');
const {createCampaign}=require('../packages/application-factory/growth/campaign');
const {openProofBook}=require('../packages/application-factory/growth/book');
const {buildSalesBoard,renderSalesBoard,renderReviewBrief}=require('../packages/application-factory/sales/board');
const ROOT=path.resolve(__dirname,'..');
const fail=code=>{throw new Error(code);};
function privateFile(filename,maxSize){
 if(typeof filename!=='string'||!path.isAbsolute(filename))fail('INPUT_PATH_INVALID');
 let stat,dir;
 try{stat=fs.lstatSync(filename);dir=fs.lstatSync(path.dirname(filename));}
 catch{fail('INPUT_PATH_INVALID');}
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>maxSize||
    !dir.isDirectory()||dir.isSymbolicLink()||fs.realpathSync(path.dirname(filename))!==path.resolve(path.dirname(filename))||
    (process.platform!=='win32'&&((stat.mode&0o077)!==0||(dir.mode&0o077)!==0)))fail('INPUT_PATH_INVALID');
 return fs.readFileSync(filename,'utf8');
}
function readKey(filename){
 const hex=privateFile(filename,70).trim();
 if(!/^[0-9a-fA-F]{64}$/.test(hex))fail('KEY_INVALID');
 return Buffer.from(hex,'hex');
}
function parentFor(output){
 if(typeof output!=='string'||!path.isAbsolute(output))fail('OUTPUT_UNSAFE');
 const normalized=path.resolve(output),r=path.relative(ROOT,normalized);
 if(!r||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r)))fail('OUTPUT_UNSAFE');
 const parent=path.dirname(normalized);
 fs.mkdirSync(parent,{recursive:true,mode:0o700});
 const stat=fs.lstatSync(parent);
 if(!stat.isDirectory()||stat.isSymbolicLink()||fs.realpathSync(parent)!==path.resolve(parent)||
   (process.platform!=='win32'&&(stat.mode&0o077)!==0))fail('OUTPUT_UNSAFE');
 if(fs.existsSync(normalized))fail('OUTPUT_EXISTS');
 return {normalized,parent};
}
function main(args=process.argv.slice(2)){
 if(!Array.isArray(args)||args.length<1||args[0]!=='build'||args.length%2!==1)fail('USAGE_INVALID');
 const allowed=new Set(['--campaign','--campaign-key-file','--output-dir','--as-of','--proof-ledger','--proof-key-file','--reviewer-key-hash']);
 const input=Object.create(null);
 for(let i=1;i<args.length;i+=2){
   if(!allowed.has(args[i])||Object.hasOwn(input,args[i])||typeof args[i+1]!=='string'||!args[i+1]||args[i+1].startsWith('--'))fail('USAGE_INVALID');
   input[args[i]]=args[i+1];
 }
 if(['--campaign','--campaign-key-file','--output-dir','--as-of'].some(k=>!input[k]))fail('USAGE_INVALID');
 const opts=['--proof-ledger','--proof-key-file','--reviewer-key-hash'],supplied=opts.filter(k=>input[k]);
 if(supplied.length!==0&&supplied.length!==opts.length)fail('USAGE_INVALID');
 const {normalized,parent}=parentFor(input['--output-dir']);
 // Validate the existing private state; creating a new campaign would falsely imply existing research.
 privateFile(input['--campaign'],3*1024*1024);
 const campaignKey=readKey(input['--campaign-key-file']),proofKey=supplied.length?readKey(input['--proof-key-file']):null;
 let campaign,stage,fd;
 try{
   if(supplied.length){
     privateFile(input['--proof-ledger'],2*1024*1024);
     if(!/^[0-9a-f]{64}$/.test(input['--reviewer-key-hash']))fail('USAGE_INVALID');
   }
   campaign=createCampaign({filename:input['--campaign'],key:campaignKey,recipes,clock:()=>Date.parse(input['--as-of']+'T12:00:00Z')});
   const proof=supplied.length?openProofBook({filename:input['--proof-ledger'],chainKey:proofKey,
     reviewKeyHash:input['--reviewer-key-hash'],recipes}):null;
   const board=buildSalesBoard({campaign,proofBook:proof,recipes,asOf:input['--as-of']});
   const files={
     'board.json':JSON.stringify(board,null,2)+'\n',
     'index.html':renderSalesBoard(board),
     'review-brief.md':renderReviewBrief(board)
   };
   const digest=Object.fromEntries(Object.entries(files).map(([name,body])=>
     [name,crypto.createHash('sha256').update(body).digest('hex')]));
   files['integrity.json']=JSON.stringify({schemaVersion:1,sourceType:'operator-authenticated-private-ledgers',
     artifacts:digest,publicContactRecords:0,outboundRequests:0,transmittedMessages:0,
     realCustomers:null,collectedRevenue:null,releaseApproved:false},null,2)+'\n';
   const lock=normalized+'.lock';
   try{fd=fs.openSync(lock,'wx',0o600);}catch(error){if(error.code==='EEXIST')fail('OUTPUT_LOCKED');throw error;}
   if(fs.existsSync(normalized))fail('OUTPUT_EXISTS');
   stage=fs.mkdtempSync(path.join(parent,'.sales-board-stage-'));
   for(const [name,body]of Object.entries(files)){
     const file=path.join(stage,name),handle=fs.openSync(file,'wx',0o600);
     try{fs.writeFileSync(handle,body);fs.fsyncSync(handle);}finally{fs.closeSync(handle);}
   }
   if(fs.existsSync(normalized))fail('OUTPUT_EXISTS');
   fs.renameSync(stage,normalized);stage=null;
   return {kind:'sales-board-export',researched:board.stats.publicOrganizationsResearched,actions:board.actions.length,
     qualifiedConversations:board.stats.qualifiedConversations,reviewOnly:true,
     realCustomers:null,collectedRevenue:null,transmittedMessages:0,releaseApproved:false};
 }finally{
   campaign?.close();campaignKey.fill(0);proofKey?.fill(0);
   if(stage&&fs.existsSync(stage))fs.rmSync(stage,{recursive:true,force:true});
   if(fd!==undefined){fs.closeSync(fd);fs.unlinkSync(normalized+'.lock');}
 }
}
if(require.main===module){
 try{console.log(JSON.stringify(main(),null,2));}
 catch{console.error('Sales command center blocked unsafe, missing or unverifiable inputs; no messages sent.');process.exitCode=1;}
}
module.exports={main};
