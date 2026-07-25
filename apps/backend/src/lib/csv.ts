/** Sérialisation CSV minimale, robuste à l'échappement (RFC 4180). */
export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: string[]): string {
  const escape = (value: unknown): string => {
    const s = value === null || value === undefined ? '' : String(value);
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = columns.map(escape).join(',');
  const lines = rows.map((row) => columns.map((c) => escape(row[c])).join(','));
  return [header, ...lines].join('\r\n');
}
