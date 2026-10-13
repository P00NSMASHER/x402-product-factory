'use strict';
// Native UI checks import each accepted artifact, never the source repository runtime.
const {chromium}=require('playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {compileApplication,verifyApplication}=require('../../packages/application-factory/manufacturing/assembler');
const recipes=require('../../packages/application-factory/recipes.json');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn){const end=Date.now()+8000;while(Date.now()<end){if(await fn())return;await wait(25);}throw new Error('PACKAGED_BROWSER_TIMEOUT');}
async function main(root){
  const report={kind:'manufactured-native-browser-acceptance',passed:false,editions:0,journeys:0,evidenceDownloads:0,headlessWorkerChecks:0,pageErrors:0,outboundRequests:0,releaseApproved:false};
  const browser=await chromium.launch({headless:true});
  try{
    for(const recipe of recipes){
      const app=compileApplication(recipe),directory=path.join(root,recipe.id+'-'+app.digest);verifyApplication(directory,app.digest);
      const from=rel=>require(path.join(directory,rel)),{openRuntime}=from('packages/application-factory/runtime/runtime.js');
      const {openVault}=from('packages/application-factory/runtime/vault.js'),{createRuntimeServer}=from('packages/application-factory/runtime/http.js');
      const catalog=from('packages/application-factory/recipes.json');assert.equal(catalog.length,1);
      const temp=fs.mkdtempSync(path.join(os.tmpdir(),'factory-manufactured-browser-'));
      let runtime,vault,server;
      try{
        runtime=openRuntime({filename:path.join(temp,'runtime.sqlite'),recipes:catalog});vault=openVault({filename:path.join(temp,'documents.sqlite'),key:Buffer.alloc(32,51)});
        const token=runtime.provisionTenant('synthetic-browser').token;
        runtime.createWorkspace(token,{id:recipe.id,recipeId:recipe.id});server=createRuntimeServer({runtime,vault,pollMs:25});await server.listen({port:0});
        const origin='http://127.0.0.1:'+server.address().port;
        for(const width of [1440,390]){
          const context=await browser.newContext({viewport:{width,height:1000}});
          const pageFor=async()=>{const p=await context.newPage();p.setDefaultTimeout(8000);p.on('pageerror',()=>report.pageErrors++);p.on('request',r=>{if(!r.url().startsWith(origin+'/'))report.outboundRequests++;});await p.goto(origin+'/app');return p;};
          try{
            let page=await pageFor();await page.getByLabel('Workspace access key').fill(token);await page.getByRole('button',{name:'Sign in',exact:true}).click();
            await until(async()=>(await page.locator('#workspace-title').textContent())===recipe.title);
            assert.equal(await page.locator('#workspace-select option').count(),1);
            const name='Synthetic packaged '+width;await page.getByRole('button',{name:'+ New intake',exact:true}).click();await page.getByLabel('Name',{exact:true}).fill(name);
            await page.getByLabel('Due date').fill(new Date().toISOString().slice(0,10));await page.getByRole('button',{name:'Save intake',exact:true}).click();await page.locator('#new-dialog').waitFor({state:'hidden'});
            await page.close();await until(()=>runtime.inbox(token,recipe.id).some(n=>n.recordName===name));report.headlessWorkerChecks++;
            page=await pageFor();await page.getByRole('button',{name:'Open '+name,exact:true}).click();
            const selector=page.getByLabel('Select document for '+recipe.requirements[0].label,{exact:true}),binary=Buffer.from('%PDF-1.7\nSynthetic manufactured UI\n%%EOF\n');
            await selector.setInputFiles({name:'synthetic.pdf',mimeType:'application/pdf',buffer:binary});
            await page.locator('#documents form').filter({has:selector}).getByRole('button',{name:'Attach document',exact:true}).click();
            const link=page.getByRole('link',{name:'Download synthetic.pdf',exact:true});await link.waitFor();const download=page.waitForEvent('download');await link.click();
            assert.deepEqual(fs.readFileSync(await(await download).path()),binary);report.evidenceDownloads++;
            for(const req of recipe.requirements){
              const form=page.locator('#documents form').filter({has:page.getByRole('heading',{name:req.label,exact:true})});
              if(req.renewable)await form.locator('input[type=date]').fill(new Date(Date.now()+366*86400000).toISOString().slice(0,10));
              await form.getByRole('button',{name:'Mark received',exact:true}).click();await form.getByRole('button',{name:'Update receipt',exact:true}).waitFor();
            }
            await page.getByRole('button',{name:'Close record',exact:true}).click();
            await page.reload();await until(async()=>Boolean(await page.getByRole('button',{name:'Open '+name,exact:true}).count()));
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
            assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);report.journeys++;
          }finally{await context.close();}
        }
        report.editions++;
      }finally{await server?.close();vault?.close();runtime?.close();fs.rmSync(temp,{recursive:true,force:true});}
    }
    assert.equal(report.journeys,6);assert.equal(report.evidenceDownloads,6);assert.equal(report.pageErrors,0);assert.equal(report.outboundRequests,0);report.passed=true;
    console.log(JSON.stringify(report,null,2));return report;
  }finally{await browser.close();}
}
if(require.main===module)main(process.argv[2]).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
