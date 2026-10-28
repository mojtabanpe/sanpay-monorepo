import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  chmodSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

// Opt-in: this creates and removes only its own isolated, tmpfs-backed container.
test(
  'PostgreSQL: a real pre-deploy archive restores successfully into a separate database',
  {
    skip: process.env.SANPAY_TEST_DOCKER !== '1',
    timeout: 120_000,
  },
  (t) => {
    const root = mkdtempSync(join(tmpdir(), 'sanpay-backup-integration-'));
    const name = `sanpay-backup-test-${randomUUID()}`;
    const env = {
      ...process.env,
      SANPAY_BACKUP_DIR: join(root, '.deploy', 'backups'),
    };
    mkdirSync(join(root, 'deploy'));
    const script = join(root, 'deploy', 'backup-database.sh');
    copyFileSync(
      fileURLToPath(new URL('../backup-database.sh', import.meta.url)),
      script,
    );
    chmodSync(script, 0o755);
    writeFileSync(
      join(root, '.env.production'),
      'POSTGRES_PASSWORD=backup-test-only\n',
    );
    const composeFile = join(root, 'compose.production.yml');
    writeFileSync(
      composeFile,
      `name: ${name}
services:
  postgres:
    image: postgres:17-alpine
    container_name: ${name}
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: backup-test-only
      POSTGRES_DB: backup_source
    tmpfs:
      - /var/lib/postgresql/data
`,
    );
    const composeArgs = [
      'compose',
      '--env-file',
      join(root, '.env.production'),
      '-f',
      composeFile,
    ];
    function compose(args, input) {
      const result = spawnSync('docker', [...composeArgs, ...args], {
        input,
        encoding: 'utf8',
        env,
      });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    }
    t.after(() => {
      // This exact container was created here solely for this test and has no persistent volume.
      spawnSync('docker', ['rm', '-f', name], { encoding: 'utf8' });
      rmSync(root, { recursive: true, force: true });
    });
    const initial = spawnSync('bash', [script], { encoding: 'utf8', env });
    assert.equal(initial.status, 0, initial.stderr);
    const firstFiles = readdirSync(env.SANPAY_BACKUP_DIR);
    compose([
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'postgres',
      '-d',
      'backup_source',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      "CREATE TABLE backup_probe (id integer PRIMARY KEY, value text NOT NULL); INSERT INTO backup_probe VALUES (1, 'backup sentinel');",
    ]);
    const backup = spawnSync('bash', [script], { encoding: 'utf8', env });
    assert.equal(backup.status, 0, backup.stderr);
    const archive = readdirSync(env.SANPAY_BACKUP_DIR).find(
      (file) => !firstFiles.includes(file),
    );
    assert.ok(archive);
    compose([
      'exec',
      '-T',
      'postgres',
      'createdb',
      '-U',
      'postgres',
      'backup_restored',
    ]);
    compose(
      [
        'exec',
        '-T',
        'postgres',
        'pg_restore',
        '--exit-on-error',
        '--no-owner',
        '--no-acl',
        '-U',
        'postgres',
        '-d',
        'backup_restored',
      ],
      readFileSync(join(env.SANPAY_BACKUP_DIR, archive)),
    );
    const restored = compose([
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'postgres',
      '-d',
      'backup_restored',
      '-At',
      '-c',
      'SELECT value FROM backup_probe WHERE id = 1',
    ]);
    assert.equal(restored, 'backup sentinel');
  },
);
