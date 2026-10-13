'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { seed, BACKUP_KEY, VAULT_KEY } = require('./recovery-fixture.cjs');
const { captureRecovery } = require('./recovery');
test('a configured evidence database cannot disappear or become a dangling link and be reported as runtime-only success', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-vault-boundary-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stateDir = path.join(root, 'state'), backupDir = path.join(root, 'backups');
  const source = seed(stateDir); source.close();
  const file = path.join(stateDir, 'documents.sqlite'); fs.unlinkSync(file);
  assert.throws(() => captureRecovery({ stateDir, backupDir, key: BACKUP_KEY, vaultKey: VAULT_KEY }), /STATE_MISSING/);
  fs.symlinkSync(path.join(root, 'missing-target'), file);
  assert.throws(() => captureRecovery({ stateDir, backupDir, key: BACKUP_KEY }), /STATE_PATH_UNSAFE/);
  assert.ok(!fs.existsSync(backupDir) || !fs.readdirSync(backupDir).some(n => n.endsWith('.fbr')));
});
