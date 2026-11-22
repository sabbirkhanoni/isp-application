/**
 * Minimal CSV writer for spreadsheet users.
 * - UTF-8 BOM so Excel shows Bangla text correctly.
 * - Cells starting with = + - @ are prefixed with ' so a name or note can never run as a formula.
 */
const BOM = String.fromCharCode(0xfeff);

function cell(value: string | number | null): string {
  let text = value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text) && typeof value === 'string') text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: Array<Array<string | number | null>>): string {
  const lines = [header, ...rows].map((row) => row.map(cell).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
