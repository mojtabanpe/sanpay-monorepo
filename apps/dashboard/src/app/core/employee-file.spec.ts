import { parseEmployeeFile } from './employee-file';

describe('parseEmployeeFile', () => {
  it('parses employees with Persian digits and ranks', async () => {
    const result = await parse(
      'کد ملی,کد پرسنلی,نام,نام خانوادگی,موبایل,رده سازمانی\n' +
        '۰۰۱۲۳۴۵۶۷۸,۱۲۳,علی,رضایی,۰۹۱۲۳۴۵۶۷۸۹,مدیر',
    );
    expect(result.errors).toEqual([]);
    expect(result.entries[0]).toMatchObject({
      rowNumber: 2,
      nationalCode: '0012345678',
      phone: '09123456789',
      organizationalRank: 'MANAGER',
    });
  });

  it('reports invalid phone and rank rows', async () => {
    const result = await parse(
      'کد ملی,کد پرسنلی,نام,نام خانوادگی,موبایل,رده سازمانی\n' +
        '0012345678,123,علی,رضایی,02112345678,سرپرست',
    );
    expect(result.entries).toEqual([]);
    expect(result.errors[0]).toContain('موبایل');
  });
});

function parse(content: string) {
  return parseEmployeeFile({
    name: 'employees.csv',
    text: async () => content,
  } as File);
}
