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

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const PROFESSIONAL_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>
  <fonts count="2">
    <font><sz val="11"/><color rgb="FF0F172A"/><name val="Arial"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left/><right/><top/><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1" readingOrder="2"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1" readingOrder="2"/></xf>
    <xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center" readingOrder="2"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1" readingOrder="2"/></xf>
    <xf numFmtId="4" fontId="0" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center" readingOrder="2"/></xf>
    <xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleMedium9"/>
</styleSheet>`;

function styleIdFor(value: string | number | Date, rowIndex: number): number {
  if (rowIndex === 0) return 1;
  const alternate = rowIndex % 2 === 0;
  if (value instanceof Date) return alternate ? 7 : 4;
  if (typeof value === 'number') return alternate ? 6 : 3;
  return alternate ? 5 : 2;
}

function patchWorksheetXml(
  xml: string,
  matrix: (string | number | Date)[][],
): string {
  const stylesByAddress = new Map<string, number>();
  matrix.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      stylesByAddress.set(
        XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex }),
        styleIdFor(value, rowIndex),
      );
    });
  });

  let result = xml.replace(/<c\b([^>]*?)(\/?)>/g, (whole, attributes: string, slash: string) => {
    const address = attributes.match(/\br="([^"]+)"/)?.[1];
    const styleId = address ? stylesByAddress.get(address) : undefined;
    if (styleId === undefined) return whole;
    const cleanAttributes = attributes.replace(/\s+s="\d+"/g, '');
    return `<c${cleanAttributes} s="${styleId}"${slash}>`;
  });

  const sheetViews = '<sheetViews><sheetView showGridLines="0" rightToLeft="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>';
  if (/<sheetViews>[\s\S]*?<\/sheetViews>/.test(result)) {
    result = result.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, sheetViews);
  } else {
    result = result.replace(/(<worksheet\b[^>]*>)/, `$1${sheetViews}`);
  }
  return result;
}

function replaceZipText(zip: any, path: string, text: string): void {
  const entry = XLSX.CFB.find(zip, path);
  if (!entry) throw new Error(`تعذّر تنسيق ملف Excel: ${path}`);
  entry.content = encoder.encode(text);
  entry.size = entry.content.length;
}

export function createStyledExcelWorkbook(opts: ExcelExportOptions): Uint8Array {
  const sheets = opts.sheets || [{
    sheetName: opts.sheetName,
    headers: opts.headers || [],
    rows: opts.rows || [],
    columnWidths: opts.columnWidths,
  }];
  const workbook = XLSX.utils.book_new();
  const matrices: (string | number | Date)[][][] = [];

  sheets.forEach((sheet, index) => {
    const {
      sheetName = index === 0 ? 'التقرير' : `ورقة ${index + 1}`,
      headers,
      rows,
      columnWidths,
    } = sheet;
    const matrix = [headers, ...rows];
    matrices.push(matrix);
    const worksheet = XLSX.utils.aoa_to_sheet(matrix, { cellDates: false });
    const widths = columnWidths || headers.map(() => 24);
    worksheet['!cols'] = widths.map((width) => ({ wch: width }));
    worksheet['!rows'] = matrix.map((_, rowIndex) => ({ hpt: rowIndex === 0 ? 28 : 22 }));
    worksheet['!views'] = [{ RTL: true }];
    if (headers.length > 0) {
      worksheet['!autofilter'] = {
        ref: XLSX.utils.encode_range({
          s: { r: 0, c: 0 },
          e: { r: Math.max(0, matrix.length - 1), c: headers.length - 1 },
        }),
      };
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  });

  workbook.Props = {
    Title: opts.filename,
    Subject: 'تقرير مُصدّر من نظام المتخصص الذكي للعقارات',
    Author: 'نظام المتخصص الذكي للعقارات',
    CreatedDate: new Date(),
  };
  if (!workbook.Workbook) workbook.Workbook = {};
  workbook.Workbook.Views = [{ RTL: true } as any];

  const plainWorkbook = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
    compression: true,
    cellDates: false,
  });
  const zip = XLSX.CFB.read(new Uint8Array(plainWorkbook as ArrayBuffer), { type: 'array' });
  replaceZipText(zip, '/xl/styles.xml', PROFESSIONAL_STYLES_XML);

  matrices.forEach((matrix, index) => {
    const path = `/xl/worksheets/sheet${index + 1}.xml`;
    const entry = XLSX.CFB.find(zip, path);
    if (!entry?.content) throw new Error(`تعذّر تنسيق ورقة Excel رقم ${index + 1}`);
    const worksheetXml = decoder.decode(entry.content);
    replaceZipText(zip, path, patchWorksheetXml(worksheetXml, matrix));
  });

  return XLSX.CFB.write(zip, {
    fileType: 'zip',
    type: 'array',
    compression: true,
  } as any) as Uint8Array;
}

export function exportToExcel(opts: ExcelExportOptions): void {
  const bytes = createStyledExcelWorkbook(opts);
  const blobBytes = new Uint8Array(bytes.byteLength);
  blobBytes.set(bytes);
  const blob = new Blob([blobBytes.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = opts.filename.endsWith('.xlsx') ? opts.filename : `${opts.filename}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
