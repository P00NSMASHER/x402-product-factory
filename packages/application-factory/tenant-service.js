"use strict";
// Controlled local development service. Not production identity, hosting, or file upload.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const Kernel = require("./kernel");
const recipes = require("./recipes.json");
const editions = new Map(recipes.map(recipe => [recipe.id, Kernel.validateRecipe(recipe)]));
const FIRST_DAY = "2026-10-13";
const LIMIT = 65536;
const DISK_LIMIT = 8 * 1024 * 1024;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

class GateError extends Error {
  constructor(status, code) { super(code); this.status = status; }
}
function fail(status, code) { throw new GateError(status, code); }
function object(x) { return x !== null && typeof x === "object" && !Array.isArray(x); }
function exact(x, fields) {
  return object(x) && Object.keys(x).length === fields.length &&
    Object.keys(x).every(key => fields.includes(key));
}
function identifier(value, max = 40) {
  return typeof value === "string" && value.length <= max && ID.test(value);
}
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function mac(key, value) {
  return crypto.createHmac("sha256", key).update(JSON.stringify(value)).digest("hex");
}
function equals(a, b) {
  return typeof a === "string" && typeof b === "string" &&
    /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) &&
    crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
function regular(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) fail(503, "STORAGE_UNSAFE");
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
function safeDirectory(dir) {
  const s = fs.lstatSync(dir);
  if (!s.isDirectory() || s.isSymbolicLink()) fail(503, "STORAGE_UNSAFE");
}
function readJSON(file) {
  if (!regular(file)) return null;
  if (fs.statSync(file).size > DISK_LIMIT) fail(503, "STORAGE_LIMIT");
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (_) { fail(503, "STORAGE_CORRUPT"); }
}
function syncDir(dir) {
  try { const fd = fs.openSync(dir, "r"); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
  catch (_) { /* Some platforms do not permit fsync on directories. */ }
}
function atomicJSON(file, value) {
  const dir = path.dirname(file);
  safeDirectory(dir);
  regular(file); // Reject an existing symlink or special file, including backups.
  const temp = path.join(dir, "." + path.basename(file) + "." + crypto.randomBytes(12).toString("hex") + ".tmp");
  const payload = JSON.stringify(value) + "\n";
  let fd;
  try {
    fd = fs.openSync(temp, "wx", 0o600);
    fs.writeFileSync(fd, payload, {encoding:"utf8"});
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = null;
    fs.renameSync(temp, file);
    fs.chmodSync(file, 0o600);
    syncDir(dir);
  } finally {
    if (fd !== undefined && fd !== null) fs.closeSync(fd);
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
function context(dataDir) {
  if (typeof dataDir !== "string" || !path.isAbsolute(dataDir)) fail(400, "DATA_DIR_ABSOLUTE_REQUIRED");
  safeDirectory(dataDir);
  safeDirectory(path.join(dataDir, "workspaces"));
  const config = readJSON(path.join(dataDir, "installation.json"));
  if (!exact(config, ["schemaVersion","key"]) || config.schemaVersion !== 1 ||
      typeof config.key !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(config.key)) {
    fail(503, "INSTALLATION_INVALID");
  }
  return {dir:dataDir, key:Buffer.from(config.key, "base64url")};
}
function init(dataDir) {
  if (typeof dataDir !== "string" || !path.isAbsolute(dataDir)) fail(400, "DATA_DIR_ABSOLUTE_REQUIRED");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, {recursive:true, mode:0o700});
  safeDirectory(dataDir);
  if (!fs.existsSync(path.join(dataDir,"workspaces")))
    fs.mkdirSync(path.join(dataDir,"workspaces"), {mode:0o700});
  safeDirectory(path.join(dataDir,"workspaces"));
  const installation = path.join(dataDir, "installation.json");
  if (!regular(installation)) atomicJSON(installation, {schemaVersion:1,key:crypto.randomBytes(32).toString("base64url")});
  const identities = path.join(dataDir, "identities.json");
  if (!regular(identities)) atomicJSON(identities, {schemaVersion:1,entries:[]});
  context(dataDir);
  readIdentities(dataDir);
}
function readIdentities(dir) {
  const registry = readJSON(path.join(dir,"identities.json"));
  if (!exact(registry,["schemaVersion","entries"]) || registry.schemaVersion !== 1 ||
      !Array.isArray(registry.entries) || registry.entries.length > 500 ||
      registry.entries.some(e => !exact(e,["id","hash","tenantId","recipeId","role"]) ||
        !identifier(e.id,40) || !/^[a-f0-9]{64}$/.test(e.hash) ||
        !identifier(e.tenantId) || !editions.has(e.recipeId) ||
        !["viewer","editor"].includes(e.role))) fail(503,"IDENTITIES_INVALID");
  if (new Set(registry.entries.map(e=>e.id)).size !== registry.entries.length ||
      new Set(registry.entries.map(e=>e.hash)).size !== registry.entries.length) fail(503,"IDENTITIES_INVALID");
  return registry;
}
function provision(dataDir, tenantId, recipeId, role = "editor") {
  context(dataDir);
  if (!identifier(tenantId) || !editions.has(recipeId) || !["viewer","editor"].includes(role))
    fail(400,"PROVISION_INVALID");
  const registry = readIdentities(dataDir);
  if (registry.entries.length >= 500) fail(409,"CREDENTIAL_LIMIT");
  const id = "cred-" + crypto.randomBytes(12).toString("hex");
  const token = crypto.randomBytes(32).toString("base64url");
  registry.entries.push({id,hash:sha256(token),tenantId,recipeId,role});
  atomicJSON(path.join(dataDir,"identities.json"),registry);
  return {id,token,tenantId,recipeId,role};
}
function revoke(dataDir, credentialId) {
  context(dataDir);
  const registry = readIdentities(dataDir);
  if (!identifier(credentialId,40)) fail(400,"CREDENTIAL_INVALID");
  const next = registry.entries.filter(e => e.id !== credentialId);
  if (next.length === registry.entries.length) fail(404,"CREDENTIAL_UNKNOWN");
  registry.entries = next;
  atomicJSON(path.join(dataDir,"identities.json"),registry);
}
function authenticate(dir, req) {
  // Never accept a tenant identity asserted in a header, URL, cookie, or body.
  if (req.headers["x-tenant-id"] !== undefined) fail(400,"TENANT_ASSERTION_REJECTED");
  const auth = req.headers.authorization;
  if (typeof auth !== "string" || !/^Bearer [A-Za-z0-9_-]{43}$/.test(auth))
    fail(401,"AUTH_REQUIRED");
  const incoming = sha256(auth.slice(7));
  const found = readIdentities(dir).entries.find(e=>equals(incoming,e.hash));
  if (!found) fail(401,"AUTH_INVALID");
  return found;
}
function workspaceId(tenantId) {
  return "tenant-" + sha256(tenantId).slice(0,32);
}
function storagePath(ctx,tenantId,recipeId) {
  // Not composed from untrusted filename components.
  return path.join(ctx.dir,"workspaces",sha256(tenantId + "\n" + recipeId) + ".json");
}
function sealed(ctx,tenantId,recipeId,version,snapshot) {
  const data = {schemaVersion:1,tenantId,recipeId,version,snapshot};
  return {...data,signature:mac(ctx.key,data)};
}
function checkSeal(ctx, raw, tenantId, recipeId) {
  if (!exact(raw,["schemaVersion","tenantId","recipeId","version","snapshot","signature"]) ||
      raw.schemaVersion !== 1 || raw.tenantId !== tenantId || raw.recipeId !== recipeId ||
      !Number.isSafeInteger(raw.version) || raw.version < 1 ||
      !equals(raw.signature,mac(ctx.key,{schemaVersion:1,tenantId,recipeId,version:raw.version,snapshot:raw.snapshot})))
    fail(503,"STORAGE_INTEGRITY");
  try {
    Kernel.createWorkspace(editions.get(recipeId),{workspaceId:workspaceId(tenantId),today:FIRST_DAY,snapshot:raw.snapshot});
  } catch (_) { fail(503,"STORAGE_INTEGRITY"); }
  return raw;
}
function load(ctx,tenantId,recipeId) {
  const file = storagePath(ctx,tenantId,recipeId);
  let primary = null, damagedPrimary = false;
  try { primary = readJSON(file); }
  catch (error) {
    if (!(error instanceof GateError) || error.message !== "STORAGE_CORRUPT") throw error;
    damagedPrimary = true;
  }
  try {
    if (primary !== null) return {entry:checkSeal(ctx,primary,tenantId,recipeId),recovered:false};
  } catch (error) {
    if (!(error instanceof GateError) || !["STORAGE_INTEGRITY","STORAGE_CORRUPT"].includes(error.message)) throw error;
  }
  const backupFile = file + ".bak";
  let backup = null;
  try { backup = readJSON(backupFile); } catch (error) {
    if (!(error instanceof GateError) || error.message !== "STORAGE_CORRUPT") throw error;
  }
  if (backup !== null) {
    const recovered = checkSeal(ctx,backup,tenantId,recipeId);
    atomicJSON(file,recovered);
    return {entry:recovered,recovered:true};
  }
  if (primary !== null || damagedPrimary || regular(file) || regular(backupFile)) fail(503,"STORAGE_INTEGRITY");
  const initial = Kernel.createWorkspace(editions.get(recipeId),{workspaceId:workspaceId(tenantId),today:FIRST_DAY});
  return {entry:{version:0,snapshot:initial.snapshot()},recovered:false};
}
function save(ctx,tenantId,recipeId,oldEntry,nextSnapshot) {
  const file = storagePath(ctx,tenantId,recipeId);
  const next = sealed(ctx,tenantId,recipeId,oldEntry.version + 1,nextSnapshot);
  if (oldEntry.version > 0) atomicJSON(file + ".bak",oldEntry);
  atomicJSON(file,next);
  return next;
}
function signedExport(ctx,tenantId,recipeId,entry) {
  const payload = {format:"factory-tenant-export-v1",tenantId,recipeId,version:entry.version,snapshot:entry.snapshot};
  return {...payload,signature:mac(ctx.key,payload)};
}
function verifyExport(ctx,credential,raw) {
  const fields = ["format","tenantId","recipeId","version","snapshot","signature"];
  if (!exact(raw,fields) || raw.format !== "factory-tenant-export-v1" ||
      !Number.isSafeInteger(raw.version) || raw.version < 0) fail(400,"EXPORT_INVALID");
  if (raw.tenantId !== credential.tenantId || raw.recipeId !== credential.recipeId)
    fail(403,"EXPORT_SCOPE_DENIED");
  const payload={format:raw.format,tenantId:raw.tenantId,recipeId:raw.recipeId,version:raw.version,snapshot:raw.snapshot};
  if (!equals(raw.signature,mac(ctx.key,payload))) fail(400,"EXPORT_INVALID");
  try {
    Kernel.createWorkspace(editions.get(raw.recipeId),{
      workspaceId:workspaceId(credential.tenantId),today:FIRST_DAY,snapshot:raw.snapshot
    });
  } catch (_) { fail(400,"EXPORT_INVALID"); }
  return raw.snapshot;
}
function execute(engine,cmd) {
  if (!object(cmd) || typeof cmd.type !== "string") fail(400,"COMMAND_INVALID");
  try {
    switch (cmd.type) {
      case "addRecord":
        if (!exact(cmd,["type","name","dueOn"])) break;
        return engine.addRecord({name:cmd.name,dueOn:cmd.dueOn});
      case "receive":
        if (!exact(cmd,["type","recordId","requirementId","expiresOn"])) break;
        return engine.receive(cmd.recordId,cmd.requirementId,{expiresOn:cmd.expiresOn});
      case "archive":
        if (!exact(cmd,["type","recordId"])) break;
        return engine.archive(cmd.recordId);
      case "advanceDay":
        if (!exact(cmd,["type","today"])) break;
        engine.advanceDay(cmd.today);return {today:cmd.today};
      case "runAutomation":
        if (!exact(cmd,["type"])) break;
        return engine.runAutomation();
      default: break;
    }
  } catch (_) { fail(400,"COMMAND_REJECTED"); }
  fail(400,"COMMAND_INVALID");
}
async function bodyJSON(req) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers["content-type"] || ""))
    fail(415,"JSON_ONLY");
  if (Number(req.headers["content-length"]) > LIMIT) fail(413,"BODY_LIMIT");
  const chunks=[];let size=0;
  for await (const chunk of req) {
    size+=chunk.length;
    if (size > LIMIT) fail(413,"BODY_LIMIT");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch (_) { fail(400,"JSON_INVALID"); }
}
function respond(res,status,body) {
  const bytes=JSON.stringify(body);
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
    "Content-Security-Policy":"default-src 'none'"});
  res.end(bytes);
}
function createTenantServer(dataDir) {
  const ctx=context(dataDir);
  readIdentities(ctx.dir);
  const lock=path.join(ctx.dir,"service.lock");
  regular(lock); // reject symlink; existing regular lock is owned by another process
  let fd;
  try { fd=fs.openSync(lock,"wx",0o600); }
  catch (_) { fail(409,"SERVICE_ALREADY_RUNNING_OR_STALE_LOCK"); }
  const server=http.createServer(async (req,res)=>{
    try {
      if (req.method === "GET" && req.url === "/health") {
        respond(res,200,{ok:true,mode:"loopback-synthetic-development",uploads:false,delivery:false,billing:false});return;
      }
      const credential=authenticate(ctx.dir,req);
      const m=/^\/v1\/workspaces\/([a-z][a-z0-9-]*)(?:\/(commands|export|restore|upload))?$/.exec(req.url || "");
      if (!m || !editions.has(m[1])) fail(404,"ROUTE_UNKNOWN");
      const recipeId=m[1],operation=m[2] || "";
      if (credential.recipeId !== recipeId) fail(403,"EDITION_DENIED");
      if (operation === "upload") fail(415,"FILE_UPLOAD_DISABLED");
      if (req.method === "POST" && credential.role !== "editor") fail(403,"WRITE_DENIED");
      if (!(req.method === "GET" && (operation === "" || operation === "export") ||
            req.method === "POST" && (operation === "commands" || operation === "restore")))
        fail(405,"METHOD_DENIED");
      const previous=load(ctx,credential.tenantId,recipeId);
      if (req.method === "GET") {
        respond(res,200,operation === "export"
          ? signedExport(ctx,credential.tenantId,recipeId,previous.entry)
          : {version:previous.entry.version,recovered:previous.recovered,snapshot:previous.entry.snapshot});
        return;
      }
      const input=await bodyJSON(req);
      if (!exact(input,operation==="commands"?["expectedVersion","command"]:["expectedVersion","export"]) ||
          !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0)
        fail(400,"REQUEST_INVALID");
      // Re-read after request streaming: serial synchronous compare/write within this process.
      const current=load(ctx,credential.tenantId,recipeId).entry;
      if (input.expectedVersion !== current.version) fail(409,"VERSION_CONFLICT");
      let nextSnapshot,result;
      if (operation === "restore") {
        nextSnapshot=verifyExport(ctx,credential,input.export);
        result={restored:true};
      } else {
        const engine=Kernel.createWorkspace(editions.get(recipeId),{
          workspaceId:workspaceId(credential.tenantId),today:FIRST_DAY,snapshot:current.snapshot
        });
        result=execute(engine,input.command);
        nextSnapshot=engine.snapshot();
      }
      const saved=save(ctx,credential.tenantId,recipeId,current,nextSnapshot);
      respond(res,200,{version:saved.version,result,snapshot:saved.snapshot});
    } catch (error) {
      const status=error instanceof GateError?error.status:500;
      respond(res,status,{error:error instanceof GateError?error.message:"SERVICE_UNAVAILABLE"});
    }
  });
  server.on("close",()=>{
    try { fs.closeSync(fd); } finally { fs.rmSync(lock,{force:true}); }
  });
  return server;
}
if (require.main === module) {
  const [action,dataDir,...args]=process.argv.slice(2);
  try {
    if (action === "init" && args.length === 0) init(dataDir);
    else if (action === "provision" && args.length >= 2 && args.length <= 3) {
      const result=provision(dataDir,args[0],args[1],args[2]);
      console.log(JSON.stringify(result)); // Display credential once, in administrator terminal only.
    } else if (action === "revoke" && args.length === 1) revoke(dataDir,args[0]);
    else if (action === "serve" && args.length <= 1) {
      const port=args.length ? Number(args[0]) : 8765;
      if (!Number.isInteger(port) || port < 1 || port > 65535) fail(400,"PORT_INVALID");
      createTenantServer(dataDir).listen(port,"127.0.0.1",()=>{
        console.log("Synthetic tenant service on http://127.0.0.1:" + port);
      });
    } else fail(400,"USAGE: init|provision|revoke|serve <absolute-data-dir> [args]");
  } catch (error) {
    console.error(error instanceof GateError?error.message:"SERVICE_UNAVAILABLE");
    process.exitCode=1;
  }
}
module.exports={init,provision,revoke,createTenantServer,workspaceId,storagePath};
