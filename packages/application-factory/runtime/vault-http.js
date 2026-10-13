"use strict";
// Reusable scoped access boundary for machine and operator-browser uploads.
const {MAX_OBJECT_BYTES}=require('./vault');
const fail=code=>{throw new Error(code);};
const DOCUMENT_PATH=/^\/(?:v1|app\/api)\/workspaces\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\/documents(?:\/([0-9a-f]{32}))?$/;
async function readBinary(req){
  if(req.headers['content-type']!=='application/octet-stream')fail('CONTENT_TYPE_INVALID');
  const declared=req.headers['content-length'];
  if(declared!==undefined&&(!/^\d+$/.test(declared)||Number(declared)>MAX_OBJECT_BYTES)){
    req.resume();fail('DOCUMENT_TOO_LARGE');
  }
  const chunks=[];let length=0;
  for await(const chunk of req){
    length+=chunk.length;
    if(length>MAX_OBJECT_BYTES)fail('DOCUMENT_TOO_LARGE');
    chunks.push(chunk);
  }
  if(length===0)fail('DOCUMENT_INVALID');
  return Buffer.concat(chunks,length);
}
function createEvidenceRoutes({runtime,vault}){
  if(!vault)return null;
  if(typeof runtime?.workspace!=='function'||typeof runtime?.tenantId!=='function')fail('VAULT_CONFIG_INVALID');
  function scope(token,id){
    const workspace=runtime.workspace(token,id); // Checks the authenticated tenant and workspace.
    const tenantId=runtime.tenantId(token);
    return {tenantId,workspaceId:id,workspace};
  }
  return Object.freeze({
    list(token,id){
      const s=scope(token,id);
      return vault.list({tenantId:s.tenantId,workspaceId:id});
    },
    download(token,id,documentId){
      const s=scope(token,id);
      return vault.read({tenantId:s.tenantId,workspaceId:id,id:documentId});
    },
    upload(token,id,headers,bytes){
      const s=scope(token,id);
      const recordId=headers['x-record-id'],requirementId=headers['x-requirement-id'],
        name=headers['x-document-name'],mediaType=headers['x-document-type'],requestKey=headers['idempotency-key'];
      const row=s.workspace.records.find(r=>r.id===recordId&&!r.archived);
      if(!row||!s.workspace.recipe.requirements.some(r=>r.id===requirementId))fail('NOT_FOUND');
      return vault.put({tenantId:s.tenantId,workspaceId:id,recordId,requirementId,
        name,mediaType,requestKey,bytes});
    }
  });
}
function sendDownload(res,document){
  const name=document.metadata.name;
  // Filename is restricted to ASCII without quotes or path separators in vault.put.
  res.writeHead(200,{'content-type':'application/octet-stream',
    'content-disposition':'attachment; filename="'+name+'"','cache-control':'no-store',
    'x-content-type-options':'nosniff','x-frame-options':'DENY',
    'content-security-policy':"default-src 'none'; sandbox",
    'cross-origin-resource-policy':'same-origin','referrer-policy':'no-referrer'});
  res.end(document.bytes);
}
module.exports={DOCUMENT_PATH,readBinary,createEvidenceRoutes,sendDownload};
