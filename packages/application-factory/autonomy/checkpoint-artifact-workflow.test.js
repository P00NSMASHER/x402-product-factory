'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');

const workflow = fs.readFileSync(
  path.join(__dirname, '../../../.github/workflows/factory-autonomy-ci.yml'), 'utf8'
);
const begin = '      - name: Restore prior successful same-branch checkpoint if available\n';
const end = '      - name: Manufacture one independent synthetic edition per cycle\n';
const a = workflow.indexOf(begin), b = workflow.indexOf(end, a);
assert.ok(a >= 0 && b > a, 'missing authentic workflow restore step');
const step = workflow.slice(a + begin.length, b);
assert.ok(step.startsWith('        env:\n'), 'unexpected restore step layout');
const marker = '        run: |\n';
assert.ok(step.includes(marker), 'missing embedded bash');
const command = step.slice(step.indexOf(marker) + marker.length)
  .split('\n').filter(line => line.trim()).map(line => {
    assert.ok(line.startsWith('          '), 'unexpected bash indentation');
    return line.slice(10);
  }).join('\n') + '\n';

function execute({artifact = false, apiFails = false, successful = true} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-checkpoint-artifact-'));
  const mock = '#!/usr/bin/env bash\nset -euo pipefail\n' +
    'if [[ "$1" == run && "$2" == list ]]; then\n' +
    '  if [[ "$MOCK_SUCCESSFUL" == 1 ]]; then printf "123\\n"; fi\n' +
    'elif [[ "$1" == api ]]; then\n' +
    '  if [[ "$MOCK_API_FAILS" == 1 ]]; then exit 19; fi\n' +
    '  if [[ "$MOCK_ARTIFACT" == 1 ]]; then printf "autonomous-apps-123\\n"; fi\n' +
    'elif [[ "$1" == run && "$2" == download ]]; then\n' +
    '  [[ " $* " == *" --name autonomous-apps-123 "* ]] || exit 17\n' +
    '  mkdir -p "$RUNNER_TEMP/previous-autonomy"\n' +
    '  printf "synthetic proof" > "$RUNNER_TEMP/previous-autonomy/checkpoint.json"\n' +
    'else exit 12; fi\n';
  fs.writeFileSync(path.join(dir, 'gh'), mock, {mode: 0o700});
  fs.writeFileSync(path.join(dir, 'node'),
    '#!/usr/bin/env bash\nset -euo pipefail\nprintf "%s\\n" "$*" >> "$MOCK_NODE_CALLS"\n',
    {mode: 0o700});
  const env = {...process.env, PATH: dir + ':' + process.env.PATH,
    GITHUB_REPOSITORY: 'owner/test', TARGET_BRANCH: 'private-candidate',
    GITHUB_ENV: path.join(dir, 'github-env'),
    RUNNER_TEMP: dir, MOCK_NODE_CALLS: path.join(dir, 'nodes'),
    MOCK_SUCCESSFUL: successful ? '1' : '0',
    MOCK_ARTIFACT: artifact ? '1' : '0',
    MOCK_API_FAILS: apiFails ? '1' : '0'};
  try {
    const result = spawnSync('bash', ['-c', command], {env, encoding: 'utf8'});
    return {status: result.status, stdout: result.stdout, stderr: result.stderr,
      state: fs.existsSync(env.GITHUB_ENV) ? fs.readFileSync(env.GITHUB_ENV, 'utf8') : '',
      nodeCalls: fs.existsSync(env.MOCK_NODE_CALLS) ? fs.readFileSync(env.MOCK_NODE_CALLS, 'utf8') : '',
      hadDownload: fs.existsSync(path.join(dir, 'previous-autonomy', 'checkpoint.json'))};
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

test('expired or missing historic artifacts never masquerade as restored', () => {
  const r = execute();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /older work was NOT restored/);
  assert.match(r.state, /PRIVATE_CHECKPOINT_RECOVERY=HISTORICAL_UNVERIFIED/);
  assert.equal(r.hadDownload, false);
  assert.equal(r.nodeCalls, '');
});

test('exact unexpired artifact permits both existing fail-closed restorers', () => {
  const r = execute({artifact: true});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.state, /PRIVATE_CHECKPOINT_RECOVERY=RESTORED_EXACT_ARTIFACT/);
  assert.equal(r.hadDownload, true);
  assert.match(r.nodeCalls, /restore-autonomous-checkpoint\.js/);
  assert.match(r.nodeCalls, /restore-cross-family-checkpoint\.js/);
});

test('GitHub artifact API errors fail rather than silently starting clean', () => {
  const r = execute({apiFails: true});
  assert.notEqual(r.status, 0);
  assert.equal(r.state, '');
  assert.equal(r.nodeCalls, '');
});

test('first run is distinguished from expired historic continuity', () => {
  const r = execute({successful: false});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.state, /PRIVATE_CHECKPOINT_RECOVERY=FIRST_RUN/);
  assert.equal(r.nodeCalls, '');
});
