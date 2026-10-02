"use strict";

const fs=require("node:fs");
const path=require("node:path");
const {spawnSync}=require("node:child_process");

function collectJs(dir,out=[]){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())collectJs(full,out);
    else if(entry.isFile()&&entry.name.endsWith(".js"))out.push(full);
  }
  return out;
}

function validateJsSyntax(root=path.resolve(__dirname,"..")){
  const files=collectJs(root).sort();
  const failures=[];
  for(const file of files){
    const result=spawnSync(process.execPath,["--check",file],{
      encoding:"utf8",
      env:process.env
    });
    if(result.status!==0){
      failures.push({
        file:path.relative(root,file).replaceAll(path.sep,"/"),
        status:result.status,
        stderr:String(result.stderr||"").trim()
      });
    }
  }
  return {ok:failures.length===0,fileCount:files.length,failures};
}

if(require.main===module){
  const result=validateJsSyntax();
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=2;
}

module.exports={collectJs,validateJsSyntax};
