/**
 * pdfGenerator.ts — نظام PDF المركزي للمتخصص الذكي للعقارات
 *
 * الخط: Cairo Variable (TTF مدمج كـ base64 — بدون طلبات شبكة)
 * يدعم: العربية + اللاتينية، أوزان 200–900
 * المصدر: Google Fonts GitHub — ofl/cairo/Cairo[slnt,wght].ttf
 *
 * التسجيل عبر:
 *   pdfMake.addVirtualFileSystem(vfs)
 *   pdfMake.addFonts(fonts)
 * ملاحظة: pdfMake.vfs = {} لا يعمل في pdfmake v3 — لا تستخدمه.
 */

/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore
import pdfMake from 'pdfmake/build/pdfmake';
import { CAIRO_B64 } from '../assets/fonts/cairoBase64';
import { fmtMoney } from './dateHelpers';

// ─── تسجيل الخطوط (مرة واحدة فقط) ──────────────────────────────────────────
let _fontsRegistered = false;

function registerFonts(): void {
  if (_fontsRegistered) return;
  pdfMake.addVirtualFileSystem({ 'Cairo.ttf': CAIRO_B64 });
  pdfMake.addFonts({
    Cairo: {
      normal:      'Cairo.ttf',
      bold:        'Cairo.ttf',
      italics:     'Cairo.ttf',
      bolditalics: 'Cairo.ttf',
    },
  });
  _fontsRegistered = true;
}

// ─── ترتيب النص العربي لـ pdfmake ────────────────────────────────────────────
// خط Cairo يدعم تشكيل العربية (GSUB/OpenType) مباشرة من U+0600–U+06FF،
// لذا لا نحتاج Presentation Forms. نكتفي بعكس ترتيب الكلمات
// حتى تُرسم الجملة بصرياً من اليمين.
function ar(text: string | number | undefined | null): string {
  if (text === null || text === undefined) return '';
  const s = String(text);
  // نقسّم مع الحفاظ على المسافات كـ tokens ثم نعكس الترتيب
  return s.split(/(\s+)/).reverse().join('');
}

// ─── لوحة الألوان ────────────────────────────────────────────────────────────
const C = {
  navy:      '#0F172A',   // رأس الجدول + خط فاصل رئيسي
  gold:      '#D97706',   // شريط الرأس
  goldLight: '#FEF3C7',   // خلفية صف مميّز
  slate:     '#334155',   // نص أساسي
  muted:     '#64748B',   // نص ثانوي
  hairline:  '#CBD5E1',   // خطوط فاصلة خفيفة
  rowAlt:    '#F8FAFC',   // صفوف بديلة
  white:     '#FFFFFF',
  success:   '#16A34A',
} as const;

// ─── الأنماط المشتركة ─────────────────────────────────────────────────────────
const STYLES: Record<string, object> = {
  company:        { fontSize: 10, color: C.muted },
  docTitle:       { fontSize: 22, bold: true, color: C.navy, characterSpacing: -0.3 },
  docSubtitle:    { fontSize: 10, color: C.muted, margin: [0, 2, 0, 0] },
  sectionHeading: { fontSize: 13, bold: true, color: C.navy },
  body:           { fontSize: 10.5, color: C.slate },
  tableHeader:    { bold: true, color: C.white, fontSize: 10 },
  tableCell:      { fontSize: 9.5, color: C.navy },
  tableCellMuted: { fontSize: 9.5, color: C.muted },
  footer:         { fontSize: 8, color: C.muted },
  label:          { fontSize: 9.5, color: C.muted },
  labelBold:      { fontSize: 10, bold: true, color: C.slate },
  receiptTitle:   { fontSize: 24, bold: true, color: C.navy },
  amountBig:      { fontSize: 22, bold: true, color: C.success },
};

// ─── تخطيط الجدول ─────────────────────────────────────────────────────────────
const TABLE_LAYOUT = {
  hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0 : 0.4),
  vLineWidth: () => 0,
  hLineColor: () => C.hairline,
  fillColor: (row: number) => (row === 0 ? C.navy : row % 2 === 0 ? C.rowAlt : null),
  paddingTop:    () => 6,
  paddingBottom: () => 6,
  paddingLeft:   () => 8,
  paddingRight:  () => 8,
};

const RECEIPT_LAYOUT = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingTop:    () => 5,
  paddingBottom: () => 5,
  paddingLeft:   () => 0,
  paddingRight:  () => 0,
};

// ─── مساعدات ──────────────────────────────────────────────────────────────────
function hr(
  color: string = C.hairline,
  weight = 0.5,
  margin: [number,number,number,number] = [0,0,0,14],
  width = 515,
): any {
  return {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: weight, lineColor: color }],
    margin,
  };
}

/** شريط ذهبي في أعلى الصفحة */
function topBand(width = 595, horizontalMargin = 40): any {
  return {
    canvas: [{ type: 'rect', x: 0, y: 0, w: width, h: 6, color: C.gold }],
    margin: [-horizontalMargin, -horizontalMargin, -horizontalMargin, 20],
  };
}

/** رأس الوثيقة — عنوان الوثيقة يميناً (RTL) ، اسم الشركة يساراً */
function buildDocHeader(opts: {
  title: string;
  subtitle?: string;
  companyName?: string;
  logoBase64?: string;
  date?: string;
}): any {
  // عمود اليمين: عنوان التقرير + التاريخ (أول ما يقرأه القارئ)
  const titleStack: any[] = [
    { text: ar(opts.title), style: 'docTitle', alignment: 'right' },
  ];
  if (opts.subtitle) {
    titleStack.push({ text: ar(opts.subtitle), style: 'docSubtitle', alignment: 'right' });
  }
  titleStack.push({
    text: ar(opts.date ?? new Date().toLocaleDateString('en-SA')),
    style: 'label',
    alignment: 'right',
    margin: [0, 4, 0, 0],
  });

  // عمود اليسار: شعار الشركة + اسمها (ثانوي)
  const companyStack: any[] = [];
  if (opts.logoBase64) {
    try {
      companyStack.push({
        image: opts.logoBase64,
        width: 64,
        height: 64,
        fit: [64, 64],
        alignment: 'left',
        margin: [0, 0, 0, 4],
      });
    } catch { /* skip broken logo */ }
  }
  if (opts.companyName) {
    companyStack.push({ text: ar(opts.companyName), style: 'company', alignment: 'left' });
  }

  return {
    columns: [
      { stack: companyStack, width: 'auto', alignment: 'left' },
      { stack: titleStack,   width: '*',    alignment: 'right' },
    ],
    margin: [0, 0, 0, 12],
  };
}

/** بناء جدول كامل مع صف رأس ملوّن — الأعمدة مقلوبة لاتجاه RTL */
function tableBlock(headers: string[], rows: (string | number)[][]): any {
  const safeRows = rows.length ? rows : [Array(headers.length).fill('—')];

  // عكس ترتيب الأعمدة حتى يظهر العمود الأول على اليمين (RTL)
  const rHeaders = [...headers].reverse();
  const rRows    = safeRows.map((row) => [...row].reverse());

  const widths = Array(headers.length).fill('*');

  return {
    table: {
      headerRows: 1,
      widths,
      body: [
        rHeaders.map((h) => ({
          text: ar(h),
          style: 'tableHeader',
          alignment: 'right',
          margin: [4, 0, 4, 0],
        })),
        ...rRows.map((row) =>
          row.map((cell) => ({
            text: ar(cell),
            style: 'tableCell',
            alignment: 'right',
          }))
        ),
      ],
    },
    layout: TABLE_LAYOUT,
    margin: [0, 0, 0, 14],
  };
}

/** تذييل كل صفحة — رقم الصفحة يميناً، اسم الشركة يساراً (RTL) */
function pageFooter(companyName?: string) {
  return (currentPage: number, pageCount: number): any => ({
    columns: [
      {
        text: ar(companyName
          ? `© ${companyName} — نظام المتخصص الذكي للعقارات`
          : '© نظام المتخصص الذكي للعقارات'),
        alignment: 'left',
        fontSize: 8,
        color: C.muted,
        margin: [40, 8, 0, 0],
      },
      {
        text: `${currentPage} / ${pageCount}`,
        alignment: 'right',
        fontSize: 8,
        color: C.muted,
        margin: [0, 8, 40, 0],
      },
    ],
  });
}

/** تشغيل pdfmake وتنزيل الملف */
function download(docDef: any, filename: string): Promise<void> {
  registerFonts();
  return new Promise<void>((resolve, reject) => {
    try {
      pdfMake.createPdf(docDef).download(filename, () => resolve());
    } catch (err) {
      reject(err);
    }
  });
}

// ─── API العامة — generateArabicPDF ──────────────────────────────────────────
export interface Section {
  heading?: string;
  text?: string;
  table?: { headers: string[]; rows: (string | number)[][] };
}

export interface PDFOptions {
  title: string;
  subtitle?: string;
  sections: Section[];
  filename?: string;
  companyName?: string;
  logoBase64?: string;
  pageOrientation?: 'portrait' | 'landscape';
}

export async function generateArabicPDF(opts: PDFOptions): Promise<void> {
  const {
    title, subtitle, sections,
    filename = 'تقرير.pdf',
    companyName, logoBase64,
    pageOrientation = 'portrait',
  } = opts;
  const isLandscape = pageOrientation === 'landscape';
  const pageMargins = isLandscape
    ? [28, 32, 28, 52]
    : [40, 40, 40, 56];
  const pageWidth = isLandscape ? 842 : 595;
  const contentWidth = pageWidth - pageMargins[0] - pageMargins[2];

  const content: any[] = [
    topBand(pageWidth, pageMargins[0]),
    buildDocHeader({ title, subtitle, companyName, logoBase64 }),
    hr(C.gold, 2, [0, 0, 0, 16], contentWidth),
  ];

  for (const sec of sections) {
    if (sec.heading) {
      content.push({
        text: ar(sec.heading),
        style: 'sectionHeading',
        alignment: 'right',
        margin: [0, 10, 0, 6],
      });
      content.push(hr(C.navy, 1, [0, 0, 0, 8], contentWidth));
    }
    if (sec.text) {
      content.push({
        text: ar(sec.text),
        style: 'body',
        alignment: 'right',
        margin: [0, 0, 0, 8],
      });
    }
    if (sec.table) {
      content.push(tableBlock(sec.table.headers, sec.table.rows));
    }
  }

  // تذييل نهاية المستند
  content.push(
    hr(C.hairline, 0.4, [0, 20, 0, 6], contentWidth),
    {
      text: ar(`تم الإنشاء تلقائياً بتاريخ ${new Date().toLocaleDateString('en-SA')}`),
      style: 'footer',
      alignment: 'center',
    },
  );

  await download(
    {
      pageSize:     'A4',
      pageOrientation,
      pageMargins,
      defaultStyle: { font: 'Cairo', fontSize: 10.5, lineHeight: 1.5, alignment: 'right' },
      styles:       STYLES,
      content,
      footer:       pageFooter(companyName),
    },
    filename,
  );
}

// ─── API العامة — generateReceipt (سند قبض) ──────────────────────────────────
export interface ReceiptOptions {
  receiptNumber: string;
  paymentDate: Date | string;
  amountPaid: number;
  paymentMethod: string;
  referenceNumber?: string;
  notes?: string;
  customerName: string;
  propertyName: string;
  invoiceNumber?: string;
  companyName?: string;
  companyPhone?: string;
  currency?: string;
  logoBase64?: string;
}

export async function generateReceipt(opts: ReceiptOptions): Promise<void> {
  const {
    receiptNumber, paymentDate, amountPaid, paymentMethod,
    referenceNumber, notes, customerName, propertyName,
    invoiceNumber, companyName, companyPhone, currency, logoBase64,
  } = opts;

  const dateStr = (() => {
    if (typeof paymentDate === 'string') return paymentDate;
    const d = paymentDate instanceof Date ? paymentDate : new Date(paymentDate);
    return isNaN(d.getTime()) ? String(paymentDate) : d.toLocaleDateString('en-SA');
  })();

  const amountStr   = fmtMoney(amountPaid, currency);
  const amountWords = numberToArabicWords(amountPaid, currency?.trim() || 'SAR');

  // رأس السند (شعار + شركة يميناً — عنوان + رقم + تاريخ يساراً)
  const rightCol: any[] = [];
  if (logoBase64) {
    try {
      rightCol.push({
        image: logoBase64,
        width: 56,
        height: 56,
        fit: [56, 56],
        alignment: 'left',
        margin: [0, 0, 0, 4],
      });
    } catch { /* skip */ }
  }
  if (companyName) {
    rightCol.push({ text: ar(companyName), fontSize: 12, bold: true, alignment: 'left', color: C.navy });
  }
  if (companyPhone) {
    rightCol.push({ text: ar(companyPhone), style: 'label', alignment: 'left' });
  }

  // عمود اليمين: عنوان السند + رقمه + تاريخه (يُقرأ أولاً)
  const titleCol: any[] = [
    { text: ar('سند قبض'), style: 'receiptTitle', alignment: 'right' },
    { text: ar(`رقم: ${receiptNumber}`),  style: 'label', alignment: 'right', margin: [0, 2, 0, 0] },
    { text: ar(`التاريخ: ${dateStr}`),    style: 'label', alignment: 'right' },
  ];

  // صفوف البيانات — القيمة يميناً (تُقرأ أولاً) والتسمية يساراً (RTL)
  const infoRows: any[][] = [
    [{ text: ar(customerName),   style: 'body',      alignment: 'right' }, { text: ar('اسم العميل'),    style: 'labelBold', alignment: 'left' }],
    [{ text: ar(propertyName),   style: 'body',      alignment: 'right' }, { text: ar('العقار'),        style: 'labelBold', alignment: 'left' }],
    ...(invoiceNumber
      ? [[{ text: ar(invoiceNumber),  style: 'body', alignment: 'right' }, { text: ar('رقم الفاتورة'),  style: 'labelBold', alignment: 'left' }]]
      : []),
    [{ text: ar(paymentMethod),  style: 'body',      alignment: 'right' }, { text: ar('طريقة السداد'),  style: 'labelBold', alignment: 'left' }],
    ...(referenceNumber
      ? [[{ text: ar(referenceNumber), style: 'body', alignment: 'right' }, { text: ar('الرقم المرجعي'), style: 'labelBold', alignment: 'left' }]]
      : []),
    [{ text: ar(amountWords),    style: 'body',      alignment: 'right' }, { text: ar('المبلغ كتابةً'), style: 'labelBold', alignment: 'left' }],
  ];

  await download(
    {
      pageSize:     'A4',
      pageMargins:  [40, 28, 40, 28],
      defaultStyle: { font: 'Cairo', fontSize: 10.5, lineHeight: 1.35, alignment: 'right' },
      styles:       STYLES,
      content: [
        // شريط ذهبي
        {
          canvas: [{ type: 'rect', x: 0, y: 0, w: 595, h: 5, color: C.gold }],
          margin: [-40, -28, -40, 16],
        },
        // رأس السند — شركة يساراً، عنوان السند يميناً (RTL)
        {
          columns: [
            { stack: rightCol, width: 'auto', alignment: 'left' },
            { stack: titleCol, width: '*',    alignment: 'right' },
          ],
          margin: [0, 0, 0, 10],
        },
        hr(C.navy, 1.5, [0, 0, 0, 12]),
        // بيانات — القيمة يميناً، التسمية يساراً
        {
          table: { widths: ['*', 'auto'], body: infoRows },
          layout: RECEIPT_LAYOUT,
          margin: [0, 0, 0, 10],
        },
        hr(C.hairline, 0.4, [0, 0, 0, 10]),
        // المبلغ الرقمي — المبلغ يميناً (بارز)، التسمية يساراً
        {
          columns: [
            { text: ar(amountStr),           style: 'amountBig', alignment: 'right', width: '*'    },
            { text: ar('المبلغ المُستلم'), style: 'labelBold', alignment: 'left',  width: 'auto', fontSize: 12 },
          ],
          margin: [0, 0, 0, 10],
        },
        ...(notes
          ? [{
              columns: [
                { text: ar(notes),       style: 'body',      width: '*',    alignment: 'right' },
                { text: ar('ملاحظات:'), style: 'labelBold', width: 'auto', alignment: 'left', margin: [8, 0, 0, 0] },
              ],
              margin: [0, 0, 0, 8],
            }]
          : []),
        hr(C.hairline, 0.4, [0, 4, 0, 16]),
        // خطوط التوقيع — توقيع العميل يميناً، توقيع المستلم يساراً
        {
          columns: [
            {
              stack: [
                { text: ar('توقيع المستلم'), style: 'label', alignment: 'center', margin: [0, 0, 0, 18] },
                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 130, y2: 0, lineWidth: 0.5, lineColor: C.hairline }] },
              ],
              width: '*',
              alignment: 'center',
            },
            { width: 40, text: '' },
            {
              stack: [
                { text: ar('توقيع العميل'), style: 'label', alignment: 'center', margin: [0, 0, 0, 18] },
                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 130, y2: 0, lineWidth: 0.5, lineColor: C.hairline }] },
              ],
              width: '*',
              alignment: 'center',
            },
          ],
          margin: [0, 0, 0, 12],
        },
        hr(C.hairline, 0.4, [0, 0, 0, 6]),
        {
          text: ar('تم الإنشاء إلكترونياً بواسطة نظام المتخصص الذكي للعقارات'),
          style: 'footer',
          alignment: 'center',
        },
      ],
    },
    `سند_قبض_${receiptNumber}.pdf`,
  );
}

// ─── مساعد: تحويل الرقم إلى كلمات عربية ──────────────────────────────────────
function numberToArabicWords(n: number, currencyLabel = 'SAR'): string {
  if (!isFinite(n) || n < 0) return String(n);

  const ones = [
    '', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
    'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر',
    'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر',
  ];
  const tens     = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hundreds = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

  function toWords(num: number): string {
    if (num === 0) return 'صفر';
    if (num < 20)  return ones[num];
    if (num < 100) {
      const t = tens[Math.floor(num / 10)];
      const o = ones[num % 10];
      return o ? `${o} و${t}` : t;
    }
    if (num < 1000) {
      const r = toWords(num % 100);
      return r ? `${hundreds[Math.floor(num / 100)]} و${r}` : hundreds[Math.floor(num / 100)];
    }
    if (num < 1_000_000) {
      const th   = Math.floor(num / 1000);
      const rest = num % 1000;
      const thStr = th === 1 ? 'ألف' : th === 2 ? 'ألفان' : `${toWords(th)} آلاف`;
      return rest ? `${thStr} و${toWords(rest)}` : thStr;
    }
    if (num < 1_000_000_000) {
      const m    = Math.floor(num / 1_000_000);
      const rest = num % 1_000_000;
      const mStr = m === 1 ? 'مليون' : m === 2 ? 'مليونان' : `${toWords(m)} ملايين`;
      return rest ? `${mStr} و${toWords(rest)}` : mStr;
    }
    return String(num);
  }

  const intPart = Math.floor(n);
  const decPart = Math.round((n - intPart) * 100);
  let result = `${toWords(intPart)} ${currencyLabel}`;
  if (decPart > 0) result += ` و${toWords(decPart)} جزءاً من مائة`;
  return result + ' فقط لا غير';
}
