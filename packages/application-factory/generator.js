"use strict";
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {validateRecipe}=require("./kernel");
const hash=value=>crypto.createHash("sha256").update(value).digest("hex");
const cspHash=value=>"'sha256-"+crypto.createHash("sha256").update(value).digest("base64")+"'";
const escape=value=>String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const safeJSON=value=>JSON.stringify(value).replace(/</g,"\\u003c").replace(/>/g,"\\u003e").replace(/&/g,"\\u0026").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
const asset=name=>fs.readFileSync(path.join(__dirname,name),"utf8").replace(/\r\n/g,"\n");
function compile(input){
  const recipe=validateRecipe(input);
  const kernel=asset("kernel.js"),client=asset("client.js"),css=asset("styles.css");
  const digest=hash(JSON.stringify(recipe)+kernel+client+css);
  const policy="default-src 'none'; script-src "+cspHash(kernel)+" "+cspHash(client)+"; style-src "+cspHash(css)+"; connect-src 'none'; img-src data:; base-uri 'none'; form-action 'none'; object-src 'none'";
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${escape(policy)}"><meta name="robots" content="noindex,nofollow"><title>${escape(recipe.title)} · Local prototype</title><style>${css}</style></head><body><div id="app"></div><noscript>This local prototype requires JavaScript. No accounts, payments, or external delivery are enabled.</noscript><script type="application/json" id="factory-config">${safeJSON({recipe,digest})}</script><script id="factory-kernel">${kernel}</script><script id="factory-client">${client}</script></body></html>`;
  const manifest={schemaVersion:1,generatorVersion:"application-family-v1",id:recipe.id,family:recipe.family,title:recipe.title,
    mode:"local-prototype",digest,releaseApproved:false,productCatalogEntry:false,externalDelivery:false,billingEnabled:false,
    realCustomers:null,collectedRevenue:null,automationScope:"simulated reminders while browser is open",
    implemented:["intake","checklist-metadata","expiry-detection","reminder-simulation","audit-history","snapshot-export"],
    notImplemented:["authentication","secure-file-storage","hosted-workers","billing","acquisition","multi-user-collaboration"]};
  const offer=`# ${recipe.title}\n\nUnvalidated offer hypothesis; not an active commercial listing.\n\nBuyer: ${recipe.buyer}\n\nTask: ${recipe.outcome}\n\nRequired workflow inputs:\n${recipe.requirements.map(req=>"- "+req.label+(req.renewable?" (renewal tracked)":"")).join("\n")}\n\nCompare against the buyer's current manual process. Measure completed tasks, correction rate, time, repeat use, costs, and willingness to pay. No customer, savings, revenue or price claims have been validated.\n\nThis local prototype records document metadata, not actual files or their authenticity. Production login, secure uploads, messaging and billing are not implemented. No live purchase is offered.\n`;
  const files={"index.html":html,"recipe.json":JSON.stringify(recipe,null,2)+"\n","OFFER.md":offer};
  manifest.artifacts=Object.fromEntries(Object.entries(files).map(([name,content])=>[name,hash(content)]));
  files["manifest.json"]=JSON.stringify(manifest,null,2)+"\n";
  return {id:recipe.id,title:recipe.title,outcome:recipe.outcome,digest,files};
}
function compileBatch(recipes){
  if(!Array.isArray(recipes)||recipes.length<1||recipes.length>100)throw new Error("BATCH_LIMIT");
  const validated=recipes.map(validateRecipe);
  if(new Set(validated.map(r=>r.id)).size!==validated.length)throw new Error("DUPLICATE_EDITION");
  return validated.map(compile);
}
function gallery(outputs){
  const css=asset("styles.css");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspHash(css)}; base-uri 'none'; form-action 'none'"><title>Application Factory · Prototype gallery</title><style>${css}</style></head><body class="gallery-body"><main class="gallery"><div class="eyebrow">APPLICATION FACTORY / FIRST FAMILY</div><h1>One engine.<br>Different workflows.</h1><p class="lede">Working document-collection and renewal prototypes, manufactured from reusable recipes.</p><div class="gallery-stats"><div><strong>${outputs.length}</strong><span>Generated editions</span></div><div><strong>1</strong><span>Shared workflow engine</span></div><div><strong>Not measured</strong><span>Customers and revenue</span></div></div><section class="gallery-grid">${outputs.map((out,i)=>`<a class="edition" href="${out.id}/index.html"><div class="edition-number">0${i+1} / LOCAL PROTOTYPE</div><h2>${escape(out.title)}</h2><p>${escape(out.outcome)}</p><span class="open-link">Open workspace →</span></a>`).join("")}</section><div class="notice"><strong>Working prototype, not a commercial launch.</strong> Use synthetic data only. No authentication, secure uploads, live messaging or payments. Reminder cycles run locally while the workspace is open.</div></main></body></html>`;
}
function writeBatch(recipes,destination){
  const outputs=compileBatch(recipes); // Validate all before touching destination.
  if(typeof destination!=="string"||destination.length===0)throw new Error("OUTPUT_INVALID");
  const output=path.resolve(destination);
  if(fs.existsSync(output))throw new Error("OUTPUT_EXISTS");
  const parent=path.dirname(output);if(!fs.existsSync(parent)||!fs.statSync(parent).isDirectory())throw new Error("OUTPUT_PARENT_MISSING");
  const temp=fs.mkdtempSync(path.join(parent,".application-factory-"));
  try{
    for(const item of outputs){
      const dir=path.join(temp,item.id);fs.mkdirSync(dir);
      for(const [name,content] of Object.entries(item.files))fs.writeFileSync(path.join(dir,name),content,{encoding:"utf8",flag:"wx"});
    }
    fs.writeFileSync(path.join(temp,"index.html"),gallery(outputs),{encoding:"utf8",flag:"wx"});
    // Claim destination exclusively before publishing files; never overwrite an existing build.
    fs.mkdirSync(output);
    for(const name of fs.readdirSync(temp))fs.renameSync(path.join(temp,name),path.join(output,name));
  }catch(error){throw error;}finally{fs.rmSync(temp,{recursive:true,force:true});}
  return {output,editions:outputs.map(({id,digest})=>({id,digest})),mode:"local-prototype",releaseApproved:false};
}
module.exports={compile,compileBatch,gallery,writeBatch};
