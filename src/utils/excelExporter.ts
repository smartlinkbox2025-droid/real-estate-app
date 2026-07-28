import * as XLSX from 'xlsx';

export interface ExcelSheetOptions {
  sheetName?: string;
  headers: string[];
  rows: (string | number | Date)[][];
  columnWidths?: number[];
}

export interface ExcelExportOptions {
  filename: string;
  sheetName?: string;
  headers?: string[];
  rows?: (string | number | Date)[][];
  columnWidths?: number[];
  sheets?: ExcelSheetOptions[];
}

export function exportToExcel(opts: ExcelExportOptions): void {
  const { filename } = opts;
  const sheets = opts.sheets || [{
    sheetName: opts.sheetName,
    headers: opts.headers || [],
    rows: opts.rows || [],
    columnWidths: opts.columnWidths,
  }];
  const wb = XLSX.utils.book_new();
  for (const [index, sheet] of sheets.entries()) {
    const {
      sheetName = index === 0 ? 'التقرير' : `ورقة ${index + 1}`,
      headers,
      rows,
      columnWidths,
    } = sheet;
    const aoa: any[][] = [headers, ...rows.map((r) => r.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : c)))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const widths = columnWidths || headers.map(() => 24);
    ws['!cols'] = widths.map((w) => ({ wch: w }));
    ws['!views'] = [{ RTL: true }];
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c: C });
      if (ws[addr]) ws[addr].s = { font: { bold: true }, alignment: { horizontal: 'right' } };
    }
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  if (!wb.Workbook) wb.Workbook = {};
  wb.Workbook.Views = [{ RTL: true } as any];
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}
