import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../database/db';
import { AR } from '../constants/arabicTerms';
import { fmtDate, fmtMoney, toISODate } from '../utils/dateHelpers';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { BarChart3 } from 'lucide-react';
import { generateArabicPDF } from '../utils/pdfGenerator';
import { exportToExcel } from '../utils/excelExporter';
import { toast } from 'sonner';
import { startOfMonth, subMonths, endOfMonth, endOfDay, format, isWithinInterval } from 'date-fns';
import { ar } from 'date-fns/locale';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';

export default function FinancialReport() {
  const invoices = useLiveQuery(() => db.invoices.toArray(), []) || [];
  const payments = useLiveQuery(() => db.payments.toArray(), []) || [];
  const settings = useLiveQuery(() => db.settings.get('singleton'), []);

  const today = new Date();
  const [from, setFrom] = useState(toISODate(startOfMonth(subMonths(today, 5))));
  const [to, setTo] = useState(toISODate(endOfMonth(today)));

  const fromD = new Date(from);
  const toD = endOfDay(new Date(to));
  const filteredPayments = payments.filter((p) =>
    isWithinInterval(new Date(p.paymentDate), { start: fromD, end: toD })
  );
  const filteredInvoices = invoices.filter((i) =>
    isWithinInterval(new Date(i.dueDate), { start: fromD, end: toD })
  );

  const totalRevenue = filteredPayments.reduce((s, p) => s + p.amountPaid, 0);
  const totalDue = filteredInvoices.reduce((s, i) => s + i.amountDue, 0);
  const totalOutstanding = filteredInvoices.reduce((s, i) => s + (i.amountDue - i.amountPaid), 0);

  const trend = useMemo(() => {
    const months: Record<string, { name: string; إيرادات: number; مستحق: number }> = {};
    for (const p of filteredPayments) {
      const key = format(new Date(p.paymentDate), 'yyyy-MM');
      const name = format(new Date(p.paymentDate), 'MMM yy', { locale: ar });
      months[key] ||= { name, إيرادات: 0, مستحق: 0 };
      months[key].إيرادات += p.amountPaid;
    }
    for (const i of filteredInvoices) {
      const key = format(new Date(i.dueDate), 'yyyy-MM');
      const name = format(new Date(i.dueDate), 'MMM yy', { locale: ar });
      months[key] ||= { name, إيرادات: 0, مستحق: 0 };
      months[key].مستحق += i.amountDue;
    }
    return Object.entries(months).sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v);
  }, [filteredPayments, filteredInvoices]);

  const exportPdf = async () => {
    try {
      await generateArabicPDF({
        title: 'التقرير المالي الشامل',
        subtitle: `الفترة: ${fmtDate(fromD)} — ${fmtDate(toD)}`,
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
            heading: 'تفاصيل المدفوعات',
            table: {
              headers: [AR.payment.paymentDate, AR.payment.amountPaid, AR.payment.paymentMethod, AR.payment.referenceNumber],
              rows: filteredPayments.map((p) => [
                fmtDate(p.paymentDate),
                fmtMoney(p.amountPaid),
                AR.payment.methods[p.paymentMethod],
                p.referenceNumber || '—',
              ]),
            },
          },
        ],
        filename: `تقرير_مالي_${from}_${to}.pdf`,
      });
      toast.success('تم إنشاء التقرير');
    } catch (e: any) { toast.error('تعذّر إنشاء PDF: ' + (e.message || '')); }
  };

  const exportExcel = () => {
    exportToExcel({
      filename: `تقرير_مالي_${from}_${to}`,
      sheetName: 'التقرير المالي',
      headers: [AR.payment.paymentDate, AR.payment.amountPaid, AR.payment.paymentMethod, AR.payment.referenceNumber],
      rows: filteredPayments.map((p) => [
        p.paymentDate instanceof Date ? p.paymentDate : new Date(p.paymentDate),
        p.amountPaid,
        AR.payment.methods[p.paymentMethod],
        p.referenceNumber || '',
      ]),
      columnWidths: [16, 14, 20, 18],
    });
    toast.success('تم تصدير ملف إكسل');
  };

  return (
    <div className="space-y-4" data-testid="financial-report-page">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6" /> {AR.reports.financialTitle}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">تحليل مالي مفصل قابل للتصدير — الإيرادات والاستحقاقات خلال الفترة.</p>
      </div>

      <Card className="glass border-0">
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-6">
          <div className="space-y-1.5">
            <Label className="text-xs">{AR.common.from}</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="report-from-input" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{AR.common.to}</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="report-to-input" />
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
        <CardHeader><CardTitle className="text-base">تفاصيل المدفوعات</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{AR.payment.paymentDate}</TableHead>
                  <TableHead>{AR.payment.amountPaid}</TableHead>
                  <TableHead>{AR.payment.paymentMethod}</TableHead>
                  <TableHead>{AR.payment.referenceNumber}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayments.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">{AR.common.empty}</TableCell></TableRow>
                ) : filteredPayments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{fmtDate(p.paymentDate)}</TableCell>
                    <TableCell className="num">{fmtMoney(p.amountPaid)}</TableCell>
                    <TableCell>{AR.payment.methods[p.paymentMethod]}</TableCell>
                    <TableCell className="num text-xs">{p.referenceNumber || '—'}</TableCell>
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
