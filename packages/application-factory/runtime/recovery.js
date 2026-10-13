'use strict';
// Local recovery only. No network, credentials enrollment, or replacement of live state.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const Kernel = require('../kernel');
const MAGIC = Buffer.from('FACTORY-RECOVERY-1\n');
const MAX_DB = 32 * 1024 * 1024, MAX_ENVELOPE = 96 * 1024 * 1024;
const ROOT = path.resolve(__dirname, '../../..');
const fail = code => { throw new Error(code); };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const id = value => typeof value === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value) && value.length <= 60;
const columns = {
  tenants: 'id,token_hash,active',
  workspaces: 'tenant_id,id,recipe,snapshot,version,enabled,next_run,observed_ms,failures,last_error,last_success,lease_token,lease_until',
  inbox: 'tenant_id,workspace_id,message_id,payload,status,created_ms',
  receipts: 'tenant_id,workspace_id,request_key,command_hash,result',
  vault_documents: 'id,tenant_id,workspace_id,record_id,requirement_id,request_key,fingerprint,name,media_type,size,sha256,created_ms,nonce,tag,ciphertext'
};
function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
function absolute(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || inside(ROOT, path.resolve(value))) fail('STATE_PATH_UNSAFE');
  return path.resolve(value);
}
function privateDir(value, create = false) {
  const dir = absolute(value);
  if (create) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  let stat;
  try { stat = fs.lstatSync(dir); } catch { fail('STATE_MISSING'); }
  const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
  if (!stat.isDirectory() || stat.isSymbolicLink() || normalize(fs.realpathSync(dir)) !== normalize(dir)) fail('STATE_PATH_UNSAFE');
  if (process.platform !== 'win32' && ((stat.mode & 0o077) || (typeof process.getuid === 'function' && stat.uid !== process.getuid()))) fail('STATE_PATH_UNSAFE');
  return dir;
}
function regular(filename, maxBytes) {
  privateDir(path.dirname(filename));
  let stat;
  try { stat = fs.lstatSync(filename); } catch { fail('STATE_MISSING'); }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('STATE_PATH_UNSAFE');
  if (stat.size > maxBytes) fail('RECOVERY_LIMIT');
  if (process.platform !== 'win32' && ((stat.mode & 0o077) || (typeof process.getuid === 'function' && stat.uid !== process.getuid()))) fail('STATE_PATH_UNSAFE');
  return stat;
}
function keyCheck(key) { if (!Buffer.isBuffer(key) || key.length !== 32) fail('RECOVERY_CONFIG_INVALID'); }
function timeCheck(time) {
  if (!Number.isSafeInteger(time) || time < 946684800000 || time > 4133980799999) fail('RECOVERY_CLOCK');
  return time;
}
function readBounded(filename, limit) {
  regular(filename, limit);
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) fail('RECOVERY_LIMIT');
    const bytes = Buffer.alloc(stat.size); let offset = 0;
    while (offset < bytes.length) {
      const n = fs.readSync(fd, bytes, offset, bytes.length - offset, null);
      if (n === 0) fail('RECOVERY_INTEGRITY'); offset += n;
    }
    if (fs.fstatSync(fd).size !== stat.size) fail('RECOVERY_INTEGRITY');
    return bytes;
  } finally { fs.closeSync(fd); }
}
function syncFile(filename) { const fd = fs.openSync(filename, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function syncDir(dir) { if (process.platform !== 'win32') syncFile(dir); }
function schema(db, vault) {
  db.exec('PRAGMA trusted_schema=OFF;');
  const expected = vault ? ['vault_documents'] : ['inbox', 'receipts', 'tenants', 'workspaces'];
  const objects = db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND type != 'index' ORDER BY name").all();
  if (db.prepare('PRAGMA user_version').get().user_version !== 1 ||
      db.prepare('PRAGMA application_id').get().application_id !== (vault ? 1178682197 : 1178682196) ||
      objects.map(o => o.name).join(',') !== expected.join(',') ||
      objects.some(o => o.type !== 'table' || !/^CREATE TABLE\s/i.test(o.sql || ''))) fail('SCHEMA_UNSUPPORTED');
  for (const table of expected) {
    if (db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name).join(',') !== columns[table]) fail('SCHEMA_UNSUPPORTED');
  }
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) fail('STATE_CORRUPT');
  const size = db.prepare('PRAGMA page_size').get().page_size * db.prepare('PRAGMA page_count').get().page_count;
  if (size > MAX_DB) fail('RECOVERY_LIMIT');
}
function inspectPair(dir, vaultKey) {
  const db = new DatabaseSync(path.join(dir, 'runtime.sqlite'), { readOnly: true });
  let vault; const workspaces = new Map(); let tenantCount = 0, documentCount = 0;
  try {
    schema(db, false);
    const tenants = new Set();
    for (const row of db.prepare('SELECT * FROM tenants').iterate()) {
      if (++tenantCount > 1000 || !id(row.id) || !/^[0-9a-f]{64}$/.test(row.token_hash) || ![0, 1].includes(row.active)) fail('STATE_CORRUPT');
      tenants.add(row.id);
    }
    for (const row of db.prepare('SELECT * FROM workspaces').iterate()) {
      if (workspaces.size >= 1000 || !tenants.has(row.tenant_id) || !id(row.id)) fail('RECOVERY_REFERENCE');
      let workspace;
      try {
        timeCheck(row.observed_ms);
        const recipe = JSON.parse(row.recipe), snapshot = JSON.parse(row.snapshot);
        workspace = Kernel.createWorkspace(recipe, { workspaceId: row.id, today: new Date(row.observed_ms).toISOString().slice(0, 10), snapshot });
        if (workspace.snapshot().today !== new Date(row.observed_ms).toISOString().slice(0, 10)) fail('SNAPSHOT_INVALID');
      } catch { fail('SNAPSHOT_INVALID'); }
      workspaces.set(JSON.stringify([row.tenant_id, row.id]), { row, workspace,
        records: new Set(workspace.list().map(r => r.id)), messages: new Set(workspace.snapshot().outbox.map(m => m.id)),
        requirements: new Set(JSON.parse(row.recipe).requirements.map(r => r.id)) });
    }
    for (const table of ['inbox', 'receipts']) {
      let count = 0;
      for (const row of db.prepare(`SELECT * FROM ${table}`).iterate()) {
        if (++count > 100000) fail('RECOVERY_LIMIT');
        const parent = workspaces.get(JSON.stringify([row.tenant_id, row.workspace_id]));
        if (!parent) fail('RECOVERY_REFERENCE');
        try { JSON.parse(table === 'inbox' ? row.payload : row.result); } catch { fail('STATE_CORRUPT'); }
        if (table === 'inbox' && !parent.messages.has(row.message_id)) fail('RECOVERY_REFERENCE');
      }
    }
    const hasVault = fs.existsSync(path.join(dir, 'documents.sqlite'));
    if (hasVault) {
      if (!Buffer.isBuffer(vaultKey) || vaultKey.length !== 32) fail('VAULT_KEY_REQUIRED');
      vault = new DatabaseSync(path.join(dir, 'documents.sqlite'), { readOnly: true }); schema(vault, true);
      for (const row of vault.prepare('SELECT * FROM vault_documents').iterate()) {
        if (++documentCount > 100000) fail('RECOVERY_LIMIT');
        const parent = workspaces.get(JSON.stringify([row.tenant_id, row.workspace_id]));
        if (!parent || !parent.records.has(row.record_id) || !parent.requirements.has(row.requirement_id)) fail('RECOVERY_REFERENCE');
        const metadata = { id: row.id, recordId: row.record_id, requirementId: row.requirement_id, name: row.name,
          mediaType: row.media_type, size: row.size, sha256: row.sha256, createdAt: row.created_ms };
        let bytes;
        try {
          if (row.size < 1 || row.size > 262144 || row.nonce.length !== 12 || row.tag.length !== 16) fail('DOCUMENT_INTEGRITY');
          const decipher = crypto.createDecipheriv('aes-256-gcm', vaultKey, row.nonce);
          decipher.setAAD(Buffer.from(JSON.stringify({ tenantId: row.tenant_id, workspaceId: row.workspace_id, ...metadata })));
          decipher.setAuthTag(row.tag);
          bytes = Buffer.concat([decipher.update(row.ciphertext), decipher.final()]);
          if (bytes.length !== row.size || sha(bytes) !== row.sha256) fail('DOCUMENT_INTEGRITY');
        } catch { fail('DOCUMENT_INTEGRITY'); } finally { bytes?.fill(0); }
      }
    }
    return { tenants: tenantCount, workspaces: workspaces.size, documents: documentCount, hasVault };
  } finally { vault?.close(); db.close(); }
}
function configPaths(stateDir, backupDir) {
  const state = privateDir(stateDir), backups = absolute(backupDir);
  if (inside(state, backups) || inside(backups, state)) fail('STATE_PATH_UNSAFE');
  privateDir(backups, true); return { state, backups, sourceId: sha(state).slice(0, 16) };
}
function decode(filename, key) {
  keyCheck(key);
  const envelope = readBounded(absolute(filename), MAX_ENVELOPE); let plaintext;
  try {
    if (envelope.length < MAGIC.length + 29 || !envelope.subarray(0, MAGIC.length).equals(MAGIC)) fail('RECOVERY_INTEGRITY');
    const nonce = envelope.subarray(MAGIC.length, MAGIC.length + 12), tag = envelope.subarray(MAGIC.length + 12, MAGIC.length + 28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce); decipher.setAAD(MAGIC); decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(envelope.subarray(MAGIC.length + 28)), decipher.final()]);
    const data = JSON.parse(plaintext.toString('utf8'));
    if (!data || data.version !== 1 || !/^[0-9a-f]{16}$/.test(data.sourceId) || !Array.isArray(data.files) ||
        ![1, 2].includes(data.files.length) || Object.keys(data).sort().join(',') !== 'createdAt,files,sourceId,version') fail('RECOVERY_INTEGRITY');
    timeCheck(data.createdAt);
    const names = data.files.map(f => f.name).join(',');
    if (names !== 'runtime.sqlite' && names !== 'runtime.sqlite,documents.sqlite') fail('RECOVERY_INTEGRITY');
    for (const f of data.files) {
      if (typeof f.bytes !== 'string' || f.bytes.length > Math.ceil(MAX_DB / 3) * 4 || !/^[0-9a-f]{64}$/.test(f.sha256)) fail('RECOVERY_LIMIT');
      const bytes = Buffer.from(f.bytes, 'base64');
      if (bytes.length > MAX_DB || bytes.toString('base64') !== f.bytes || sha(bytes) !== f.sha256) fail('RECOVERY_INTEGRITY');
      bytes.fill(0);
    }
    return data;
  } catch (error) {
    if (['RECOVERY_LIMIT', 'RECOVERY_CLOCK'].includes(error.message)) throw error;
    fail('RECOVERY_INTEGRITY');
  } finally { plaintext?.fill(0); envelope.fill(0); }
}
function unpack(data, stage) {
  for (const file of data.files) {
    const bytes = Buffer.from(file.bytes, 'base64'), filename = path.join(stage, file.name);
    try { fs.writeFileSync(filename, bytes, { flag: 'wx', mode: 0o600 }); syncFile(filename); }
    finally { bytes.fill(0); }
  }
}
function verifyRecovery({ filename, key, vaultKey } = {}) {
  const data = decode(filename, key);
  const stage = fs.mkdtempSync(path.join(privateDir(path.dirname(filename)), '.stage-verify-'));
  try {
    unpack(data, stage); const counts = inspectPair(stage, vaultKey);
    return { verified: true, createdAt: data.createdAt, sourceId: data.sourceId, ...counts };
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
}
function listRecovery({ stateDir, backupDir } = {}) {
  const { backups, sourceId } = configPaths(stateDir, backupDir);
  const pattern = new RegExp(`^recovery-${sourceId}-[0-9]{13}-[0-9a-f]{16}\\.fbr$`);
  return fs.readdirSync(backups).filter(n => pattern.test(n)).sort().map(n => path.join(backups, n));
}
function captureRecovery({ stateDir, backupDir, key, vaultKey, clock = Date.now, keep = 7 } = {}) {
  keyCheck(key);
  if (typeof clock !== 'function' || !Number.isSafeInteger(keep) || keep < 2 || keep > 30) fail('RECOVERY_CONFIG_INVALID');
  const createdAt = timeCheck(clock()), { state, backups, sourceId } = configPaths(stateDir, backupDir);
  const sources = ['runtime.sqlite'];
  regular(path.join(state, sources[0]), MAX_DB);
  if (fs.existsSync(path.join(state, 'documents.sqlite'))) {
    if (!Buffer.isBuffer(vaultKey) || vaultKey.length !== 32) fail('VAULT_KEY_REQUIRED');
    sources.push('documents.sqlite');
  }
  for (const name of sources) {
    regular(path.join(state, name), MAX_DB);
    for (const suffix of ['-wal', '-shm']) if (fs.existsSync(path.join(state, name + suffix))) regular(path.join(state, name + suffix), MAX_ENVELOPE);
  }
  if (listRecovery({ stateDir: state, backupDir: backups }).length >= 100) fail('RECOVERY_LIMIT');
  const stage = fs.mkdtempSync(path.join(backups, '.stage-capture-')); let coordinator, locked = false;
  try {
    coordinator = new DatabaseSync(path.join(state, 'runtime.sqlite'));
    coordinator.exec('PRAGMA busy_timeout=25; PRAGMA trusted_schema=OFF;');
    if (sources.length === 2) coordinator.prepare('ATTACH DATABASE ? AS evidence').run(path.join(state, 'documents.sqlite'));
    try { coordinator.exec('BEGIN IMMEDIATE'); locked = true; }
    catch (error) { if (/locked|busy/i.test(error.message)) fail('RECOVERY_BUSY'); throw error; }
    for (const name of sources) {
      const source = new DatabaseSync(path.join(state, name), { readOnly: true });
      try {
        schema(source, name === 'documents.sqlite');
        source.prepare('VACUUM main INTO ?').run(path.join(stage, name));
        fs.chmodSync(path.join(stage, name), 0o600); syncFile(path.join(stage, name));
      } finally { source.close(); }
    }
    coordinator.exec('ROLLBACK'); locked = false; coordinator.close(); coordinator = null;
    inspectPair(stage, vaultKey);
    const files = sources.map(name => {
      const bytes = readBounded(path.join(stage, name), MAX_DB);
      try { return { name, sha256: sha(bytes), bytes: bytes.toString('base64') }; } finally { bytes.fill(0); }
    });
    const data = Buffer.from(JSON.stringify({ version: 1, createdAt, sourceId, files }));
    const nonce = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, nonce); cipher.setAAD(MAGIC);
    let envelope;
    try { envelope = Buffer.concat([MAGIC, nonce, Buffer.alloc(16), cipher.update(data), cipher.final()]); cipher.getAuthTag().copy(envelope, MAGIC.length + 12); }
    finally { data.fill(0); }
    if (envelope.length > MAX_ENVELOPE) fail('RECOVERY_LIMIT');
    const partial = path.join(stage, 'encrypted.partial');
    fs.writeFileSync(partial, envelope, { flag: 'wx', mode: 0o600 }); envelope.fill(0); syncFile(partial);
    const verified = verifyRecovery({ filename: partial, key, vaultKey });
    const filename = path.join(backups, `recovery-${sourceId}-${createdAt}-${crypto.randomBytes(8).toString('hex')}.fbr`);
    fs.linkSync(partial, filename); syncDir(backups);
    // Only prune old files that authenticate as this source. Preserve corrupt/foreign files.
    const valid = [];
    for (const candidate of listRecovery({ stateDir: state, backupDir: backups })) {
      try { const info = verifyRecovery({ filename: candidate, key, vaultKey }); if (info.sourceId === sourceId) valid.push({ filename: candidate, time: info.createdAt }); }
      catch { /* An unverifiable older file is never silently deleted. */ }
    }
    valid.sort((a, b) => a.time - b.time || a.filename.localeCompare(b.filename));
    for (const candidate of valid.filter(v => v.filename !== filename).slice(0, Math.max(0, valid.length - keep))) fs.unlinkSync(candidate.filename);
    syncDir(backups); return { ...verified, filename };
  } finally {
    if (locked) try { coordinator.exec('ROLLBACK'); } catch { /* Close also releases transaction locks. */ }
    coordinator?.close(); fs.rmSync(stage, { recursive: true, force: true });
  }
}
function restoreRecovery({ filename, key, vaultKey, destination } = {}) {
  const target = absolute(destination), parent = privateDir(path.dirname(target));
  if (fs.existsSync(target)) fail('DESTINATION_EXISTS');
  const data = decode(filename, key), lockPath = target + '.restore-lock'; let lockFd, stage;
  try {
    try { lockFd = fs.openSync(lockPath, 'wx', 0o600); } catch { fail('DESTINATION_EXISTS'); }
    if (fs.existsSync(target)) fail('DESTINATION_EXISTS');
    stage = fs.mkdtempSync(path.join(parent, '.stage-restore-')); unpack(data, stage);
    const counts = inspectPair(stage, vaultKey);
    const db = new DatabaseSync(path.join(stage, 'runtime.sqlite'));
    try {
      db.exec('PRAGMA trusted_schema=OFF; BEGIN IMMEDIATE;');
      for (const row of db.prepare('SELECT id FROM tenants').all()) db.prepare('UPDATE tenants SET token_hash=? WHERE id=?').run(sha(crypto.randomBytes(32)), row.id);
      db.exec('UPDATE workspaces SET enabled=0,lease_token=NULL,lease_until=NULL; COMMIT; PRAGMA wal_checkpoint(TRUNCATE);');
    } finally { db.close(); }
    inspectPair(stage, vaultKey);
    for (const file of data.files) syncFile(path.join(stage, file.name)); syncDir(stage);
    if (fs.existsSync(target)) fail('DESTINATION_EXISTS');
    fs.renameSync(stage, target); stage = null; syncDir(parent);
    return { verified: true, createdAt: data.createdAt, destination: target, ...counts, credentialsInvalidated: true, automationPaused: true };
  } finally {
    if (stage) fs.rmSync(stage, { recursive: true, force: true });
    if (lockFd !== undefined) { fs.closeSync(lockFd); fs.unlinkSync(lockPath); }
  }
}
module.exports = { captureRecovery, verifyRecovery, restoreRecovery, listRecovery };
