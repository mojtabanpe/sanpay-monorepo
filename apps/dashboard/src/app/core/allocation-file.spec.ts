import { parseAllocationFile } from './allocation-file';

describe('parseAllocationFile', () => {
  it('parses Persian organizational ranks from a CSV with headers', async () => {
    const result = await parseCsv(
      'کد ملی,رده سازمانی,سقف اعتبار,تاریخ انقضا\n' +
        '0012345678,مدیر,"10,000,000",۱۴۰۵/۰۶/۳۱\n' +
        '0098765432,معاون,8000000,۱۴۰۵/۰۶/۳۱',
    );

    expect(result.errors).toEqual([]);
    expect(result.entries).toMatchObject([
      {
        nationalCode: '0012345678',
        organizationalRank: 'MANAGER',
        cap: 10_000_000,
      },
      {
        nationalCode: '0098765432',
        organizationalRank: 'DEPUTY',
        cap: 8_000_000,
      },
    ]);
  });

  it('accepts English rank codes and the default four-column order', async () => {
    const result = await parseCsv(
      '0012345678,HEAD,6000000,1405-06-31\n' +
        '0098765432,employee,4000000,1405-06-31',
    );

    expect(result.errors).toEqual([]);
    expect(result.entries.map((entry) => entry.organizationalRank)).toEqual([
      'HEAD',
      'EMPLOYEE',
    ]);
  });

  it('rejects a header-based file when the rank column is missing', async () => {
    const result = await parseCsv(
      'کد ملی,سقف اعتبار,تاریخ انقضا\n0012345678,6000000,۱۴۰۵/۰۶/۳۱',
    );

    expect(result.entries).toEqual([]);
    expect(result.errors[0]).toContain('رده سازمانی');
  });

  it('rejects rows with an unknown organizational rank', async () => {
    const result = await parseCsv(
      'کد ملی,رده سازمانی,سقف اعتبار,تاریخ انقضا\n' +
        '0012345678,سرپرست,6000000,۱۴۰۵/۰۶/۳۱',
    );

    expect(result.entries).toEqual([]);
    expect(result.errors[0]).toContain('رده سازمانی نامعتبر');
  });
});

function parseCsv(content: string) {
  return parseAllocationFile(
    {
      name: 'allocations.csv',
      text: async () => content,
    } as File,
  );
}
