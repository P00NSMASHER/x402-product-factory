'use strict';
// Synthetic schema-v1 fixture, independent of the recovery implementation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const Kernel = require('../kernel');
const recipes = require('../recipes.json');
const BACKUP_KEY = Buffer.alloc(32, 31), VAULT_KEY = Buffer.alloc(32, 74);
const NOW = Date.parse('2026-10-13T12:00:00Z');
const BYTES = Buffer.from('%PDF-1.7\nSYNTHETIC PRIVATE EVIDENCE\n%%EOF\n');
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
function seed(stateDir, { vault = true } = {}) {
  fs.mkdirSync(stateDir, { mode: 0o700 });
  fs.closeSync(fs.openSync(path.join(stateDir, 'runtime.sqlite'), 'wx', 0o600));
  const db = new DatabaseSync(path.join(stateDir, 'runtime.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;
    CREATE TABLE tenants(id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, active INTEGER NOT NULL CHECK(active IN(0,1))) STRICT;
    CREATE TABLE workspaces(tenant_id TEXT NOT NULL REFERENCES tenants(id), id TEXT NOT NULL, recipe TEXT NOT NULL, snapshot TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)), next_run INTEGER NOT NULL,
      observed_ms INTEGER NOT NULL, failures INTEGER NOT NULL DEFAULT 0, last_error TEXT, last_success INTEGER,
      lease_token TEXT, lease_until INTEGER, PRIMARY KEY(tenant_id,id)) STRICT;
    CREATE TABLE inbox(tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL, message_id TEXT NOT NULL,
      payload TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('open','cancelled')), created_ms INTEGER NOT NULL,
      PRIMARY KEY(tenant_id,workspace_id,message_id), FOREIGN KEY(tenant_id,workspace_id) REFERENCES workspaces(tenant_id,id)) STRICT;
    CREATE TABLE receipts(tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL, request_key TEXT NOT NULL, command_hash TEXT NOT NULL,
      result TEXT NOT NULL, PRIMARY KEY(tenant_id,workspace_id,request_key), FOREIGN KEY(tenant_id,workspace_id) REFERENCES workspaces(tenant_id,id)) STRICT;
    PRAGMA application_id=1178682196; PRAGMA user_version=1;`);
  const token = 'x'.repeat(43);
  db.prepare('INSERT INTO tenants VALUES(?,?,1)').run('synthetic-a', sha(token));
  const recipe = Kernel.validateRecipe(recipes[0]);
  const workspace = Kernel.createWorkspace(recipe, { workspaceId: 'main', today: '2026-10-13' });
  workspace.addRecord({ name: 'SYNTHETIC PRIVATE SUPPLIER', dueOn: '2026-10-13' });
  workspace.runAutomation();
  db.prepare('INSERT INTO workspaces VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    'synthetic-a', 'main', JSON.stringify(recipe), JSON.stringify(workspace.snapshot()),
    2, 1, NOW, NOW, 0, null, NOW, 'stale-lease', NOW + 999999);
  db.prepare('INSERT INTO inbox VALUES(?,?,?,?,?,?)').run('synthetic-a', 'main', 'm1', JSON.stringify({
    recordId: 'r1', recordName: 'SYNTHETIC PRIVATE SUPPLIER', kind: 'collection', day: '2026-10-13', revision: 1
  }), 'open', NOW);
  db.prepare('INSERT INTO receipts VALUES(?,?,?,?,?)').run('synthetic-a', 'main', 'first', sha('request'), '{"version":2,"result":{}}');
  fs.chmodSync(path.join(stateDir, 'runtime.sqlite'), 0o600);
  let documentDb;
  if (vault) {
    fs.closeSync(fs.openSync(path.join(stateDir, 'documents.sqlite'), 'wx', 0o600));
    documentDb = new DatabaseSync(path.join(stateDir, 'documents.sqlite'));
    documentDb.exec(`PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;
      CREATE TABLE vault_documents(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
        record_id TEXT NOT NULL, requirement_id TEXT NOT NULL, request_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
        name TEXT NOT NULL, media_type TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL,
        created_ms INTEGER NOT NULL, nonce BLOB NOT NULL, tag BLOB NOT NULL, ciphertext BLOB NOT NULL,
        UNIQUE(tenant_id,workspace_id,request_key)) STRICT;
      PRAGMA application_id=1178682197; PRAGMA user_version=1;`);
    const metadata = { id: 'a'.repeat(32), recordId: 'r1', requirementId: 'insurance', name: 'evidence.pdf',
      mediaType: 'application/pdf', size: BYTES.length, sha256: sha(BYTES), createdAt: NOW };
    const nonce = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', VAULT_KEY, nonce);
    cipher.setAAD(Buffer.from(JSON.stringify({ tenantId: 'synthetic-a', workspaceId: 'main', ...metadata })));
    const ciphertext = Buffer.concat([cipher.update(BYTES), cipher.final()]);
    documentDb.prepare('INSERT INTO vault_documents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      metadata.id, 'synthetic-a', 'main', 'r1', 'insurance', 'attachment-1', sha('upload'),
      metadata.name, metadata.mediaType, metadata.size, metadata.sha256, NOW, nonce, cipher.getAuthTag(), ciphertext);
    fs.chmodSync(path.join(stateDir, 'documents.sqlite'), 0o600);
  }
  let closed = false;
  return { db, documentDb, token, close() { if (!closed) { documentDb?.close(); db.close(); closed = true; } } };
}
module.exports = { seed, BACKUP_KEY, VAULT_KEY, NOW, BYTES };
