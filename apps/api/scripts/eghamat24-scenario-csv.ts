/** Excel CSV import infers numeric IDs; literal text formulas preserve every digit. */
export function scenariosTextCsv(rows: Record<string, string>[]): string {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value: string) => {
    const literal = `="${value.replace(/"/g, '""')}"`;
    return `"${literal.replace(/"/g, '""')}"`;
  };
  return (
    '\uFEFF' +
    [
      columns,
      ...rows.map((row) => columns.map((column) => String(row[column] ?? ''))),
    ]
      .map((row) => row.map(cell).join(','))
      .join('\r\n') +
    '\r\n'
  );
}
