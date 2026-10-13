'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { seed, BACKUP_KEY, VAULT_KEY, NOW, BYTES } = require('./recovery-fixture.cjs');
let Recovery = {}, Supervisor = {};
if (fs.existsSync(path.join(__dirname, 'recovery.js'))) Recovery = require('./recovery');
if (fs.existsSync(path.join(__dirname, 'recovery-supervisor.js'))) Supervisor = require('./recovery-supervisor');
function setup(t, options = {}) {
  assert.equal(typeof Recovery.captureRecovery, 'function', 'verified recovery capability must exist');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-recovery-test-'));
  const stateDir = path.join(root, 'state'), backupDir = path.join(root, 'backups');
  const source = seed(stateDir, options);
  let now = NOW;
  const config = { stateDir, backupDir, key: BACKUP_KEY, vaultKey: options.vault === false ? undefined : VAULT_KEY, clock: () => now };
  t.after(() => { source.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, stateDir, backupDir, source, config, setTime: n => { now = n; },
    capture: more => Recovery.captureRecovery({ ...config, ...more }),
    verify: (filename, more = {}) => Recovery.verifyRecovery({ filename, key: BACKUP_KEY, vaultKey: config.vaultKey, ...more }),
    restore: (filename, more = {}) => Recovery.restoreRecovery({ filename, key: BACKUP_KEY, vaultKey: config.vaultKey,
      destination: path.join(root, 'restored'), ...more }) };
}
const backups = dir => fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => n.endsWith('.fbr')) : [];
test('captures an encrypted, verified pair without plaintext metadata or attachment bytes', t => {
  const x = setup(t), result = x.capture();
  assert.equal(result.verified, true); assert.equal(result.workspaces, 1); assert.equal(result.documents, 1);
  const bytes = fs.readFileSync(result.filename);
  assert.equal(bytes.includes(Buffer.from('SYNTHETIC PRIVATE')), false); assert.equal(bytes.includes(BYTES), false);
  assert.equal(bytes.includes(BACKUP_KEY), false); assert.equal(bytes.includes(VAULT_KEY), false);
  assert.equal(x.verify(result.filename).verified, true); assert.equal(backups(x.backupDir).length, 1);
  assert.ok(!fs.readdirSync(x.backupDir).some(n => n.startsWith('.stage-')));
});
test('includes committed WAL rows and leaves both live databases writable', t => {
  const x = setup(t); x.source.db.prepare('UPDATE workspaces SET version=3 WHERE id=?').run('main');
  assert.ok(fs.statSync(path.join(x.stateDir, 'runtime.sqlite-wal')).size > 0);
  const saved = x.capture(), restored = x.restore(saved.filename);
  const db = new DatabaseSync(path.join(restored.destination, 'runtime.sqlite'));
  assert.equal(db.prepare('SELECT version FROM workspaces').get().version, 3); db.close();
  assert.doesNotThrow(() => x.source.db.exec('UPDATE workspaces SET version=4'));
  assert.doesNotThrow(() => x.source.documentDb.exec("UPDATE vault_documents SET request_key='modified'"));
});
test('restores documents and work into a fresh directory without modifying source files', t => {
  const x = setup(t), saved = x.capture(), before = x.source.db.prepare('SELECT * FROM tenants').all();
  const restored = x.restore(saved.filename);
  assert.equal(restored.documents, 1); assert.equal(restored.workspaces, 1);
  assert.deepEqual(x.source.db.prepare('SELECT * FROM tenants').all(), before);
  assert.ok(fs.existsSync(path.join(restored.destination, 'documents.sqlite')));
  assert.equal(restored.credentialsInvalidated, true); assert.equal(restored.automationPaused, true);
});
test('restore invalidates old credentials, clears worker leases, and pauses all automation', t => {
  const x = setup(t), saved = x.capture(), output = x.restore(saved.filename);
  const db = new DatabaseSync(path.join(output.destination, 'runtime.sqlite'));
  const tenant = db.prepare('SELECT * FROM tenants').get(), row = db.prepare('SELECT * FROM workspaces').get();
  assert.notEqual(tenant.token_hash, crypto.createHash('sha256').update(x.source.token).digest('hex'));
  assert.equal(row.enabled, 0); assert.equal(row.lease_token, null); assert.equal(row.lease_until, null);
  assert.equal(db.prepare('SELECT count(*) AS n FROM receipts').get().n, 1); db.close();
  assert.equal(x.source.db.prepare('SELECT enabled FROM workspaces').get().enabled, 1);
});
test('wrong backup key and authenticated ciphertext corruption never create a restore directory', t => {
  const x = setup(t), saved = x.capture();
  assert.throws(() => x.restore(saved.filename, { key: Buffer.alloc(32, 19) }), /RECOVERY_INTEGRITY/);
  const b = fs.readFileSync(saved.filename); b[b.length - 4] ^= 255; fs.writeFileSync(saved.filename, b);
  assert.throws(() => x.restore(saved.filename), /RECOVERY_INTEGRITY/);
  assert.equal(fs.existsSync(path.join(x.root, 'restored')), false);
});
test('wrong or missing vault key cannot falsely verify encrypted documents', t => {
  const x = setup(t), saved = x.capture();
  assert.throws(() => x.verify(saved.filename, { vaultKey: Buffer.alloc(32, 20) }), /DOCUMENT_INTEGRITY/);
  assert.throws(() => x.verify(saved.filename, { vaultKey: undefined }), /VAULT_KEY_REQUIRED/);
  assert.throws(() => x.capture({ vaultKey: undefined }), /VAULT_KEY_REQUIRED/);
  assert.equal(backups(x.backupDir).length, 1);
});
test('runtime-only deployments can capture and restore without a vault', t => {
  const x = setup(t, { vault: false }), saved = x.capture(), out = x.restore(saved.filename);
  assert.equal(saved.documents, 0); assert.equal(out.hasVault, false);
  assert.equal(fs.existsSync(path.join(out.destination, 'documents.sqlite')), false);
});
test('corrupt live evidence prevents publication and preserves prior good recovery points', t => {
  const x = setup(t); x.capture();
  x.source.documentDb.prepare('UPDATE vault_documents SET ciphertext=?').run(Buffer.from('corrupt'));
  assert.throws(() => x.capture(), /DOCUMENT_INTEGRITY/); assert.equal(backups(x.backupDir).length, 1);
});
test('orphan evidence cannot be backed up as a complete application snapshot', t => {
  const x = setup(t); x.source.db.exec('DELETE FROM receipts; DELETE FROM inbox; DELETE FROM workspaces;');
  assert.throws(() => x.capture(), /RECOVERY_REFERENCE/); assert.equal(backups(x.backupDir).length, 0);
});
test('malformed workflow snapshot fails semantic verification before backup publication', t => {
  const x = setup(t); x.source.db.exec("UPDATE workspaces SET snapshot='{}'");
  assert.throws(() => x.capture(), /SNAPSHOT_INVALID/); assert.equal(backups(x.backupDir).length, 0);
});
test('unsupported schema versions and additional active schema objects are rejected', t => {
  const x = setup(t); x.source.db.exec('PRAGMA user_version=99;');
  assert.throws(() => x.capture(), /SCHEMA_UNSUPPORTED/);
  x.source.db.exec('PRAGMA user_version=1; CREATE VIEW unexpected AS SELECT * FROM tenants;');
  assert.throws(() => x.capture(), /SCHEMA_UNSUPPORTED/);
});
test('an active writer blocks paired capture without publishing a mixed snapshot', t => {
  const x = setup(t); x.source.documentDb.exec('BEGIN IMMEDIATE');
  try { assert.throws(() => x.capture(), /RECOVERY_BUSY/); }
  finally { x.source.documentDb.exec('ROLLBACK'); }
  assert.equal(backups(x.backupDir).length, 0); assert.equal(x.capture().verified, true);
});
test('never overwrites any existing destination, even an empty directory', t => {
  const x = setup(t), saved = x.capture(), destination = path.join(x.root, 'occupied'); fs.mkdirSync(destination);
  assert.throws(() => x.restore(saved.filename, { destination }), /DESTINATION_EXISTS/);
  assert.deepEqual(fs.readdirSync(destination), []);
  assert.throws(() => x.restore(saved.filename, { destination: x.stateDir }), /DESTINATION_EXISTS/);
});
test('missing source database is not silently created', t => {
  const x = setup(t), empty = path.join(x.root, 'empty'); fs.mkdirSync(empty, { mode: 0o700 });
  assert.throws(() => x.capture({ stateDir: empty }), /STATE_MISSING/);
  assert.deepEqual(fs.readdirSync(empty), []);
});
test('rejects backup locations inside live state and unsafe key lengths', t => {
  const x = setup(t);
  assert.throws(() => x.capture({ backupDir: path.join(x.stateDir, 'backups') }), /STATE_PATH_UNSAFE/);
  assert.throws(() => x.capture({ key: Buffer.alloc(10) }), /RECOVERY_CONFIG_INVALID/);
});
test('rejects source or destination symlinks and non-private POSIX directories', t => {
  const x = setup(t), link = path.join(x.root, 'alias'); fs.symlinkSync(x.stateDir, link);
  assert.throws(() => x.capture({ stateDir: link }), /STATE_PATH_UNSAFE/);
  fs.mkdirSync(x.backupDir, { mode: 0o700 });
  if (process.platform !== 'win32') {
    fs.chmodSync(x.backupDir, 0o755);
    assert.throws(() => x.capture(), /STATE_PATH_UNSAFE/); fs.chmodSync(x.backupDir, 0o700);
  }
});
test('refuses oversized envelopes before buffering their bytes', t => {
  const x = setup(t), saved = x.capture(); fs.truncateSync(saved.filename, 100 * 1024 * 1024);
  assert.throws(() => x.verify(saved.filename), /RECOVERY_LIMIT/);
});
test('retention keeps seven verified points and preserves unrelated and corrupt files', t => {
  const x = setup(t), names = [];
  for (let i = 0; i < 7; i++) { x.setTime(NOW + i * 1000); names.push(x.capture().filename); }
  const foreign = path.join(x.backupDir, 'other-owner.fbr'); fs.writeFileSync(foreign, 'not mine');
  const b = fs.readFileSync(names[1]); b[b.length - 1] ^= 1; fs.writeFileSync(names[1], b);
  x.setTime(NOW + 8000); x.capture(); x.setTime(NOW + 9000); x.capture();
  assert.equal(fs.existsSync(names[0]), false); assert.equal(fs.existsSync(names[1]), true);
  assert.equal(fs.readFileSync(foreign, 'utf8'), 'not mine');
});
test('new recovery points use fresh nonces and private permissions', t => {
  const x = setup(t), a = x.capture(), b = x.capture();
  assert.notEqual(a.filename, b.filename); assert.notDeepEqual(fs.readFileSync(a.filename), fs.readFileSync(b.filename));
  if (process.platform !== 'win32') assert.equal(fs.statSync(a.filename).mode & 0o777, 0o600);
});
test('supervisor persists cadence across restart and resumes after a failed check', t => {
  const x = setup(t); assert.equal(typeof Supervisor.createRecoverySupervisor, 'function');
  const first = Supervisor.createRecoverySupervisor({ ...x.config, intervalMs: 60000 });
  assert.equal(first.tick().verified, true); assert.equal(backups(x.backupDir).length, 1); first.stop();
  const second = Supervisor.createRecoverySupervisor({ ...x.config, intervalMs: 60000 });
  assert.equal(second.tick().verified, true); assert.equal(backups(x.backupDir).length, 1);
  x.setTime(NOW + 60001); second.tick(); assert.equal(backups(x.backupDir).length, 2); second.stop();
});
test('supervisor reports corrupt latest recovery instead of silently falling back to older green', t => {
  const x = setup(t); x.capture(); x.setTime(NOW + 1000); const latest = x.capture();
  const b = fs.readFileSync(latest.filename); b[b.length - 1] ^= 1; fs.writeFileSync(latest.filename, b);
  const supervisor = Supervisor.createRecoverySupervisor(x.config), status = supervisor.tick();
  assert.equal(status.verified, false); assert.equal(status.lastError, 'RECOVERY_INTEGRITY'); supervisor.stop();
});
test('timer runs backup without a browser and stop prevents later ticks', async t => {
  const x = setup(t), supervisor = Supervisor.createRecoverySupervisor({ ...x.config, pollMs: 10 });
  t.after(() => supervisor.stop()); supervisor.start();
  const deadline = Date.now() + 2000;
  while (!supervisor.status().verified && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
  assert.equal(supervisor.status().verified, true); supervisor.stop();
  const count = backups(x.backupDir).length; x.setTime(NOW + 86400000);
  await new Promise(r => setTimeout(r, 30)); assert.equal(backups(x.backupDir).length, count);
});
test('operator CLI captures, verifies and restores in independent processes without exposing keys', t => {
  const x = setup(t), { spawnSync } = require('node:child_process');
  const script = path.resolve(__dirname, '../../../scripts/application-recovery.js');
  const env = { ...process.env, FACTORY_BACKUP_KEY_HEX: BACKUP_KEY.toString('hex'), FACTORY_VAULT_KEY_HEX: VAULT_KEY.toString('hex') };
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { env, encoding: 'utf8', timeout: 10000 });
  const capture = run('capture', '--state-dir', x.stateDir, '--backup-dir', x.backupDir);
  assert.equal(capture.status, 0, capture.stderr); const saved = JSON.parse(capture.stdout);
  const verify = run('verify', '--file', saved.filename); assert.equal(verify.status, 0, verify.stderr);
  assert.equal(JSON.parse(verify.stdout).documents, 1);
  const destination = path.join(x.root, 'process-restored');
  const restore = run('restore', '--file', saved.filename, '--destination', destination);
  assert.equal(restore.status, 0, restore.stderr); assert.equal(JSON.parse(restore.stdout).credentialsInvalidated, true);
  const output = path.join(x.root, 'new-credential.json');
  const issue = run('reissue', '--state-dir', destination, '--tenant', 'synthetic-a', '--credential-file', output);
  assert.equal(issue.status, 0, issue.stderr); const credential = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.match(credential.token, /^[A-Za-z0-9_-]{43}$/); assert.equal(issue.stdout.includes(credential.token), false);
  assert.equal(capture.stdout.includes(env.FACTORY_BACKUP_KEY_HEX), false);
  assert.notEqual(run('reissue', '--state-dir', destination, '--tenant', 'synthetic-a', '--credential-file', output).status, 0);
  const db = new DatabaseSync(path.join(destination, 'runtime.sqlite'));
  assert.equal(db.prepare('SELECT enabled FROM workspaces').get().enabled, 0); db.close();
});
test('partial automatic-backup configuration is rejected and no configuration remains disabled', () => {
  assert.equal(Supervisor.recoveryFromEnvironment({ stateDir: '/unused', env: {} }), null);
  assert.throws(() => Supervisor.recoveryFromEnvironment({ stateDir: '/unused', env: { FACTORY_BACKUP_DIR: '/unused-backups' } }), /RECOVERY_CONFIG_INVALID/);
  assert.throws(() => Supervisor.recoveryFromEnvironment({ stateDir: '/unused', env: { FACTORY_BACKUP_DIR: '/unused-backups', FACTORY_BACKUP_KEY_HEX: 'short' } }), /RECOVERY_CONFIG_INVALID/);
});
test('transient contention is reported, retried, and never restores over live state', t => {
  const x = setup(t), messages = [];
  const supervisor = Supervisor.createRecoverySupervisor({ ...x.config, onStatus: s => messages.push(s) });
  x.source.db.exec('BEGIN IMMEDIATE');
  try { assert.equal(supervisor.tick().lastError, 'RECOVERY_BUSY'); } finally { x.source.db.exec('ROLLBACK'); }
  assert.equal(backups(x.backupDir).length, 0); x.setTime(NOW + 60001);
  assert.equal(supervisor.tick().verified, true); assert.equal(messages.length, 2); supervisor.stop();
  assert.equal(x.source.db.prepare('SELECT enabled FROM workspaces').get().enabled, 1);
});
test('stopping a supervisor does not erase caller-owned keys or permit later manual ticks', t => {
  const x = setup(t), before = Buffer.from(BACKUP_KEY), supervisor = Supervisor.createRecoverySupervisor(x.config);
  supervisor.stop(); assert.deepEqual(BACKUP_KEY, before);
  assert.equal(supervisor.tick().verified, false); assert.equal(backups(x.backupDir).length, 0);
});
