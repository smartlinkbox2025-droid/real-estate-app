import type { Invoice, InvoiceStatus, Payment } from '../models/types';

export type SettlementFilter = 'all' | 'paid' | 'unpaid';

export interface InvoiceFinancialRow {
  invoice: Invoice;
  paid: number;
  balance: number;
  computedStatus: InvoiceStatus;
}

export interface CashPaymentFinancialRow {
  payment: Payment;
  invoice: Invoice;
  amount: number;
  invoiceBalance: number;
}

export function roundCurrency(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function effectivePaymentAmount(payment: Payment): number {
  if (payment.status === 'refunded') return 0;
  const refunded = Math.max(0, Number(payment.refundedAmount) || 0);
  return roundCurrency(Math.max(0, (Number(payment.amountPaid) || 0) - refunded));
}

export function calculateInvoiceStateFromPayments(
  invoice: Invoice,
  payments: Payment[],
  now = new Date(),
): Pick<InvoiceFinancialRow, 'paid' | 'balance' | 'computedStatus'> {
  const due = Math.max(0, Number(invoice.amountDue) || 0);
  const paid = roundCurrency(Math.min(
    due,
    payments.reduce((sum, payment) => sum + effectivePaymentAmount(payment), 0),
  ));
  const balance = roundCurrency(Math.max(0, due - paid));

  let computedStatus: InvoiceStatus;
  if (invoice.status === 'canceled') computedStatus = 'canceled';
  else if (balance <= 0) computedStatus = 'paid';
  else if (paid > 0) computedStatus = 'partial';
  else if (new Date(invoice.dueDate) < now) computedStatus = 'overdue';
  else computedStatus = 'unpaid';

  return { paid, balance, computedStatus };
}

export function buildInvoiceFinancialRows(
  invoices: Invoice[],
  payments: Payment[],
  now = new Date(),
): InvoiceFinancialRow[] {
  const paymentTotals = new Map<string, number>();
  const invoicePaymentCounts = new Map<string, number>();

  for (const payment of payments) {
    paymentTotals.set(
      payment.invoiceId,
      roundCurrency((paymentTotals.get(payment.invoiceId) || 0) + effectivePaymentAmount(payment)),
    );
    invoicePaymentCounts.set(payment.invoiceId, (invoicePaymentCounts.get(payment.invoiceId) || 0) + 1);
  }

  return invoices.map((invoice) => {
    const due = Math.max(0, Number(invoice.amountDue) || 0);
    const linkedPaymentTotal = paymentTotals.get(invoice.id || '') || 0;
    const hasLinkedPayments = (invoicePaymentCounts.get(invoice.id || '') || 0) > 0;
    const recordedPaid = hasLinkedPayments ? linkedPaymentTotal : Math.max(0, Number(invoice.amountPaid) || 0);
    const paid = roundCurrency(Math.min(due, recordedPaid));
    const balance = roundCurrency(Math.max(0, due - paid));

    let computedStatus: InvoiceStatus;
    if (invoice.status === 'canceled') computedStatus = 'canceled';
    else if (balance <= 0) computedStatus = 'paid';
    else if (paid > 0) computedStatus = 'partial';
    else if (new Date(invoice.dueDate) < now) computedStatus = 'overdue';
    else computedStatus = 'unpaid';

    return { invoice, paid, balance, computedStatus };
  });
}

export function filterInvoiceFinancialRows(
  rows: InvoiceFinancialRow[],
  options: {
    from: Date;
    to: Date;
    customerId?: string;
    settlement?: SettlementFilter;
  },
): InvoiceFinancialRow[] {
  const { from, to, customerId = 'all', settlement = 'all' } = options;
  return rows.filter((row) => {
    if (row.computedStatus === 'canceled') return false;
    const dueDate = new Date(row.invoice.dueDate);
    if (dueDate < from || dueDate > to) return false;
    if (customerId !== 'all' && row.invoice.customerId !== customerId) return false;
    if (settlement === 'paid' && row.balance > 0) return false;
    if (settlement === 'unpaid' && row.balance <= 0) return false;
    return true;
  });
}

export function summarizeInvoiceFinancialRows(rows: InvoiceFinancialRow[]) {
  const totalDue = roundCurrency(rows.reduce((sum, row) => sum + (Number(row.invoice.amountDue) || 0), 0));
  const totalRevenue = roundCurrency(rows.reduce((sum, row) => sum + row.paid, 0));
  const totalOutstanding = roundCurrency(Math.max(0, totalDue - totalRevenue));
  return { totalRevenue, totalDue, totalOutstanding };
}

export function summarizeInvoiceFinancialPeriod(
  rows: InvoiceFinancialRow[],
  options: Parameters<typeof filterInvoiceFinancialRows>[1],
) {
  const filteredRows = filterInvoiceFinancialRows(rows, options);
  return {
    rows: filteredRows,
    ...summarizeInvoiceFinancialRows(filteredRows),
  };
}

export function buildCashPaymentFinancialRows(
  invoices: Invoice[],
  payments: Payment[],
  now = new Date(),
): CashPaymentFinancialRow[] {
  const invoiceRows = new Map(
    buildInvoiceFinancialRows(invoices, payments, now)
      .map((row) => [row.invoice.id, row]),
  );

  return payments.flatMap((payment) => {
    const invoiceRow = invoiceRows.get(payment.invoiceId);
    const amount = effectivePaymentAmount(payment);
    if (!invoiceRow || invoiceRow.computedStatus === 'canceled' || amount <= 0) return [];
    return [{
      payment,
      invoice: invoiceRow.invoice,
      amount,
      invoiceBalance: invoiceRow.balance,
    }];
  });
}

export function filterCashPaymentFinancialRows(
  rows: CashPaymentFinancialRow[],
  options: {
    from: Date;
    to: Date;
    customerId?: string;
    settlement?: SettlementFilter;
  },
): CashPaymentFinancialRow[] {
  const { from, to, customerId = 'all', settlement = 'all' } = options;
  return rows.filter((row) => {
    const paymentDate = new Date(row.payment.paymentDate);
    if (paymentDate < from || paymentDate > to) return false;
    if (customerId !== 'all' && row.invoice.customerId !== customerId) return false;
    if (settlement === 'paid' && row.invoiceBalance > 0) return false;
    if (settlement === 'unpaid' && row.invoiceBalance <= 0) return false;
    return true;
  });
}

export function summarizeCashPaymentRows(rows: CashPaymentFinancialRow[]) {
  return {
    cashRevenue: roundCurrency(rows.reduce((sum, row) => sum + row.amount, 0)),
  };
}
