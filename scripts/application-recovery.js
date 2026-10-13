'use strict';
// Explicit local operator tooling. Never recover over a running/live directory.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { captureRecovery, verifyRecovery, restoreRecovery } = require('../packages/application-factory/runtime/recovery');
const ROOT = path.resolve(__dirname, '..');
function fail(code) { throw new Error(code); }
function privatePath(raw, directory = false) {
  if (typeof raw !== 'string' || !path.isAbsolute(raw)) fail('STATE_PATH_UNSAFE');
  const result = path.resolve(raw), relative = path.relative(ROOT, result);
  if (relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) fail('STATE_PATH_UNSAFE');
  const parent = directory ? result : path.dirname(result), stat = fs.lstatSync(parent);
  const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
  if (!stat.isDirectory() || stat.isSymbolicLink() || normalize(fs.realpathSync(parent)) !== normalize(parent)) fail('STATE_PATH_UNSAFE');
  if (process.platform !== 'win32' && ((stat.mode & 0o077) || (typeof process.getuid === 'function' && stat.uid !== process.getuid()))) fail('STATE_PATH_UNSAFE');
  return result;
}
function reissue({ stateDir, tenantId, credentialFile }) {
  if (typeof tenantId !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(tenantId) || tenantId.length > 60) fail('TENANT_INVALID');
  const filename = path.join(privatePath(stateDir, true), 'runtime.sqlite'), output = privatePath(credentialFile);
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || (process.platform !== 'win32' && (stat.mode & 0o077))) fail('STATE_PATH_UNSAFE');
  const fd = fs.openSync(output, 'wx', 0o600); let db, committed = false;
  try {
    db = new DatabaseSync(filename); db.exec('PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=100;');
    if (db.prepare('PRAGMA application_id').get().application_id !== 1178682196 || db.prepare('PRAGMA user_version').get().user_version !== 1) fail('SCHEMA_UNSUPPORTED');
    db.exec('BEGIN IMMEDIATE');
    const token = crypto.randomBytes(32).toString('base64url'), digest = crypto.createHash('sha256').update(token).digest('hex');
    if (!db.prepare('UPDATE tenants SET token_hash=? WHERE id=? AND active=1').run(digest, tenantId).changes) fail('NOT_FOUND');
    fs.writeFileSync(fd, JSON.stringify({ tenantId, token }) + '\n'); fs.fsyncSync(fd);
    if (process.platform !== 'win32') { const p = fs.openSync(path.dirname(output), 'r'); try { fs.fsyncSync(p); } finally { fs.closeSync(p); } }
    db.exec('COMMIT'); committed = true;
    return { issued: true, credentialFile: output, automationResumed: false };
  } finally {
    if (!committed && db) try { db.exec('ROLLBACK'); } catch { /* No completed transaction. */ }
    db?.close(); fs.closeSync(fd); if (!committed) fs.unlinkSync(output);
  }
}
function main(args = process.argv.slice(2), env = process.env) {
  const [mode, ...tail] = args;
  const shapes = { capture: ['--state-dir', '--backup-dir'], verify: ['--file'], restore: ['--file', '--destination'],
    reissue: ['--state-dir', '--tenant', '--credential-file'] };
  if (!Object.hasOwn(shapes, mode) || tail.length !== shapes[mode].length * 2) fail('USAGE_INVALID');
  const flags = Object.create(null);
  for (let i = 0; i < tail.length; i += 2) {
    if (!shapes[mode].includes(tail[i]) || Object.hasOwn(flags, tail[i]) || !tail[i + 1]) fail('USAGE_INVALID');
    flags[tail[i]] = tail[i + 1];
  }
  if (mode === 'reissue') return reissue({ stateDir: flags['--state-dir'], tenantId: flags['--tenant'], credentialFile: flags['--credential-file'] });
  if (!/^[0-9a-fA-F]{64}$/.test(env.FACTORY_BACKUP_KEY_HEX || '')) fail('RECOVERY_CONFIG_INVALID');
  if (env.FACTORY_VAULT_KEY_HEX && !/^[0-9a-fA-F]{64}$/.test(env.FACTORY_VAULT_KEY_HEX)) fail('RECOVERY_CONFIG_INVALID');
  const key = Buffer.from(env.FACTORY_BACKUP_KEY_HEX, 'hex'), vaultKey = env.FACTORY_VAULT_KEY_HEX ? Buffer.from(env.FACTORY_VAULT_KEY_HEX, 'hex') : undefined;
  try {
    if (mode === 'capture') return captureRecovery({ stateDir: flags['--state-dir'], backupDir: flags['--backup-dir'], key, vaultKey });
    if (mode === 'verify') return verifyRecovery({ filename: flags['--file'], key, vaultKey });
    return restoreRecovery({ filename: flags['--file'], destination: flags['--destination'], key, vaultKey });
  } finally { key.fill(0); vaultKey?.fill(0); }
}
if (require.main === module) {
  try { console.log(JSON.stringify({ ...main(), releaseApproved: false })); }
  catch { console.error('Application recovery failed; check private paths, keys, backup integrity and operator configuration.'); process.exitCode = 1; }
}
module.exports = { main, reissue };
