export const SAUDI_COUNTRY_CODE = '966';

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function toWesternDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)));
}

export function normalizeSaudiPhone(value: string | undefined | null): string {
  let digits = toWesternDigits(String(value || '')).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00966')) digits = digits.slice(2);
  if (digits.startsWith(SAUDI_COUNTRY_CODE)) return digits;
  if (digits.startsWith('0')) digits = digits.slice(1);
  return `${SAUDI_COUNTRY_CODE}${digits}`;
}

export function isValidSaudiMobile(value: string | undefined | null): boolean {
  return /^9665\d{8}$/.test(normalizeSaudiPhone(value));
}

export interface InvoiceWhatsAppMessageOptions {
  customerName: string;
  invoiceNumber: string;
  dueDate: string;
  amountDue: string;
  companyName?: string;
}

export function buildInvoiceWhatsAppMessage(options: InvoiceWhatsAppMessageOptions): string {
  const {
    customerName,
    invoiceNumber,
    dueDate,
    amountDue,
    companyName,
  } = options;
  const sender = companyName?.trim() ? `\n\n${companyName.trim()}` : '';
  return [
    `السلام عليكم ورحمة الله وبركاته، الأستاذ/ة ${customerName}.`,
    'نأمل منكم التكرم بسداد المبلغ المستحق الموضح أدناه:',
    `رقم الفاتورة: ${invoiceNumber}`,
    `تاريخ الاستحقاق: ${dueDate}`,
    `المبلغ المتبقي المستحق: ${amountDue}`,
    'شاكرين لكم حسن تعاونكم.',
  ].join('\n') + sender;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const normalizedPhone = normalizeSaudiPhone(phone);
  if (!isValidSaudiMobile(normalizedPhone)) {
    throw new Error('رقم جوال العميل غير صالح. يجب أن يبدأ بـ 9665 ويتكون من 12 رقماً.');
  }
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}
