'use strict';
// Operator-only offline evidence tool. No network calls, checkout, or outreach.
const fs=require('node:fs'),path=require('node:path');
const {openProofBook}=require('../packages/application-factory/growth/book');
const recipes=require('../packages/application-factory/recipes.json');
const ROOT=path.resolve(__dirname,'..');
const fail=code=>{throw new Error(code);};
function privateFile(filename,{mustExist=true,maxBytes=4096}={}){
  if(typeof filename!=='string'||!path.isAbsolute(filename))fail('PRIVATE_PATH_REQUIRED');
  const absolute=path.resolve(filename),relative=path.relative(ROOT,absolute);
  if(relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))fail('PRIVATE_PATH_REQUIRED');
  if(mustExist){
    const stat=fs.lstatSync(absolute);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>maxBytes||
      (process.platform!=='win32'&&((stat.mode&0o077)!==0||stat.uid!==process.getuid())))fail('PRIVATE_PATH_UNSAFE');
  }
  return absolute;
}
function keyFile(filename){
  const raw=fs.readFileSync(privateFile(filename,{maxBytes:128}),'utf8').trim();
  if(!/^[0-9a-fA-F]{64}$/.test(raw))fail('KEY_INVALID');return Buffer.from(raw,'hex');
}
function main(args=process.argv.slice(2)){
  if(!args.length)fail('USAGE_INVALID');
  const [operation,...rest]=args,options=Object.create(null);
  if(!['init','record','attest','report'].includes(operation)||rest.length%2)fail('USAGE_INVALID');
  const allowed=['--ledger','--chain-key-file','--reviewer-key-hash','--event-file','--reviewer-key-file','--seq','--recipe'];
  for(let i=0;i<rest.length;i+=2){if(!allowed.includes(rest[i])||Object.hasOwn(options,rest[i])||
      typeof rest[i+1]!=='string'||!rest[i+1])fail('USAGE_INVALID');options[rest[i]]=rest[i+1];}
  const required=['--ledger','--chain-key-file','--reviewer-key-hash'];
  if(required.some(k=>!options[k]))fail('USAGE_INVALID');
  const special={'init':[],'record':['--event-file'],'attest':['--seq','--reviewer-key-file'],'report':[]};
  if(['record','attest'].includes(operation)&&special[operation].some(k=>!options[k]))fail('USAGE_INVALID');
  if(Object.keys(options).some(k=>!required.includes(k)&&!special[operation].includes(k)&&!(operation==='report'&&k==='--recipe')))fail('USAGE_INVALID');
  const filename=privateFile(options['--ledger'],{mustExist:false}),key=keyFile(options['--chain-key-file']);
  const reviewKeyHash=options['--reviewer-key-hash'];
  try{
    const book=openProofBook({filename,chainKey:key,reviewKeyHash,recipes});
    if(operation==='init')return {state:'initialized',mode:'offline',releaseApproved:false};
    if(operation==='record'){
      const eventFile=privateFile(options['--event-file'],{maxBytes:4096});
      const event=JSON.parse(fs.readFileSync(eventFile,'utf8'));
      return book.record(event);
    }
    if(operation==='attest'){
      if(!/^[1-9]\d*$/.test(options['--seq']))fail('USAGE_INVALID');
      const reviewer=keyFile(options['--reviewer-key-file']);
      try{return book.attest(Number(options['--seq']),reviewer);}finally{reviewer.fill(0);}
    }
    if(options['--recipe'])return book.report(options['--recipe']);
    return book.allReports();
  }finally{key.fill(0);}
}
if(require.main===module){try{console.log(JSON.stringify(main(),null,2));}
  catch{console.error('Growth evidence command rejected. Verify private paths, keys, input fields and ledger integrity.');process.exitCode=1;}}
module.exports={main,privateFile};
