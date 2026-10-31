import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  chmodSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

function fixture(t, extra = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sanpay-reset-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'deploy'));
  mkdirSync(join(root, 'bin'));
  for (const file of [
    'reset-staging-finance.sh',
    'reset-staging-finance.sql',
    'collect-toman-diagnostics.sh',
    'toman-diagnostics.sql',
  ]) {
    copyFileSync(
      fileURLToPath(new URL(`../${file}`, import.meta.url)),
      join(root, 'deploy', file),
    );
  }
  writeFileSync(join(root, '.env.production'), 'POSTGRES_PASSWORD=test-only\n');
  writeFileSync(join(root, 'compose.production.yml'), 'services: {}\n');
  const log = join(root, 'calls');
  writeFileSync(
    join(root, 'deploy', 'backup-database.sh'),
    '#!/bin/bash\necho backup >> "$TEST_LOG"\nexit "${TEST_BACKUP_FAIL:-0}"\n',
  );
  writeFileSync(join(root, 'bin', 'flock'), '#!/bin/bash\nexit 0\n');
  writeFileSync(
    join(root, 'bin', 'docker'),
    `#!/usr/bin/env node
const fs=require('node:fs');const args=process.argv.slice(2);const input=fs.readFileSync(0,'utf8');
fs.appendFileSync(process.env.TEST_LOG,JSON.stringify({args,input})+'\\n');
if (args.includes('node') && process.env.TEST_LIVE) process.exit(1);
if (input.includes('TRUNCATE TABLE') && process.env.TEST_SQL_FAIL) process.exit(1);
`,
  );
  for (const file of ['docker', 'flock'])
    chmodSync(join(root, 'bin', file), 0o755);
  const env = {
    ...process.env,
    PATH: `${join(root, 'bin')}:${process.env.PATH}`,
    TEST_LOG: log,
    ...extra,
  };
  return {
    root,
    run: (...args) =>
      spawnSync(
        'bash',
        [join(root, 'deploy', 'reset-staging-finance.sh'), ...args],
        { env, encoding: 'utf8' },
      ),
    calls: () => readFileSync(log, 'utf8'),
    collect: (...args) =>
      spawnSync(
        'bash',
        [join(root, 'deploy', 'collect-toman-diagnostics.sh'), ...args],
        { env, encoding: 'utf8' },
      ),
  };
}
const apply = ['--apply', '--confirm-all-data-is-test'];
test('preview is read only and does not stop the API or take a backup', (t) => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  assert.doesNotMatch(f.calls(), /backup|TRUNCATE TABLE|"stop"/);
  assert.match(f.calls(), /BEGIN READ ONLY/);
});
test('live endpoint refusal prevents backup, stop and deletion', (t) => {
  const f = fixture(t, { TEST_LIVE: '1' });
  assert.notEqual(f.run(...apply).status, 0);
  assert.doesNotMatch(f.calls(), /backup|TRUNCATE TABLE|"stop"/);
});
test('failed backup leaves maintenance active and never executes deletion', (t) => {
  const f = fixture(t, { TEST_BACKUP_FAIL: '1' });
  assert.notEqual(f.run(...apply).status, 0);
  assert.doesNotMatch(f.calls(), /TRUNCATE TABLE/);
  assert.ok(existsSync(join(f.root, '.deploy', 'finance-maintenance')));
  assert.ok(
    !existsSync(join(f.root, '.deploy', 'staging-finance-reset.completed')),
  );
});
test('apply stops API before backup, resets only after backup, never restarts, and blocks repeat', (t) => {
  const f = fixture(t);
  const r = f.run(...apply);
  assert.equal(r.status, 0, r.stderr);
  const calls = f.calls();
  assert.ok(calls.indexOf('"stop"') < calls.indexOf('backup'));
  assert.ok(calls.indexOf('backup') < calls.indexOf('TRUNCATE TABLE'));
  assert.doesNotMatch(calls, /"up"|"start"|CASCADE;/);
  assert.ok(
    existsSync(join(f.root, '.deploy', 'staging-finance-reset.completed')),
  );
  assert.notEqual(f.run(...apply).status, 0);
});
test('SQL failure does not mark reset complete or restart API', (t) => {
  const f = fixture(t, { TEST_SQL_FAIL: '1' });
  assert.notEqual(f.run(...apply).status, 0);
  assert.ok(
    !existsSync(join(f.root, '.deploy', 'staging-finance-reset.completed')),
  );
  assert.doesNotMatch(f.calls(), /"up"|"start"/);
});

test('diagnostics bundle persists recent logs without env files and does not mutate services or database', (t) => {
  const f = fixture(t);
  const dir = join(f.root, '.deploy', 'toman-logs');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'toman-2026-10-31.jsonl'),
    '{"system":"toman","event":"test","trackerId":"tracker-example"}\n',
  );
  const result = f.collect('tracker-example');
  assert.equal(result.status, 0, result.stderr);
  const archive = readdirSync(join(f.root, '.deploy', 'diagnostics')).find(
    (name) => name.endsWith('.tar.gz'),
  );
  assert.ok(archive);
  const path = join(f.root, '.deploy', 'diagnostics', archive);
  const contents = spawnSync('tar', ['-tzf', path], { encoding: 'utf8' });
  assert.equal(contents.status, 0, contents.stderr);
  assert.match(contents.stdout, /database.jsonl/);
  assert.match(contents.stdout, /logs\/toman-/);
  assert.doesNotMatch(contents.stdout, /\.env/);
  const log = spawnSync(
    'tar',
    ['-xzOf', path, './logs/toman-2026-10-31.jsonl'],
    { encoding: 'utf8' },
  );
  assert.match(log.stdout, /tracker-example/);
  assert.doesNotMatch(f.calls(), /TRUNCATE TABLE|"stop"|"up"|"start"/);
  assert.match(f.calls(), /REPEATABLE READ READ ONLY/);
  assert.notEqual(f.collect("unsafe';DELETE").status, 0);
});
