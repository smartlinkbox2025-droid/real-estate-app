import { addMonths } from 'date-fns';
import type { Contract } from '../models/types';
import { roundCurrency } from './financialCalculations';

export function calculateIntervals(
  start: Date,
  end: Date,
  frequency: Contract['paymentFrequency'],
): { dueDate: Date }[] {
  if (!(start instanceof Date) || isNaN(start.getTime()) || !(end instanceof Date) || isNaN(end.getTime())) {
    throw new Error('تواريخ العقد غير صالحة.');
  }
  if (end <= start) throw new Error('يجب أن يكون تاريخ نهاية العقد بعد تاريخ البداية.');
  if (frequency === 'one_time') return [{ dueDate: start }];

  const monthsPerCycle = frequency === 'monthly'
    ? 1
    : frequency === 'quarterly'
      ? 3
      : frequency === 'semi_annual'
        ? 6
        : 12;
  const list: { dueDate: Date }[] = [];
  for (let index = 0; ; index++) {
    const dueDate = addMonths(start, index * monthsPerCycle);
    if (dueDate >= end) break;
    list.push({ dueDate });
  }
  if (list.length === 0) list.push({ dueDate: start });
  return list;
}

export function allocateInvoiceAmounts(totalAmount: number, count: number): number[] {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error('يجب أن تكون القيمة الإجمالية للعقد أكبر من صفر.');
  }
  if (!Number.isInteger(count) || count <= 0) throw new Error('عدد الفواتير غير صالح.');

  const total = roundCurrency(totalAmount);
  const regularAmount = roundCurrency(total / count);
  return Array.from({ length: count }, (_, index) => (
    index === count - 1
      ? roundCurrency(total - regularAmount * (count - 1))
      : regularAmount
  ));
}
