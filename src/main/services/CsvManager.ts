import * as fs from 'fs';

/**
 * CSV manager for import/export of host lists
 * Ported from: Services/CsvManager.cs
 */
export class CsvManager {
  static readonly HOST_COLUMN_NAME = 'Host_IP';

  /**
   * Load hosts from a CSV file
   */
  loadFromFile(filePath: string): { columns: string[]; rows: Record<string, string>[] } {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).filter((line) => line.trim());

    if (lines.length === 0) {
      return { columns: [CsvManager.HOST_COLUMN_NAME], rows: [] };
    }

    // Parse header
    const columns = this.parseCsvLine(lines[0]).map((col) => this.sanitizeColumnName(col));

    // Ensure Host_IP column exists
    if (!columns.includes(CsvManager.HOST_COLUMN_NAME)) {
      columns.unshift(CsvManager.HOST_COLUMN_NAME);
    }

    // Parse rows
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      const row: Record<string, string> = {};

      for (let j = 0; j < columns.length; j++) {
        row[columns[j]] = values[j] || '';
      }

      rows.push(row);
    }

    return { columns, rows };
  }

  /**
   * Save hosts to a CSV file
   */
  saveToFile(filePath: string, columns: string[], rows: Record<string, string>[]): void {
    const lines: string[] = [];

    // Header
    lines.push(columns.map((col) => this.escapeCsvValue(col)).join(','));

    // Rows
    for (const row of rows) {
      const values = columns.map((col) => this.escapeCsvValue(row[col] || ''));
      lines.push(values.join(','));
    }

    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  }

  /**
   * Create an empty data structure with just the Host_IP column
   */
  createEmpty(): { columns: string[]; rows: Record<string, string>[] } {
    return {
      columns: [CsvManager.HOST_COLUMN_NAME],
      rows: [],
    };
  }

  /**
   * Parse a CSV line handling quoted values
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];

      if (inQuotes) {
        if (char === '"') {
          // Check for escaped quote
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i += 2;
            continue;
          } else {
            inQuotes = false;
            i++;
            continue;
          }
        } else {
          current += char;
          i++;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
          i++;
        } else if (char === ',') {
          result.push(current.trim());
          current = '';
          i++;
        } else {
          current += char;
          i++;
        }
      }
    }

    // Add last value
    result.push(current.trim());

    return result;
  }

  /**
   * Escape a value for CSV output
   */
  private escapeCsvValue(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Sanitize column name (spaces to underscores)
   */
  private sanitizeColumnName(name: string): string {
    return name.trim().replace(/\s+/g, '_');
  }
}
