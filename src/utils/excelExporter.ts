import * as XLSX from 'xlsx';

export interface ExcelExportOptions {
  filename: string;
  sheetName?: string;
  headers: string[];
  rows: (string | number | Date)[][];
  columnWidths?: number[];
}

export function exportToExcel(opts: ExcelExportOptions): void {
  const { filename, sheetName = 'التقرير', headers, rows, columnWidths } = opts;
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
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  if (!wb.Workbook) wb.Workbook = {};
  wb.Workbook.Views = [{ RTL: true } as any];
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}
