import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../database/db';
import { AR } from '../constants/arabicTerms';
import { fmtMoney, fmtDate } from '../utils/dateHelpers';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { HomeIcon } from 'lucide-react';
import type { PropertyStatus } from '../models/types';
import { exportToExcel } from '../utils/excelExporter';
import { generateArabicPDF } from '../utils/pdfGenerator';
import { toast } from 'sonner';

const STATUS_TONE: Record<PropertyStatus, string> = {
  vacant:   'bg-warning/15 text-warning border-warning/30',
  rented:   'bg-success/15 text-success border-success/30',
  sold:     'bg-accent/15 text-accent border-accent/30',
  archived: 'bg-muted text-muted-foreground border-border',
};

export default function VacancyTracker() {
  const properties = useLiveQuery(() => db.properties.toArray(), []) || [];
  const contracts  = useLiveQuery(() => db.contracts.toArray(), []) || [];
  const customers  = useLiveQuery(() => db.customers.toArray(), []) || [];
  const settings   = useLiveQuery(() => db.settings.get('singleton'), []);

  const stats = useMemo(() => {
    const total = properties.length;
    const vacant = properties.filter((p) => p.status === 'vacant').length;
    const rented = properties.filter((p) => p.status === 'rented').length;
    const sold   = properties.filter((p) => p.status === 'sold').length;
    const occupancy = total ? Math.round(((rented + sold) / total) * 100) : 0;
    const totalValue = properties.reduce((s, p) => s + (p.price || 0), 0);
    return { total, vacant, rented, sold, occupancy, totalValue };
  }, [properties]);

  const enriched = properties.map((p) => {
    const contract = contracts.find((c) => c.propertyId === p.id && (c.status === 'active' || c.status === 'extended'));
    const customer = contract ? customers.find((c) => c.id === contract.customerId) : undefined;
    return { p, contract, customer };
  });

  const exportPdf = async () => {
    try {
      await generateArabicPDF({
        title: AR.reports.vacancyTitle,
        subtitle: fmtDate(new Date()),
        companyName: settings?.companyName,
        logoBase64: settings?.logoBase64,
        sections: [
          {
            heading: 'الملخص',
            table: {
              headers: ['البند', 'القيمة'],
              rows: [
                ['إجمالي العقارات', stats.total],
                ['الشاغرة', stats.vacant],
                ['المؤجرة', stats.rented],
                ['المباعة', stats.sold],
                ['نسبة الإشغال', `${stats.occupancy}%`],
                ['إجمالي القيمة السوقية', fmtMoney(stats.totalValue)],
              ],
            },
          },
          {
            heading: 'تفاصيل العقارات',
            table: {
              headers: ['الاسم', 'النوع', 'الحالة', 'المدينة', 'المستأجر/المشتري'],
              rows: enriched.map(({ p, customer }) => [
                p.name,
                AR.property.types[p.type],
                AR.property.statuses[p.status],
                p.city,
                customer?.fullName || '—',
              ]),
            },
          },
        ],
        filename: `تقرير_الشواغر_${new Date().toISOString().slice(0, 10)}.pdf`,
      });
      toast.success('تم إنشاء التقرير');
    } catch (e: any) { toast.error('تعذّر إنشاء PDF: ' + (e.message || '')); }
  };

  const exportExcel = () => {
    exportToExcel({
      filename: `تقرير_الشواغر_${new Date().toISOString().slice(0, 10)}`,
      sheetName: 'الشواغر',
      headers: ['الاسم', 'النوع', 'الحالة', 'المدينة', 'العنوان', 'السعر', 'المستأجر / المشتري'],
      rows: enriched.map(({ p, customer }) => [
        p.name, AR.property.types[p.type], AR.property.statuses[p.status],
        p.city, p.address, p.price, customer?.fullName || '—',
      ]),
      columnWidths: [24, 12, 12, 14, 30, 14, 24],
    });
    toast.success('تم تصدير ملف إكسل');
  };

  return (
    <div className="space-y-4" data-testid="vacancy-report-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <HomeIcon className="h-6 w-6" /> {AR.reports.vacancyTitle}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">حالة كل عقار مع المستأجر أو المشتري الحالي.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportExcel} data-testid="vacancy-excel-button">{AR.actions.exportExcel}</Button>
          <Button onClick={exportPdf} data-testid="vacancy-pdf-button">{AR.actions.exportPdf}</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="إجمالي العقارات"   value={stats.total}                tone="primary" />
        <StatCard label="شاغرة"              value={stats.vacant}               tone="warning" />
        <StatCard label="مؤجرة"              value={stats.rented}               tone="success" />
        <StatCard label="مباعة"              value={stats.sold}                 tone="accent" />
        <StatCard label="نسبة الإشغال"       value={`${stats.occupancy}%`}      tone="success" />
        <StatCard label="القيمة الإجمالية"   value={fmtMoney(stats.totalValue)} tone="primary" />
      </div>

      <Card className="glass border-0 overflow-hidden">
        <CardHeader><CardTitle className="text-base">تفصيل العقارات</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{AR.property.name}</TableHead>
                  <TableHead>{AR.property.type}</TableHead>
                  <TableHead>{AR.property.status}</TableHead>
                  <TableHead>{AR.property.city}</TableHead>
                  <TableHead>{AR.property.price}</TableHead>
                  <TableHead>المستأجر / المشتري</TableHead>
                  <TableHead>تاريخ انتهاء العقد</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enriched.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{AR.common.empty}</TableCell></TableRow>
                ) : enriched.map(({ p, customer, contract }) => (
                  <TableRow key={p.id} data-testid={`vacancy-row-${p.id}`}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{AR.property.types[p.type]}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_TONE[p.status]}>
                        {AR.property.statuses[p.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>{p.city}</TableCell>
                    <TableCell className="num">{fmtMoney(p.price)}</TableCell>
                    <TableCell>{customer?.fullName || '—'}</TableCell>
                    <TableCell className="text-xs">{contract ? fmtDate(contract.endDate) : '—'}</TableCell>
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

function StatCard({ label, value, tone }: { label: string; value: string | number; tone: 'primary' | 'accent' | 'success' | 'warning' }) {
  const toneMap: Record<string, string> = {
    primary: 'text-primary',
    accent:  'text-accent',
    success: 'text-success',
    warning: 'text-warning',
  };
  return (
    <Card className="glass border-0">
      <CardContent className="pt-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-xl lg:text-2xl font-bold num mt-1 ${toneMap[tone]}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
