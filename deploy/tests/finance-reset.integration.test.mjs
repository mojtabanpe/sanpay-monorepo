import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

test(
  'PostgreSQL: financial reset respects real schema, restores balances and rolls back on failure',
  { skip: process.env.SANPAY_TEST_DOCKER !== '1', timeout: 120000 },
  (t) => {
    const name = `sanpay-finance-reset-test-${randomUUID()}`;
    const run = (cmd, args, input, check = true) => {
      const r = spawnSync(cmd, args, {
        input,
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
      });
      if (check) assert.equal(r.status, 0, r.stderr);
      return r;
    };
    run('docker', [
      'run',
      '-d',
      '--name',
      name,
      '--tmpfs',
      '/var/lib/postgresql/data',
      '-e',
      'POSTGRES_PASSWORD=isolated-test-only',
      'postgres:17-alpine',
    ]);
    t.after(() => run('docker', ['rm', '-f', name], undefined, false));
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (
        run(
          'docker',
          ['exec', name, 'pg_isready', '-U', 'postgres'],
          undefined,
          false,
        ).status === 0
      ) {
        ready = true;
        break;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
    assert.ok(ready);
    const psql = (sql, check = true, extra = []) =>
      run(
        'docker',
        [
          'exec',
          '-i',
          name,
          'psql',
          '-X',
          '-qAt',
          '-U',
          'postgres',
          '-v',
          'ON_ERROR_STOP=1',
          ...extra,
        ],
        sql,
        check,
      );
    const schema = run('pnpm', [
      'exec',
      'prisma',
      'migrate',
      'diff',
      '--from-empty',
      '--to-schema',
      'apps/api/prisma/schema.prisma',
      '--script',
    ]).stdout;
    psql(schema);
    psql(`
INSERT INTO "Company" (id,name,"updatedAt") VALUES ('c','test',now());
INSERT INTO "Employee" (id,"nationalCode","personnelCode","firstName","lastName","companyId","organizationalRank","updatedAt") VALUES ('e','test','test','test','test','c','EMPLOYEE',now());
INSERT INTO "WalletDefinition" (id,"companyId",name,kind,"updatedAt") VALUES ('credit','c','credit','CREDIT',now()),('personal','c','personal','PERSONAL',now());
INSERT INTO "WalletAllocation" (id,"employeeId","definitionId",cap,spent,"expiresAt","updatedAt") VALUES ('credit-a','e','credit',1000,300,now()+interval '1 year',now()),('personal-a','e','personal',500,200,now()+interval '1 year',now());
INSERT INTO "Store" (id,name,code,username,"passwordHash","updatedAt") VALUES ('s','store','code','username','hash',now());
INSERT INTO "SettlementBatch" (id,"runKey","updatedAt") VALUES ('b','test-run',now());
INSERT INTO "SettlementItem" (id,"batchId","beneficiaryType","beneficiaryKey","beneficiaryName","destinationIban",amount,"trackerId","updatedAt") VALUES ('item','b','STORE','s','test','IR000',300,'transfer-tracker',now());
INSERT INTO "PaymentIntent" (id,"employeeId",purpose,"targetId",title,amount,"allowedAllocationIds","expiresAt","updatedAt") VALUES ('intent','e','STORE','s','test',300,'{}',now(),now());
INSERT INTO "Payment" (id,"receiptNo","employeeId","storeId",amount,"settlementItemId","intentId") VALUES ('payment','receipt','e','s',300,'item','intent');
INSERT INTO "GatewayPayment" (id,"intentId","employeeId",gateway,"trackerId",amount,"updatedAt") VALUES ('gp','intent','e','toman','gateway-tracker',300,now());
INSERT INTO "GatewayRefund" (id,"gatewayPaymentId","employeeId",gateway,"trackerId",amount,"updatedAt") VALUES ('gr','gp','e','toman','refund-tracker',100,now());
INSERT INTO "Transaction" (id,"employeeId","allocationId",amount,"paymentId","intentId","gatewayPaymentId","gatewayRefundId") VALUES ('tx','e','credit-a',300,'payment','intent','gp','gr');
`);
    const snapshot = readFileSync(
      new URL('../toman-diagnostics.sql', import.meta.url),
      'utf8',
    );
    for (const target of ['', 'gp', 'gateway-tracker', 'b']) {
      const output = psql(snapshot, true, ['-v', `target=${target}`]).stdout;
      for (const line of output
        .split('\n')
        .filter((line) => line.startsWith('{')))
        JSON.parse(line);
      assert.match(
        output,
        target === 'b' ? /transfer-tracker/ : /gateway-tracker/,
      );
      assert.doesNotMatch(output, /passwordHash|destinationIban/);
    }
    const reset = readFileSync(
      new URL('../reset-staging-finance.sql', import.meta.url),
      'utf8',
    );
    psql(`CREATE FUNCTION reject_reset() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$;
CREATE TRIGGER reject_reset BEFORE UPDATE ON "WalletAllocation" FOR EACH ROW EXECUTE FUNCTION reject_reset();`);
    assert.notEqual(psql(reset, false).status, 0);
    assert.equal(
      psql('SELECT count(*) FROM "GatewayPayment";').stdout.trim(),
      '1',
    );
    assert.equal(
      psql(
        'SELECT spent FROM "WalletAllocation" WHERE id=\'credit-a\';',
      ).stdout.trim(),
      '300',
    );
    psql('DROP TRIGGER reject_reset ON "WalletAllocation";');
    psql(reset);
    assert.equal(
      psql(
        'SELECT cap,spent FROM "WalletAllocation" ORDER BY id;',
      ).stdout.trim(),
      '1000|0\n0|0',
    );
    for (const table of [
      'Transaction',
      'Payment',
      'PaymentIntent',
      'GatewayPayment',
      'GatewayRefund',
      'SettlementBatch',
      'SettlementItem',
    ])
      assert.equal(psql(`SELECT count(*) FROM "${table}";`).stdout.trim(), '0');
    for (const table of ['Company', 'Employee', 'Store'])
      assert.equal(psql(`SELECT count(*) FROM "${table}";`).stdout.trim(), '1');
  },
);
