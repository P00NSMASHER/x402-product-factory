'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const q=require('../quote-family/manufacturing');
const i=require('../inventory-family/manufacturing');
const qRecipes=require('../quote-family/recipes.json'),iRecipes=require('../inventory-family/recipes.json');
const root=path.resolve(__dirname,'../../..');
const source=name=>fs.readFileSync(path.join(root,name),'utf8');
test('shared packaging logic is imported by all family compilers, but never copied into a runtime package',()=>{
 const shared=source('packages/application-factory/manufacturing/shared-contracts.js');
 assert.match(shared,/module\.exports=\{sha256,privateDirectory,outsideRepository,trustedSourceFiles,verifyBundledFiles,privateJson\}/);
 assert.doesNotMatch(shared,/require\(['"]\.\.\/(?:quote-family|inventory-family|runtime|growth)/);
 for(const file of ['packages/application-factory/quote-family/manufacturing.js',
  'packages/application-factory/inventory-family/manufacturing.js']){
  assert.match(source(file),/require\(['"]\.\.\/manufacturing\/shared-contracts['"]\)/);
 }
 assert.match(source('packages/application-factory/manufacturing/line.js'),/require\(['"]\.\/shared-contracts['"]\)/);
 const quoteApp=q.compileQuoteApp(qRecipes[0]),stockApp=i.compileInventoryPackage(iRecipes[0]);
 for(const app of [quoteApp,stockApp]){
  assert.equal(Object.keys(app.files).filter(n=>n.includes('shared-contracts')).length,0);
  for(const [filename,text] of Object.entries(app.files)){
   if(!/\.js$/.test(filename))continue;
   assert.doesNotMatch(text,/require\(['"]\.\.\/manufacturing\//,filename);
   assert.doesNotMatch(text,/require\(['"]\.\.\/quote-family\//,filename);
   assert.doesNotMatch(text,/require\(['"]\.\.\/inventory-family\//,filename);
  }
 }
});
