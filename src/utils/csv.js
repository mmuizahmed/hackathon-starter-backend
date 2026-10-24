function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes && char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

export function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

// Returns { headers, records }. records include the file row number (header is row 1).
export function parseCsv(text) {
  const lines = String(text)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');

  if (lines.length === 0) {
    return { headers: [], records: [] };
  }

  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase().replace(/[\s_]/g, ''));
  const records = lines.slice(1).map((line, index) => ({
    row: index + 2,
    cells: splitCsvLine(line),
  }));
  return { headers, records };
}
