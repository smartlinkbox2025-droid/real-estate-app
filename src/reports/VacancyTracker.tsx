import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../database/db';
import { AR } from '../constants/arabicTerms';
import { fmtMoney, fmtDate } from '../utils/dateHelpers';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { FileText, HomeIcon, Search } from 'lucide-react';
import type { Property, PropertyStatus } from '../models/types';
import { exportToExcel } from '../utils/excelExporter';
import { generateArabicPDF } from '../utils/pdfGenerator';
import { toast } from 'sonner';
import { calculateOccupancyStats } from '../utils/buildingUnits';
import { buildPropertyPdfSections } from '../utils/propertyPdf';

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
  const [search, setSearch] = useState('');

  const enriched = useMemo(() => properties.map((p) => {
    const activeContracts = contracts.filter(
      (contract) => contract.propertyId === p.id
        && (contract.status === 'active' || contract.status === 'extended'),
    );
    const activeCustomers = activeContracts
      .map((contract) => customers.find((customer) => customer.id === contract.customerId))
      .filter(Boolean);
    return {
      p,
      activeContracts,
      customerNames: [...new Set(activeCustomers.map((customer) => customer!.fullName))],
    };
  }), [properties, contracts, customers]);

  const filteredEnriched = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('ar');
    if (!term) return enriched;
    return enriched.filter(({ p, customerNames }) => [
      p.name,
      AR.property.types[p.type],
      AR.property.statuses[p.status],
      p.city,
      p.address,
      p.ownerName || '',
      p.notes || '',
      ...customerNames,
      ...(p.buildingDetails?.units.flatMap((unit) => [
        unit.number,
        AR.property.statuses[unit.status],
        unit.notes || '',
      ]) || []),
    ].some((value) => String(value).toLocaleLowerCase('ar').includes(term)));
  }, [enriched, search]);

  const stats = useMemo(() => {
    const filteredProperties = filteredEnriched.map(({ p }) => p);
    const occupancyStats = calculateOccupancyStats(filteredProperties);
    const totalValue = filteredProperties.reduce((sum, property) => sum + (property.price || 0), 0);
    return { ...occupancyStats, totalValue };
  }, [filteredEnriched]);

  const exportPropertyPdf = async (property: Property) => {
    try {
      await generateArabicPDF({
        title: `بيانات العقار: ${property.name}`,
        subtitle: `تقرير تفصيلي - ${fmtDate(new Date())}`,
        companyName: settings?.companyName,
        logoBase64: settings?.logoBase64,
        pageOrientation: property.type === 'building' ? 'landscape' : 'portrait',
        sections: buildPropertyPdfSections(property, contracts, customers),
        filename: `بيانات_العقار_${property.name.replace(/[\\/:*?"<>|]/g, '_')}.pdf`,
      });
      toast.success('تم إنشاء ملف بيانات العقار');
    } catch (error: any) {
      toast.error('تعذّر إنشاء ملف العقار: ' + (error.message || ''));
    }
  };

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
                ['إجمالي العقارات والوحدات', stats.total],
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
              rows: filteredEnriched.map(({ p, customerNames }) => [
                p.name,
                AR.property.types[p.type],
                AR.property.statuses[p.status],
                p.city,
                customerNames.join('، ') || '—',
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
      rows: filteredEnriched.map(({ p, customerNames }) => [
        p.name, AR.property.types[p.type], AR.property.statuses[p.status],
        p.city, p.address, p.price, customerNames.join('، ') || '—',
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
        <div className="flex w-full sm:w-auto flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث باسم العقار أو المالك أو المدينة…"
              className="pr-9"
              data-testid="vacancy-search-input"
            />
          </div>
          <Button variant="outline" onClick={exportExcel} data-testid="vacancy-excel-button">{AR.actions.exportExcel}</Button>
          <Button onClick={exportPdf} data-testid="vacancy-pdf-button">{AR.actions.exportPdf}</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="إجمالي العقارات والوحدات" value={stats.total}         tone="primary" />
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
            <Table className="min-w-[64rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>{AR.property.name}</TableHead>
                  <TableHead>{AR.property.type}</TableHead>
                  <TableHead>{AR.property.status}</TableHead>
                  <TableHead>{AR.property.city}</TableHead>
                  <TableHead>{AR.property.price}</TableHead>
                  <TableHead>المستأجر / المشتري</TableHead>
                  <TableHead>تاريخ انتهاء العقد</TableHead>
                  <TableHead className="text-left">ملف العقار</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEnriched.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">{AR.common.empty}</TableCell></TableRow>
                ) : filteredEnriched.map(({ p, customerNames, activeContracts }) => (
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
                    <TableCell>{customerNames.join('، ') || '—'}</TableCell>
                    <TableCell className="text-xs">
                      {activeContracts.length
                        ? activeContracts.map((contract) => fmtDate(contract.endDate)).join('، ')
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 whitespace-nowrap"
                        onClick={() => exportPropertyPdf(p)}
                        data-testid={`vacancy-property-pdf-${p.id}`}
                      >
                        <FileText className="h-4 w-4" />
                        PDF
                      </Button>
                    </TableCell>
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
