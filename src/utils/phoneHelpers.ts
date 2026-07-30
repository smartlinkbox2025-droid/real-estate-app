export const SAUDI_COUNTRY_CODE = '966';

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function toWesternDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)));
}

export function normalizeCountryCode(value: string | undefined | null): string {
  let digits = toWesternDigits(String(value || '')).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  return digits.slice(0, 4);
}

export function isValidCountryCode(value: string | undefined | null): boolean {
  return /^[1-9]\d{0,3}$/.test(normalizeCountryCode(value));
}

export function normalizeInternationalPhone(
  value: string | undefined | null,
  countryCode = SAUDI_COUNTRY_CODE,
): string {
  const code = normalizeCountryCode(countryCode);
  let digits = toWesternDigits(String(value || '')).replace(/\D/g, '');
  if (!digits || !code) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith(code)) return digits;
  digits = digits.replace(/^0+/, '');
  return `${code}${digits}`;
}

export function isValidInternationalPhone(
  value: string | undefined | null,
  countryCode = SAUDI_COUNTRY_CODE,
): boolean {
  const code = normalizeCountryCode(countryCode);
  const phone = normalizeInternationalPhone(value, code);
  return isValidCountryCode(code)
    && phone.startsWith(code)
    && /^\d{7,15}$/.test(phone)
    && phone.length > code.length + 4;
}

// Backward-compatible Saudi helpers for old imports and backup data.
export function normalizeSaudiPhone(value: string | undefined | null): string {
  return normalizeInternationalPhone(value, SAUDI_COUNTRY_CODE);
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

export function buildWhatsAppUrl(
  phone: string,
  message: string,
  countryCode = SAUDI_COUNTRY_CODE,
): string {
  const normalizedPhone = normalizeInternationalPhone(phone, countryCode);
  if (!isValidInternationalPhone(normalizedPhone, countryCode)) {
    throw new Error(`رقم جوال العميل غير صالح. أدخل رقماً صحيحاً بالرمز الدولي +${normalizeCountryCode(countryCode)}.`);
  }
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}
