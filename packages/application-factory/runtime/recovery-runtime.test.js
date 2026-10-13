'use strict';
// Integration against the real upstream runtime and evidence vault, not the schema fixture.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn } = require('node:child_process');
const { openRuntime } = require('./runtime');
const { openVault } = require('./vault');
const { captureRecovery, restoreRecovery } = require('./recovery');
const { reissue } = require('../../../scripts/application-recovery');
const recipes = require('../recipes.json');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
test('all three real editions restore evidence and resume without replaying completed notifications', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-real-recovery-'));
  const stateDir = path.join(dir, 'state'), key = Buffer.alloc(32, 27), vaultKey = Buffer.alloc(32, 71);
  let runtime, vault, restoredRuntime, restoredVault;
  t.after(() => { restoredVault?.close(); restoredRuntime?.close(); vault?.close(); runtime?.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  runtime = openRuntime({ filename: path.join(stateDir, 'runtime.sqlite'), recipes });
  vault = openVault({ filename: path.join(stateDir, 'documents.sqlite'), key: vaultKey });
  const token = runtime.provisionTenant('synthetic-a').token;
  const today = new Date().toISOString().slice(0, 10), bytes = Buffer.from('%PDF-1.7\nsynthetic recovery\n%%EOF\n');
  const ids = [];
  for (const recipe of recipes) {
    runtime.createWorkspace(token, { id: recipe.id, recipeId: recipe.id });
    runtime.command(token, recipe.id, { type: 'add', name: 'Synthetic recovery', dueOn: today }, 'intake');
    ids.push(vault.put({ tenantId: 'synthetic-a', workspaceId: recipe.id, recordId: 'r1', requirementId: recipe.requirements[0].id,
      requestKey: 'file', name: 'recovery.pdf', mediaType: 'application/pdf', bytes }).id);
  }
  runtime.sweep();
  const saved = captureRecovery({ stateDir, backupDir: path.join(dir, 'backups'), key, vaultKey });
  assert.equal(saved.documents, 3); assert.equal(saved.workspaces, 3);
  const out = restoreRecovery({ filename: saved.filename, key, vaultKey, destination: path.join(dir, 'restored') });
  restoredRuntime = openRuntime({ filename: path.join(out.destination, 'runtime.sqlite'), recipes });
  restoredVault = openVault({ filename: path.join(out.destination, 'documents.sqlite'), key: vaultKey });
  assert.throws(() => restoredRuntime.workspaces(token), /UNAUTHORIZED/);
  const credentialFile = path.join(dir, 'reissued.json'); reissue({ stateDir: out.destination, tenantId: 'synthetic-a', credentialFile });
  const renewed = JSON.parse(fs.readFileSync(credentialFile, 'utf8')).token;
  for (const [i, recipe] of recipes.entries()) {
    assert.equal(restoredRuntime.workspace(renewed, recipe.id).enabled, false);
    assert.deepEqual(restoredVault.read({ tenantId: 'synthetic-a', workspaceId: recipe.id, id: ids[i] }).bytes, bytes);
    assert.equal(restoredRuntime.inbox(renewed, recipe.id).length, 1);
    restoredRuntime.command(renewed, recipe.id, { type: 'automation', enabled: true }, 'resume');
  }
  assert.equal(restoredRuntime.sweep().notifications, 0);
});
test('the real serve command creates a verified encrypted recovery point without a browser', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-recovery-service-'));
  const stateDir = path.join(dir, 'state'), backupDir = path.join(dir, 'backups');
  const runtime = openRuntime({ filename: path.join(stateDir, 'runtime.sqlite'), recipes });
  const token = runtime.provisionTenant('synthetic-b').token;
  runtime.createWorkspace(token, { id: recipes[0].id, recipeId: recipes[0].id }); runtime.close();
  const script = path.resolve(__dirname, '../../../scripts/run-application-runtime.js');
  const env = { ...process.env, FACTORY_BACKUP_DIR: backupDir, FACTORY_BACKUP_KEY_HEX: Buffer.alloc(32, 17).toString('hex') };
  delete env.FACTORY_VAULT_KEY_HEX;
  const child = spawn(process.execPath, [script, 'serve', '--state-dir', stateDir, '--port', '0'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', errors = '', exitCode = null;
  child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { errors += b; });
  child.on('exit', code => { exitCode = code; });
  const exited = new Promise(resolve => child.once('close', resolve));
  t.after(async () => { if (child.exitCode === null) child.kill('SIGTERM'); await Promise.race([exited, wait(1500)]); if (child.exitCode === null) child.kill('SIGKILL'); await exited; fs.rmSync(dir, { recursive: true, force: true }); });
  const end = Date.now() + 5000;
  while (!output.includes('"verified":true') && exitCode === null && Date.now() < end) await wait(30);
  assert.ok(output.includes('"verified":true'), 'service recovery status: ' + output + errors);
  assert.equal(output.includes(env.FACTORY_BACKUP_KEY_HEX), false); assert.equal(output.includes(token), false);
  assert.equal(fs.readdirSync(backupDir).filter(n => n.endsWith('.fbr')).length, 1);
  child.kill('SIGTERM'); await exited; assert.equal(child.exitCode, 0);
});
