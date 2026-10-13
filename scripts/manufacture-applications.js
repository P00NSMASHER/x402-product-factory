'use strict';
const fs=require('node:fs'),path=require('node:path');
const {manufactureBatch}=require('../packages/application-factory/manufacturing/line');
const defaults=require('../packages/application-factory/recipes.json');
function main(args=process.argv.slice(2)){
  const options=Object.create(null);let retryFailed=false;
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if(arg==='--retry-failed'){if(retryFailed)throw new Error('USAGE_INVALID');retryFailed=true;continue;}
    if(!['--output','--recipes'].includes(arg)||Object.hasOwn(options,arg)||!args[i+1]||args[i+1].startsWith('--'))throw new Error('USAGE_INVALID');
    options[arg]=args[++i];
  }
  if(!options['--output']||!path.isAbsolute(options['--output']))throw new Error('ABSOLUTE_OUTPUT_REQUIRED');
  let recipes=defaults;
  if(options['--recipes']){
    if(!path.isAbsolute(options['--recipes']))throw new Error('RECIPE_FILE_INVALID');
    const stat=fs.lstatSync(options['--recipes']);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw new Error('RECIPE_FILE_INVALID');
    recipes=JSON.parse(fs.readFileSync(options['--recipes'],'utf8'));
  }
  return manufactureBatch({recipes,outputRoot:options['--output'],retryFailed});
}
if(require.main===module){
  try{const report=main();console.log(JSON.stringify(report,null,2));if(report.failed)process.exitCode=1;}
  catch{console.error('Manufacturing stopped. Check input recipes, private output path, lock ownership and verification receipts.');process.exitCode=1;}
}
module.exports={main};
