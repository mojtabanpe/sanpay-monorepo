import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BookingGuestDto } from '../src/app/tourism/dto/tourism.dto';
import { PrismaService } from '../src/app/prisma/prisma.service';
import { TravelersService } from '../src/app/tourism/travelers.service';

async function withEmployee(
  run: (db: PrismaService, employeeId: string) => Promise<void>,
) {
  assert.ok(
    ['localhost', '127.0.0.1'].includes(
      new URL(process.env.DATABASE_URL || 'http://x').hostname,
    ),
    'Tests require a local database',
  );
  const db = new PrismaService();
  await db.$connect();
  const company = await db.company.create({
    data: { name: `travelers-${randomUUID()}` },
  });
  const employee = await db.employee.create({
    data: {
      companyId: company.id,
      nationalCode: randomUUID(),
      personnelCode: randomUUID(),
      firstName: 'تست',
      lastName: 'مسافر',
      organizationalRank: 'EMPLOYEE',
    },
  });
  try {
    await run(db, employee.id);
  } finally {
    await db.traveler.deleteMany({ where: { employeeId: employee.id } });
    await db.employee.delete({ where: { id: employee.id } });
    await db.company.delete({ where: { id: company.id } });
    await db.$disconnect();
  }
}

test('a flight never overwrites the Persian name; a hotel without English names keeps the earlier ones', () =>
  withEmployee(async (db, employeeId) => {
    const travelers = new TravelersService(db);
    // hotel: Persian name plus the optional English one
    await travelers.remember(employeeId, [
      {
        nationalCode: '3071479204',
        firstName: 'سجاد',
        lastName: 'عزت آبادی پور',
        firstNameEn: 'Sajad',
        lastNameEn: 'Ezzat',
      },
    ]);
    // flight: only the English columns
    await travelers.remember(employeeId, [
      {
        nationalCode: '3071479204',
        firstNameEn: 'Sajjad',
        lastNameEn: 'Ezzatabadipour',
      },
    ]);
    // a later hotel booking without English names
    await travelers.remember(employeeId, [
      {
        nationalCode: '3071479204',
        firstName: 'سجاد',
        lastName: 'عزت‌آبادی‌پور',
      },
    ]);
    const [row] = await travelers.recent(employeeId);
    assert.equal(row.firstName, 'سجاد');
    assert.equal(row.lastName, 'عزت‌آبادی‌پور');
    assert.equal(row.firstNameEn, 'Sajjad');
    assert.equal(row.lastNameEn, 'Ezzatabadipour');
  }));

test('a traveler first seen on a flight has no Persian name until a hotel booking', () =>
  withEmployee(async (db, employeeId) => {
    const travelers = new TravelersService(db);
    await travelers.remember(employeeId, [
      { nationalCode: '0012345678', firstNameEn: 'Ali', lastNameEn: 'Rezaei' },
    ]);
    let [row] = await travelers.recent(employeeId);
    assert.deepEqual(
      [row.firstName, row.lastName, row.firstNameEn],
      ['', '', 'Ali'],
    );
    await travelers.remember(employeeId, [
      { nationalCode: '0012345678', firstName: 'علی', lastName: 'رضایی' },
    ]);
    [row] = await travelers.recent(employeeId);
    assert.deepEqual(
      [row.firstName, row.lastName, row.firstNameEn, row.lastNameEn],
      ['علی', 'رضایی', 'Ali', 'Rezaei'],
    );
  }));

test('an English name typed in the hotel Persian field is saved as the English name only', () =>
  withEmployee(async (db, employeeId) => {
    const travelers = new TravelersService(db);
    await travelers.remember(employeeId, [
      { nationalCode: '0012345678', firstName: 'علی', lastName: 'رضایی' },
    ]);
    await travelers.remember(employeeId, [
      { nationalCode: '0012345678', firstName: 'Ali', lastName: 'Rezaei' },
    ]);
    const [row] = await travelers.recent(employeeId);
    assert.deepEqual(
      [row.firstName, row.lastName, row.firstNameEn, row.lastNameEn],
      ['علی', 'رضایی', 'Ali', 'Rezaei'],
    );
  }));

test('hotel guest English names are optional and must be Latin', async () => {
  const base = {
    firstName: 'سجاد',
    lastName: 'عزت',
    nationalCode: '3071479204',
    mobile: '09120000001',
    birthdate: '1990-01-01',
  };
  const errors = async (extra: object) =>
    (
      await validate(plainToInstance(BookingGuestDto, { ...base, ...extra }))
    ).map((e) => e.property);
  assert.deepEqual(await errors({}), []);
  assert.deepEqual(
    await errors({ firstNameEn: 'Sajad', lastNameEn: "O'Neil-Smith" }),
    [],
  );
  assert.deepEqual(await errors({ firstNameEn: 'سجاد' }), ['firstNameEn']);
  // the Persian name fields never take English, digits or mixed scripts
  assert.deepEqual(await errors({ firstName: 'Sajad' }), ['firstName']);
  assert.deepEqual(await errors({ lastName: 'Ezzat' }), ['lastName']);
  assert.deepEqual(await errors({ firstName: 'سجاد2' }), ['firstName']);
  assert.deepEqual(await errors({ lastName: 'عزت‌آبادی پور' }), []);
});
