"use strict";

const fs=require("node:fs");
const path=require("node:path");
const {spawnSync}=require("node:child_process");

const FACTORY_ROOT=path.resolve(__dirname,"..");

function walk(dir){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function discoverTests(root=FACTORY_ROOT){
  return walk(root)
    .filter(file=>file.endsWith(".test.js"))
    .sort();
}

function runTests(files=discoverTests()){
  const results=[];
  for(const file of files){
    const rel=path.relative(path.resolve(__dirname,".."),file);
    process.stdout.write("\n=== TEST "+rel+" ===\n");
    const child=spawnSync(process.execPath,["--test",file],{
      stdio:"inherit",
      env:process.env
    });
    const code=child.status==null?1:child.status;
    results.push({file:rel,code});
    if(code!==0){
      const error=new Error("test failed: "+rel);
      error.code="TEST_FAILURE";
      error.results=results;
      throw error;
    }
  }
  return results;
}

function main(){
  const files=discoverTests();
  if(files.length===0) throw new Error("no factory tests discovered");
  const results=runTests(files);
  console.log(JSON.stringify({ok:true,testFiles:results.length},null,2));
}

if(require.main===module) main();

module.exports={FACTORY_ROOT,walk,discoverTests,runTests};
