/**
 * Serialises rows to RFC-4180 CSV. A cell is quoted only when it has to be —
 * it contains a comma, a quote, or a newline — and embedded quotes double.
 * Leading `=`, `+`, `-` and `@` are prefixed with a single quote so a
 * spreadsheet treats a project called "=cmd" as text rather than a formula.
 */
export function toCsv(rows: readonly (readonly string[])[]): string {
  const cell = (raw: string): string => {
    const value = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  };
  // Trailing newline: POSIX tools and Excel both expect the final row to end.
  return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

/**
 * Minimal quoted-CSV parser for the file viewer (ported from the prototype's
 * parseCsv): handles quoted cells, escaped quotes ("") and skips empty lines.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line === '') continue;
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line.charAt(i);
      if (quoted) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            quoted = false;
          }
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ',') {
        cells.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current);
    rows.push(cells);
  }
  return rows;
}
