"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {validateJsSyntax}=require("./validate-js-syntax");

test("current factory JavaScript parses under Node",()=>{
  const result=validateJsSyntax(path.resolve(__dirname,".."));
  assert.equal(result.ok,true,JSON.stringify(result.failures,null,2));
  assert.ok(result.fileCount>20);
  assert.deepEqual(result.failures,[]);
});

test("syntax validator reports a malformed JS file",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"x402-syntax-"));
  fs.writeFileSync(path.join(root,"good.js"),'"use strict";\nconst x=1;\n');
  fs.writeFileSync(path.join(root,"bad.js"),'function broken( {\n');
  const result=validateJsSyntax(root);
  assert.equal(result.ok,false);
  assert.equal(result.failures.length,1);
  assert.equal(result.failures[0].file,"bad.js");
});
