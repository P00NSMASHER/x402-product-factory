'use strict';
const { captureRecovery, verifyRecovery, listRecovery } = require('./recovery');
const SAFE = new Set(['RECOVERY_INTEGRITY', 'DOCUMENT_INTEGRITY', 'VAULT_KEY_REQUIRED', 'RECOVERY_LIMIT',
  'RECOVERY_BUSY', 'SCHEMA_UNSUPPORTED', 'STATE_PATH_UNSAFE', 'STATE_MISSING', 'SNAPSHOT_INVALID', 'RECOVERY_REFERENCE', 'RECOVERY_CLOCK']);
function createRecoverySupervisor({ intervalMs = 6 * 3600000, pollMs = 30000, clock = Date.now, onStatus = () => {}, ...options } = {}) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 60000 || intervalMs > 7 * 86400000 ||
      !Number.isSafeInteger(pollMs) || pollMs < 10 || pollMs > 60000 || typeof clock !== 'function' || typeof onStatus !== 'function' || !Buffer.isBuffer(options.key) || options.key.length !== 32) throw new Error('RECOVERY_CONFIG_INVALID');
  options = { ...options, key: Buffer.from(options.key), vaultKey: options.vaultKey ? Buffer.from(options.vaultKey) : undefined };
  let lastEmitted = '';
  let stopped = false, timer, initialized = false, lastClock = 0;
  const state = { running: false, verified: false, createdAt: null, lastVerifiedAt: null, lastError: null, failures: 0, nextAttemptAt: 0 };
  function status() { return { ...state }; }
  function tick() {
    if (stopped) return status();
    try {
      const time = clock();
      if (!Number.isSafeInteger(time) || time < lastClock) throw new Error('RECOVERY_CLOCK');
      lastClock = time;
      if (time < state.nextAttemptAt) return status();
      if (!initialized) {
        const latest = listRecovery(options).at(-1);
        if (latest) {
          const info = verifyRecovery({ filename: latest, key: options.key, vaultKey: options.vaultKey });
          if (info.createdAt > time) throw new Error('RECOVERY_CLOCK');
          state.createdAt = info.createdAt; state.lastVerifiedAt = time; state.verified = true;
        }
        initialized = true;
      }
      if (state.createdAt === null || time >= state.createdAt + intervalMs) {
        const info = captureRecovery({ ...options, clock: () => time });
        state.createdAt = info.createdAt; state.lastVerifiedAt = time; state.verified = true;
      }
      state.lastError = null; state.failures = 0; state.nextAttemptAt = state.createdAt + intervalMs;
    } catch (error) {
      state.lastError = SAFE.has(error.message) ? error.message : 'RECOVERY_FAILED'; state.verified = false;
      state.failures++; state.nextAttemptAt = lastClock + Math.min(3600000, 60000 * 2 ** Math.min(state.failures - 1, 6));
    }
    const result = status(), encoded = JSON.stringify(result);
    if (encoded !== lastEmitted) { lastEmitted = encoded; try { onStatus(result); } catch { /* Reporting cannot authorize or change work. */ } }
    return result;
  }
  function poll() { if (stopped) return; tick(); if (!stopped) timer = setTimeout(poll, pollMs); }
  return Object.freeze({ tick, status,
    start() { if (stopped || state.running) return; state.running = true; timer = setTimeout(poll, 0); },
    stop() { stopped = true; state.running = false; if (timer) clearTimeout(timer); options.key.fill(0); options.vaultKey?.fill(0); }
  });
}
function recoveryFromEnvironment({ stateDir, env = process.env, onStatus = () => {} } = {}) {
  const keyText = env.FACTORY_BACKUP_KEY_HEX, backupDir = env.FACTORY_BACKUP_DIR;
  if (!keyText && !backupDir) return null;
  if (!keyText || !backupDir || !/^[0-9a-fA-F]{64}$/.test(keyText)) throw new Error('RECOVERY_CONFIG_INVALID');
  const vaultText = env.FACTORY_VAULT_KEY_HEX;
  if (vaultText && !/^[0-9a-fA-F]{64}$/.test(vaultText)) throw new Error('RECOVERY_CONFIG_INVALID');
  const key = Buffer.from(keyText, 'hex'), vaultKey = vaultText ? Buffer.from(vaultText, 'hex') : undefined;
  try { return createRecoverySupervisor({ stateDir, backupDir, key, vaultKey, onStatus }); }
  finally { key.fill(0); vaultKey?.fill(0); }
}
module.exports = { createRecoverySupervisor, recoveryFromEnvironment };
