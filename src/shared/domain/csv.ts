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
 * RFC-4180 parser: quoted cells, doubled quotes inside them, CRLF or LF line
 * endings, and — the part a line-by-line splitter cannot do — newlines
 * *inside* a quoted cell. `toCsv` emits those whenever a note runs to two
 * lines, so without this `parseCsv(toCsv(x))` did not round-trip its own
 * output. Wholly empty lines are skipped, which is what the file viewer wants
 * from a trailing newline.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cells: string[] = [];
  let current = '';
  let quoted = false;

  const endCell = (): void => {
    cells.push(current);
    current = '';
  };
  const endRow = (): void => {
    endCell();
    // A blank line is one empty cell; a row of real empties is not blank.
    if (!(cells.length === 1 && cells[0] === '')) rows.push(cells);
    cells = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (quoted) {
      if (ch !== '"') {
        current += ch;
      } else if (text.charAt(i + 1) === '"') {
        current += '"';
        i++;
      } else {
        quoted = false;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') endCell();
    else if (ch === '\n') endRow();
    else if (ch === '\r') {
      // Swallow CRLF as one terminator; a lone CR also ends the row.
      if (text.charAt(i + 1) === '\n') i++;
      endRow();
    } else current += ch;
  }
  // No trailing newline: the last row is still a row.
  if (current !== '' || cells.length > 0) endRow();
  return rows;
}

/**
 * Undoes `toCsv`'s formula guard. That guard prefixes a leading `=`, `+`, `-`
 * or `@` with an apostrophe so a spreadsheet treats the cell as text; reading
 * a file back has to strip it again, or every international phone number
 * imports as `'+1 555…`.
 */
export function unguardCsvCell(value: string): string {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}
