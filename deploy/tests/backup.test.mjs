import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
  chmodSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const source = fileURLToPath(new URL('../', import.meta.url));

function fixture(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sanpay-backup-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'deploy'));
  mkdirSync(join(root, 'bin'));
  for (const name of ['deploy.sh', 'backup-database.sh']) {
    copyFileSync(join(source, name), join(root, 'deploy', name));
    chmodSync(join(root, 'deploy', name), 0o755);
  }
  writeFileSync(
    join(root, '.env.production'),
    'POSTGRES_USER=test\nPOSTGRES_DB=test\nPOSTGRES_PASSWORD=test-only\n',
  );
  writeFileSync(join(root, 'compose.production.yml'), 'services: {}\n');
  writeFileSync(
    join(root, 'bin', 'docker'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.TEST_DOCKER_LOG, JSON.stringify(args)+'\\n');
const command = args.join(' ');
if (args[0] === 'inspect') { console.log(process.env.TEST_DB_STATE === 'stopped' ? 'false' : 'true'); }
else if (command.includes('ps --all --quiet postgres')) { if (process.env.TEST_DB_STATE !== 'missing') console.log('test-postgres'); }
else if (command.includes('pg_isready')) { process.exit(process.env.TEST_READY_FAIL ? 1 : 0); }
else if (command.includes('pg_dump --format=custom')) {
  if (!process.env.TEST_EMPTY_DUMP) process.stdout.write('test archive');
  if (process.env.TEST_DUMP_FAIL) process.exit(1);
}
else if (command.includes('pg_restore')) { fs.readFileSync(0); if (process.env.TEST_RESTORE_FAIL) process.exit(1); }
else if (args.at(-1) === 'build' && process.env.TEST_BUILD_FAIL) process.exit(1);
`,
  );
  chmodSync(join(root, 'bin', 'docker'), 0o755);
  writeFileSync(join(root, 'bin', 'sleep'), '#!/bin/sh\nexit 0\n');
  chmodSync(join(root, 'bin', 'sleep'), 0o755);
  writeFileSync(
    join(root, 'bin', 'date'),
    '#!/bin/sh\nprintf "20261029T000000Z\\n"\n',
  );
  chmodSync(join(root, 'bin', 'date'), 0o755);
  const log = join(root, 'calls.jsonl');
  const env = {
    ...process.env,
    PATH: `${join(root, 'bin')}:${process.env.PATH}`,
    TEST_DOCKER_LOG: log,
    SANPAY_BACKUP_DIR: join(root, '.deploy', 'backups'),
    TEST_DB_STATE: 'running',
    ...options,
  };
  return {
    root,
    run: (script = 'deploy.sh') =>
      spawnSync('bash', [join(root, 'deploy', script)], {
        env,
        encoding: 'utf8',
      }),
    calls: () =>
      readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    files: () => {
      try {
        return readdirSync(env.SANPAY_BACKUP_DIR);
      } catch {
        return [];
      }
    },
    backupDir: env.SANPAY_BACKUP_DIR,
  };
}

const isDeployUp = (args) => args.includes('--remove-orphans');
const isDump = (args) => args.join(' ').includes('pg_dump --format=custom');
const isRestore = (args) => args.includes('pg_restore');

test('deployment verifies a private archive before replacing application containers', (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const calls = f.calls();
  assert.ok(
    calls.findIndex(isDump) >
      calls.findIndex((args) => args.at(-1) === 'build'),
  );
  assert.ok(calls.findIndex(isRestore) > calls.findIndex(isDump));
  assert.ok(calls.findIndex(isDeployUp) > calls.findIndex(isRestore));
  assert.equal(
    calls.some((args) => args.includes('start')),
    false,
  );
  assert.equal(f.files().length, 1);
  assert.match(f.files()[0], /^database-\d{8}T\d{6}Z-before-.*\.dump$/);
  assert.equal(statSync(f.backupDir).mode & 0o777, 0o700);
  assert.equal(statSync(join(f.backupDir, f.files()[0])).mode & 0o777, 0o600);
});

for (const [name, options] of [
  ['failed dump', { TEST_DUMP_FAIL: '1' }],
  ['empty dump', { TEST_EMPTY_DUMP: '1' }],
  ['corrupt archive', { TEST_RESTORE_FAIL: '1' }],
  ['unavailable database', { TEST_READY_FAIL: '1' }],
]) {
  test(`${name} blocks deployment and leaves no incomplete backup`, (t) => {
    const f = fixture(t, options);
    assert.notEqual(f.run().status, 0);
    assert.equal(f.calls().some(isDeployUp), false);
    assert.deepEqual(f.files(), []);
  });
}

test('a build failure never replaces containers or attempts a backup', (t) => {
  const f = fixture(t, { TEST_BUILD_FAIL: '1' });
  assert.notEqual(f.run().status, 0);
  assert.equal(f.calls().some(isDump), false);
  assert.equal(f.calls().some(isDeployUp), false);
});

test('a stopped PostgreSQL container is started without being recreated', (t) => {
  const f = fixture(t, { TEST_DB_STATE: 'stopped' });
  assert.equal(f.run('backup-database.sh').status, 0);
  assert.equal(
    f.calls().some((args) => args.slice(-2).join(' ') === 'start postgres'),
    true,
  );
  assert.equal(
    f.calls().some((args) => args.includes('up')),
    false,
  );
});

test('first installation starts only PostgreSQL before creating its initial backup', (t) => {
  const f = fixture(t, { TEST_DB_STATE: 'missing' });
  assert.equal(f.run('backup-database.sh').status, 0);
  const startup = f.calls().find((args) => args.includes('up'));
  assert.deepEqual(startup.slice(-4), ['up', '-d', '--no-deps', 'postgres']);
});

test('two backups taken in the same second never overwrite one another', (t) => {
  const f = fixture(t);
  assert.equal(f.run('backup-database.sh').status, 0);
  assert.equal(f.run('backup-database.sh').status, 0);
  assert.equal(f.files().length, 2);
  assert.notEqual(f.files()[0], f.files()[1]);
});
