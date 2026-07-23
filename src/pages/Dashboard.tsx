import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../database/db';
import { AR } from '../constants/arabicTerms';
import { fmtMoney, fmtDate, fmtRelative } from '../utils/dateHelpers';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  Building2, Users, FileText, Wallet, AlertTriangle, TrendingUp, Home, Printer, FileSpreadsheet,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { format, startOfMonth, subMonths, isSameMonth } from 'date-fns';
import { ar } from 'date-fns/locale';
import { generateArabicPDF } from '../utils/pdfGenerator';
import { exportToExcel } from '../utils/excelExporter';
import { toast } from 'sonner';

const CHART_COLORS = ['#0284C7', '#16A34A', '#CA8A04', '#DC2626', '#7C3AED'];

export default function Dashboard() {
  const properties = useLiveQuery(() => db.properties.toArray(), []) || [];
  const customers  = useLiveQuery(() => db.customers.toArray(), []) || [];
  const contracts  = useLiveQuery(() => db.contracts.toArray(), []) || [];
  const invoices   = useLiveQuery(() => db.invoices.toArray(), []) || [];
  const payments   = useLiveQuery(() => db.payments.toArray(), []) || [];
  const activities = useLiveQuery(
    () => db.activityLogs.orderBy('timestamp').reverse().limit(8).toArray(), []
  ) || [];
  const settings = useLiveQuery(() => db.settings.get('singleton'), []);

  const activeContracts = contracts.filter((c) => c.status === 'active').length;
  const rented = properties.filter((p) => p.status === 'rented' || p.status === 'sold').length;
  const occupancy = properties.length ? Math.round((rented / properties.length) * 100) : 0;
  const overdueCount = invoices.filter((i) => i.status === 'overdue').length;

  const monthlyIncome = useMemo(() => {
    const now = new Date();
    return payments
      .filter((p) => isSameMonth(new Date(p.paymentDate), now))
      .reduce((s, p) => s + (p.amountPaid || 0), 0);
  }, [payments]);

  const revenueData = useMemo(() => {
    const months: { name: string; إيرادات: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = startOfMonth(subMonths(new Date(), i));
      const label = format(m, 'MMM', { locale: ar });
      const revenue = payments
        .filter((p) => isSameMonth(new Date(p.paymentDate), m))
        .reduce((s, p) => s + (p.amountPaid || 0), 0);
      months.push({ name: label, إيرادات: Math.round(revenue) });
    }
    return months;
  }, [payments]);

  const distribution = useMemo(() => {
    const map: Record<string, number> = {};
    properties.forEach((p) => { map[p.type] = (map[p.type] || 0) + 1; });
    return Object.entries(map).map(([k, v]) => ({
      name: AR.property.types[k as keyof typeof AR.property.types] || k,
      value: v,
    }));
  }, [properties]);

  const upcoming = useMemo(() =>
    invoices
      .filter((i) => i.status !== 'paid')
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 5),
    [invoices]);

  const exportPdf = async () => {
    try {
      await generateArabicPDF({
        title: AR.dashboard.welcome,
        subtitle: fmtDate(new Date()),
        companyName: settings?.companyName,
        logoBase64: settings?.logoBase64,
        sections: [
          {
            heading: 'ملخص الأداء',
            table: {
              headers: ['المؤشر', 'القيمة'],
              rows: [
                [AR.dashboard.totalProperties, properties.length],
                [AR.dashboard.activeContracts, activeContracts],
                [AR.dashboard.totalCustomers, customers.length],
                [AR.dashboard.monthlyIncome, fmtMoney(monthlyIncome)],
                [AR.dashboard.overdueInvoices, overdueCount],
                [AR.dashboard.occupancyRate, `${occupancy}%`],
              ],
            },
          },
          {
            heading: AR.dashboard.upcomingDues,
            table: {
              headers: [AR.invoice.number, AR.invoice.dueDate, AR.invoice.balance],
              rows: upcoming.map((i) => [
                i.invoiceNumber,
                fmtDate(i.dueDate),
                fmtMoney(i.amountDue - i.amountPaid),
              ]),
            },
          },
        ],
        filename: `ملخص_لوحة_المعلومات_${new Date().toISOString().slice(0, 10)}.pdf`,
      });
      toast.success('تم إنشاء التقرير');
    } catch (e: any) {
      toast.error('تعذّر إنشاء PDF: ' + (e.message || ''));
    }
  };

  const exportExcel = () => {
    exportToExcel({
      filename: `ملخص_لوحة_المعلومات_${new Date().toISOString().slice(0, 10)}`,
      sheetName: 'لوحة المعلومات',
      headers: ['المؤشر', 'القيمة'],
      rows: [
        [AR.dashboard.totalProperties, properties.length],
        [AR.dashboard.activeContracts, activeContracts],
        [AR.dashboard.totalCustomers, customers.length],
        [AR.dashboard.monthlyIncome, fmtMoney(monthlyIncome)],
        [AR.dashboard.overdueInvoices, overdueCount],
        [AR.dashboard.occupancyRate, `${occupancy}%`],
        ...revenueData.map((m) => [`إيرادات ${m.name}`, m.إيرادات]),
      ],
      columnWidths: [30, 20],
    });
    toast.success('تم تصدير ملف إكسل');
  };

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl lg:text-3xl font-bold">{AR.dashboard.welcome}</h2>
          <p className="text-muted-foreground text-sm mt-1">نظرة شاملة على أعمالك — {fmtDate(new Date())}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1.5" data-testid="dashboard-excel-button">
            <FileSpreadsheet className="h-4 w-4" /> {AR.actions.exportExcel}
          </Button>
          <Button size="sm" onClick={exportPdf} className="gap-1.5" data-testid="dashboard-pdf-button">
            <Printer className="h-4 w-4" /> {AR.actions.exportPdf}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <Kpi icon={Building2}    label={AR.dashboard.totalProperties} value={properties.length}     tone="accent"   testId="kpi-properties" />
        <Kpi icon={FileText}     label={AR.dashboard.activeContracts} value={activeContracts}        tone="success"  testId="kpi-active-contracts" />
        <Kpi icon={Users}        label={AR.dashboard.totalCustomers}  value={customers.length}       tone="accent"   testId="kpi-customers" />
        <Kpi icon={Wallet}       label={AR.dashboard.monthlyIncome}   value={fmtMoney(monthlyIncome)} tone="primary" testId="kpi-monthly-income" />
        <Kpi icon={AlertTriangle} label={AR.dashboard.overdueInvoices} value={overdueCount}          tone="warning"  testId="kpi-overdue" />
        <Kpi icon={Home}         label={AR.dashboard.occupancyRate}   value={`${occupancy}%`}        tone="success"  testId="kpi-occupancy" />
        <Kpi icon={TrendingUp}   label="إجمالي الفواتير"             value={invoices.length}         tone="accent"   testId="kpi-total-invoices" />
        <Kpi icon={Wallet}       label="إجمالي المدفوعات"            value={payments.length}         tone="primary"  testId="kpi-total-payments" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="glass lg:col-span-2 border-0">
          <CardHeader>
            <CardTitle className="text-base">{AR.dashboard.revenueByMonth}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64" data-testid="chart-revenue">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ direction: 'rtl', borderRadius: 12, border: '1px solid #E2E8F0' }} cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} />
                  <Bar dataKey="إيرادات" fill="#0284C7" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-0">
          <CardHeader>
            <CardTitle className="text-base">{AR.dashboard.propertyDistribution}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64" data-testid="chart-distribution">
              {distribution.length === 0 ? (
                <div className="h-full grid place-items-center text-sm text-muted-foreground">{AR.common.empty}</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={distribution} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                      {distribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Legend wrapperStyle={{ direction: 'rtl', fontSize: 11 }} />
                    <Tooltip contentStyle={{ direction: 'rtl', borderRadius: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass border-0">
          <CardHeader><CardTitle className="text-base">{AR.dashboard.upcomingDues}</CardTitle></CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">{AR.dashboard.noUpcoming}</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between rounded-xl px-4 py-3 bg-muted/50" data-testid={`upcoming-invoice-${inv.id}`}>
                    <div>
                      <span className="text-sm font-semibold">{inv.invoiceNumber}</span>
                      <div className="text-xs text-muted-foreground">{AR.invoice.dueDate}: {fmtDate(inv.dueDate)}</div>
                    </div>
                    <div className="text-sm font-bold num">{fmtMoney(inv.amountDue - inv.amountPaid)}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-0">
          <CardHeader><CardTitle className="text-base">{AR.dashboard.recentActivity}</CardTitle></CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">{AR.dashboard.noActivity}</p>
            ) : (
              <ul className="space-y-2">
                {activities.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-3 py-2">
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-accent shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{a.action}</div>
                      <div className="text-xs text-muted-foreground">
                        {a.details && <span>{a.details} · </span>}
                        {fmtRelative(a.timestamp)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone, testId }: {
  icon: any; label: string; value: string | number; tone: 'accent' | 'success' | 'warning' | 'primary'; testId: string;
}) {
  const toneMap: Record<string, string> = {
    accent: 'bg-accent/10 text-accent', success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning', primary: 'bg-primary/10 text-primary',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="glass rounded-2xl p-4 lg:p-5 flex flex-col gap-3"
      data-testid={testId}
    >
      <div className="flex items-start justify-between">
        <span className="text-xs text-muted-foreground leading-tight">{label}</span>
        <span className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 ${toneMap[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="text-2xl lg:text-3xl font-bold num truncate">{value}</div>
    </motion.div>
  );
}
