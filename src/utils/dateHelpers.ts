import { format, formatDistanceToNow, isAfter, isBefore, differenceInDays } from 'date-fns';
import { ar } from 'date-fns/locale';

export function fmtDate(d: Date | string | undefined | null): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return format(date, 'dd MMMM yyyy', { locale: ar });
}

export function fmtDateShort(d: Date | string | undefined | null): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return format(date, 'yyyy/MM/dd');
}

export function fmtRelative(d: Date | string | undefined | null): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return formatDistanceToNow(date, { locale: ar, addSuffix: true });
}

export function isOverdue(d: Date | string): boolean {
  const date = typeof d === 'string' ? new Date(d) : d;
  return isBefore(date, new Date());
}

export function isFuture(d: Date | string): boolean {
  const date = typeof d === 'string' ? new Date(d) : d;
  return isAfter(date, new Date());
}

export function daysBetween(a: Date | string, b: Date | string): number {
  const da = typeof a === 'string' ? new Date(a) : a;
  const db = typeof b === 'string' ? new Date(b) : b;
  return differenceInDays(db, da);
}

export function fmtMoney(v: number, currency = 'SAR'): string {
  const symbol = currency === 'SAR' ? 'ر.س' : currency;
  const formatted = new Intl.NumberFormat('en-SA', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(v || 0);
  return `${formatted} ${symbol}`;
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function toLocalDateKey(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isDateWithinInclusiveRange(
  value: Date | string,
  from?: string,
  to?: string,
): boolean {
  const dateKey = toLocalDateKey(value);
  if (!dateKey) return false;
  if (from && dateKey < from) return false;
  if (to && dateKey > to) return false;
  return true;
}
