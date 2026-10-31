import { parseAllocationFile } from './allocation-file';

describe('parseAllocationFile', () => {
  it('parses a three-column CSV with Persian headers', async () => {
    const result = await parseCsv(
      'کد ملی,مبلغ شارژ (ریال),تاریخ انقضا\n' +
        '0012345678,"10,000,000",۱۴۰۵/۰۶/۳۱\n' +
        '0098765432,8000000,۱۴۰۵/۰۶/۳۱',
    );

    expect(result.errors).toEqual([]);
    expect(result.entries).toEqual([
      { nationalCode: '0012345678', cap: 1_000_000, expiresAt: '2026-09-22' },
      { nationalCode: '0098765432', cap: 800_000, expiresAt: '2026-09-22' },
    ]);
  });

  it('rejects zero or fractional toman charges', async () => {
    const result = await parseCsv(
      'کد ملی,مبلغ شارژ (ریال),تاریخ انقضا\n' +
        '0012345678,500,۱۴۰۵/۰۶/۳۱\n' +
        '0098765432,0,۱۴۰۵/۰۶/۳۱\n' +
        '0011223344,15,۱۴۰۵/۰۶/۳۱',
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].cap).toBe(50);
    expect(result.errors).toHaveLength(2);
  });

  it('reads the default column order without headers', async () => {
    const result = await parseCsv(
      '0012345678,6000000,1405-06-31\n0098765432,4000000,1405-06-31',
    );

    expect(result.errors).toEqual([]);
    expect(result.entries.map((entry) => entry.cap)).toEqual([
      600_000, 400_000,
    ]);
  });

  it('ignores the rank column of an old file that has headers', async () => {
    const result = await parseCsv(
      'کد ملی,رده سازمانی,سقف اعتبار,تاریخ انقضا\n' +
        '0012345678,مدیر,6000000,۱۴۰۵/۰۶/۳۱',
    );

    expect(result.errors).toEqual([]);
    expect(result.entries).toEqual([
      { nationalCode: '0012345678', cap: 600_000, expiresAt: '2026-09-22' },
    ]);
  });

  it('rejects an old four-column file without headers instead of misreading it', async () => {
    const result = await parseCsv('0012345678,مدیر,6000000,1405/06/31');

    expect(result.entries).toEqual([]);
    expect(result.errors[0]).toContain('سه ستون');
  });

  it('tolerates empty trailing cells in a header-less file', async () => {
    const result = await parseCsv('0012345678,6000000,1405/06/31,,');

    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(1);
  });

  it('rejects a header-based file when the amount column is missing', async () => {
    const result = await parseCsv('کد ملی,تاریخ انقضا\n0012345678,۱۴۰۵/۰۶/۳۱');

    expect(result.entries).toEqual([]);
    expect(result.errors[0]).toContain('مبلغ شارژ');
  });
});

function parseCsv(content: string) {
  return parseAllocationFile({
    name: 'allocations.csv',
    text: async () => content,
  } as File);
}
