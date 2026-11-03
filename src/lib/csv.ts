/** Minimal RFC 4180 CSV parser / serializer (quotes, escaped quotes, embedded newlines). */

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0] !== '');
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

/** Column names of a CSV text (first line), or null if empty. */
export function csvHeader(text: string | null): string[] | null {
  if (!text || !text.trim()) return null;
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? undefined : text.indexOf('\n')).replace(/\r$/, '');
  return firstLine.split(',').map((h) => h.replace(/^"|"$/g, ''));
}

function cell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsvLine(values: string[]): string {
  return values.map(cell).join(',');
}

/** Append rows to an existing CSV text (or create it with the header). */
export function appendCsv(existing: string | null, header: string[], rows: string[][]): string {
  let base = existing && existing.trim() ? existing : toCsvLine(header) + '\n';
  if (!base.endsWith('\n')) base += '\n';
  return base + rows.map((r) => toCsvLine(r) + '\n').join('');
}
