import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../database/db';
import { AR } from '../constants/arabicTerms';
import { fmtDate, fmtMoney, toISODate } from '../utils/dateHelpers';
import {
  buildInvoiceFinancialRows,
  effectivePaymentAmount,
  filterInvoiceFinancialRows,
  summarizeInvoiceFinancialRows,
  type SettlementFilter,
} from '../utils/financialCalculations';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { BarChart3 } from 'lucide-react';
import { generateArabicPDF } from '../utils/pdfGenerator';
import { exportToExcel } from '../utils/excelExporter';
import { toast } from 'sonner';
import { startOfMonth, subMonths, endOfMonth, endOfDay, format } from 'date-fns';
import { ar } from 'date-fns/locale';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';

export default function FinancialReport() {
  const invoices = useLiveQuery(() => db.invoices.toArray(), []) || [];
  const payments = useLiveQuery(() => db.payments.toArray(), []) || [];
  const customers = useLiveQuery(() => db.customers.orderBy('fullName').toArray(), []) || [];
  const settings = useLiveQuery(() => db.settings.get('singleton'), []);

  const today = new Date();
  const [from, setFrom] = useState(toISODate(startOfMonth(subMonths(today, 5))));
  const [to, setTo] = useState(toISODate(endOfMonth(today)));
  const [customerId, setCustomerId] = useState('all');
  const [settlement, setSettlement] = useState<SettlementFilter>('all');

  const fromD = new Date(from);
  const toD = endOfDay(new Date(to));
  const allRows = useMemo(
    () => buildInvoiceFinancialRows(invoices, payments),
    [invoices, payments],
  );
  const filteredRows = useMemo(
    () => filterInvoiceFinancialRows(allRows, { from: fromD, to: toD, customerId, settlement }),
    [allRows, from, to, customerId, settlement],
  );
  const { totalRevenue, totalDue, totalOutstanding } = useMemo(
    () => summarizeInvoiceFinancialRows(filteredRows),
    [filteredRows],
  );

  const customerById = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer.fullName])),
    [customers],
  );
  const paymentsByInvoice = useMemo(() => {
    const grouped = new Map<string, typeof payments>();
    for (const payment of payments) {
      if (effectivePaymentAmount(payment) <= 0) continue;
      const invoicePayments = grouped.get(payment.invoiceId) || [];
      invoicePayments.push(payment);
      grouped.set(payment.invoiceId, invoicePayments);
    }
    for (const invoicePayments of grouped.values()) {
      invoicePayments.sort(
        (a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime(),
      );
    }
    return grouped;
  }, [payments]);
  const detailRows = useMemo(
    () => [...filteredRows].sort(
      (a, b) => new Date(b.invoice.dueDate).getTime() - new Date(a.invoice.dueDate).getTime(),
    ),
    [filteredRows],
  );

  const paymentDatesForInvoice = (invoiceId?: string) =>
    (paymentsByInvoice.get(invoiceId || '') || [])
      .map((payment) => fmtDate(payment.paymentDate))
      .join('، ') || '—';

  const paymentMethodsForInvoice = (invoiceId?: string) =>
    [...new Set(
      (paymentsByInvoice.get(invoiceId || '') || [])
        .map((payment) => AR.payment.methods[payment.paymentMethod]),
    )].join('، ') || '—';

  const referencesForInvoice = (invoiceId?: string) =>
    [...new Set(
      (paymentsByInvoice.get(invoiceId || '') || [])
        .map((payment) => payment.referenceNumber)
        .filter(Boolean),
    )].join('، ') || '—';

  const selectedCustomerName = customerId === 'all'
    ? 'كل العملاء'
    : customerById.get(customerId) || '—';
  const settlementLabel = settlement === 'paid'
    ? 'مسدد'
    : settlement === 'unpaid'
      ? 'غير مسدد'
      : 'الكل';

  const trend = useMemo(() => {
    const months: Record<string, { name: string; إيرادات: number; مستحق: number }> = {};
    for (const row of filteredRows) {
      const dueDate = new Date(row.invoice.dueDate);
      const key = format(dueDate, 'yyyy-MM');
      const name = format(dueDate, 'MMM yy', { locale: ar });
      months[key] ||= { name, إيرادات: 0, مستحق: 0 };
      months[key].إيرادات += row.paid;
      months[key].مستحق += row.invoice.amountDue;
    }
    return Object.entries(months)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, value]) => value);
  }, [filteredRows]);

  const exportPdf = async () => {
    try {
      await generateArabicPDF({
        title: 'التقرير المالي الشامل',
        subtitle: `فترة الاستحقاق: ${fmtDate(fromD)} — ${fmtDate(toD)} · العميل: ${selectedCustomerName} · الحالة: ${settlementLabel}`,
        companyName: settings?.companyName,
        logoBase64: settings?.logoBase64,
        sections: [
          {
            heading: 'الملخص التنفيذي',
            table: {
              headers: ['البند', 'المبلغ'],
              rows: [
                [AR.reports.revenue, fmtMoney(totalRevenue)],
                ['إجمالي المستحقات', fmtMoney(totalDue)],
                ['المتبقي غير المسدد', fmtMoney(totalOutstanding)],
              ],
            },
          },
          {
            heading: 'تفاصيل الاستحقاقات والمدفوعات',
            table: {
              headers: [
                AR.invoice.dueDate,
                AR.payment.paymentDate,
                'اسم العميل',
                AR.invoice.number,
                AR.invoice.amountDue,
                AR.invoice.amountPaid,
                AR.invoice.balance,
                AR.invoice.status,
              ],
              rows: detailRows.map((row) => [
                fmtDate(row.invoice.dueDate),
                paymentDatesForInvoice(row.invoice.id),
                customerById.get(row.invoice.customerId) || '—',
                row.invoice.invoiceNumber,
                fmtMoney(row.invoice.amountDue),
                fmtMoney(row.paid),
                fmtMoney(row.balance),
                AR.invoice.statuses[row.computedStatus],
              ]),
            },
          },
        ],
        filename: `تقرير_مالي_${from}_${to}.pdf`,
      });
      toast.success('تم إنشاء التقرير');
    } catch (error: any) {
      toast.error('تعذّر إنشاء PDF: ' + (error.message || ''));
    }
  };

  const exportExcel = () => {
    exportToExcel({
      filename: `تقرير_مالي_${from}_${to}`,
      sheetName: 'التقرير المالي',
      headers: [
        AR.invoice.dueDate,
        AR.payment.paymentDate,
        'اسم العميل',
        AR.invoice.number,
        AR.invoice.amountDue,
        AR.invoice.amountPaid,
        AR.invoice.balance,
        AR.invoice.status,
        AR.payment.paymentMethod,
        AR.payment.referenceNumber,
      ],
      rows: detailRows.map((row) => [
        row.invoice.dueDate instanceof Date ? row.invoice.dueDate : new Date(row.invoice.dueDate),
        paymentDatesForInvoice(row.invoice.id),
        customerById.get(row.invoice.customerId) || '—',
        row.invoice.invoiceNumber,
        row.invoice.amountDue,
        row.paid,
        row.balance,
        AR.invoice.statuses[row.computedStatus],
        paymentMethodsForInvoice(row.invoice.id),
        referencesForInvoice(row.invoice.id),
      ]),
      columnWidths: [16, 22, 26, 18, 16, 16, 16, 16, 22, 20],
    });
    toast.success('تم تصدير ملف إكسل');
  };

  return (
    <div className="space-y-4" data-testid="financial-report-page">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6" /> {AR.reports.financialTitle}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          تحليل مالي حسب فترة استحقاق الفواتير — إجمالي المستحقات يساوي الإيرادات المحصلة مضافاً إليها المتبقي.
        </p>
      </div>

      <Card className="glass border-0">
        <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3 pt-6">
          <div className="space-y-1.5">
            <Label className="text-xs">{AR.common.from}</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="report-from-input" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{AR.common.to}</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="report-to-input" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">اسم العميل</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger data-testid="report-customer-filter"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-64 overflow-y-scroll">
                <SelectItem value="all">كل العملاء</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id!}>{customer.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">حالة السداد</Label>
            <Select value={settlement} onValueChange={(value) => setSettlement(value as SettlementFilter)}>
              <SelectTrigger data-testid="report-settlement-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="paid">مسدد</SelectItem>
                <SelectItem value="unpaid">غير مسدد</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 flex items-end gap-2 justify-end">
            <Button variant="outline" onClick={exportExcel} data-testid="report-excel-button">{AR.actions.exportExcel}</Button>
            <Button onClick={exportPdf} data-testid="report-pdf-button">{AR.actions.exportPdf}</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { label: AR.reports.revenue, value: fmtMoney(totalRevenue), cls: 'text-success' },
          { label: 'إجمالي المستحقات', value: fmtMoney(totalDue), cls: 'text-accent' },
          { label: 'المتبقي غير المسدد', value: fmtMoney(totalOutstanding), cls: 'text-warning' },
        ].map(({ label, value, cls }) => (
          <Card key={label} className="glass border-0">
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className={`text-2xl font-bold num mt-1 ${cls}`}>{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="glass border-0">
        <CardHeader><CardTitle className="text-base">اتجاه الإيرادات مقابل الاستحقاقات</CardTitle></CardHeader>
        <CardContent>
          <div className="h-72">
            {trend.length === 0 ? (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">{AR.common.empty}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ direction: 'rtl', borderRadius: 12 }} />
                  <Legend wrapperStyle={{ direction: 'rtl', fontSize: 12 }} />
                  <Line type="monotone" dataKey="إيرادات" stroke="#16A34A" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="مستحق" stroke="#0284C7" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="glass border-0 overflow-hidden">
        <CardHeader><CardTitle className="text-base">تفاصيل الاستحقاقات والمدفوعات</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{AR.invoice.dueDate}</TableHead>
                  <TableHead>{AR.payment.paymentDate}</TableHead>
                  <TableHead>اسم العميل</TableHead>
                  <TableHead>{AR.invoice.number}</TableHead>
                  <TableHead>{AR.invoice.amountDue}</TableHead>
                  <TableHead>{AR.invoice.amountPaid}</TableHead>
                  <TableHead>{AR.invoice.balance}</TableHead>
                  <TableHead>{AR.invoice.status}</TableHead>
                  <TableHead>{AR.payment.paymentMethod}</TableHead>
                  <TableHead>{AR.payment.referenceNumber}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailRows.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">{AR.common.empty}</TableCell></TableRow>
                ) : detailRows.map((row) => (
                  <TableRow key={row.invoice.id} data-testid="financial-detail-row">
                    <TableCell>{fmtDate(row.invoice.dueDate)}</TableCell>
                    <TableCell>{paymentDatesForInvoice(row.invoice.id)}</TableCell>
                    <TableCell>{customerById.get(row.invoice.customerId) || '—'}</TableCell>
                    <TableCell className="num font-semibold">{row.invoice.invoiceNumber}</TableCell>
                    <TableCell className="num">{fmtMoney(row.invoice.amountDue)}</TableCell>
                    <TableCell className="num text-success">{fmtMoney(row.paid)}</TableCell>
                    <TableCell className="num text-warning">{fmtMoney(row.balance)}</TableCell>
                    <TableCell>{AR.invoice.statuses[row.computedStatus]}</TableCell>
                    <TableCell>{paymentMethodsForInvoice(row.invoice.id)}</TableCell>
                    <TableCell className="num text-xs">{referencesForInvoice(row.invoice.id)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
