import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../database/db';
import { AR } from '../constants/arabicTerms';
import { fmtDate, fmtRelative } from '../utils/dateHelpers';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Activity, Search, Trash2, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../utils/excelExporter';
import { generateArabicPDF } from '../utils/pdfGenerator';
import type { ActivityModule } from '../models/types';

const MODULE_TONE: Record<string, string> = {
  properties:  'bg-accent/10 text-accent border-accent/20',
  customers:   'bg-success/10 text-success border-success/20',
  contracts:   'bg-warning/10 text-warning border-warning/20',
  payments:    'bg-primary/10 text-primary border-primary/20',
  maintenance: 'bg-destructive/10 text-destructive border-destructive/20',
  tasks:       'bg-purple-500/10 text-purple-600 border-purple-300/20',
  system:      'bg-muted text-muted-foreground border-border',
};

const MODULE_LABELS: Record<ActivityModule, string> = {
  properties:  'العقارات',
  customers:   'العملاء',
  contracts:   'العقود',
  payments:    'المدفوعات',
  maintenance: 'الصيانة',
  tasks:       'المهام',
  system:      'النظام',
};

export default function ActivityLog() {
  const logs = useLiveQuery(() => db.activityLogs.orderBy('timestamp').reverse().toArray(), []) || [];
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState<'all' | ActivityModule>('all');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (moduleFilter !== 'all' && l.module !== moduleFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!l.action.toLowerCase().includes(s) && !l.details.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [logs, search, moduleFilter]);

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const clearAll = async () => {
    if (!confirm('سيتم حذف كامل سجل النشاطات. هل أنت متأكد؟')) return;
    await db.activityLogs.clear();
    toast.success('تم مسح سجل النشاطات');
  };

  const exportExcel = () => {
    exportToExcel({
      filename: `سجل_النشاط_${new Date().toISOString().slice(0, 10)}`,
      sheetName: 'سجل النشاط',
      headers: ['الإجراء', 'القسم', 'التفاصيل', 'التاريخ والوقت'],
      rows: filtered.map((l) => [l.action, MODULE_LABELS[l.module] || l.module, l.details, l.timestamp instanceof Date ? l.timestamp : new Date(l.timestamp)]),
      columnWidths: [28, 14, 32, 20],
    });
    toast.success('تم تصدير ملف إكسل');
  };

  const exportPdf = async () => {
    try {
      await generateArabicPDF({
        title: AR.nav.activityLog,
        subtitle: `${filtered.length} سجل — ${new Date().toLocaleDateString('en-SA')}`,
        filename: `سجل_النشاط_${new Date().toISOString().slice(0, 10)}.pdf`,
        sections: [{
          table: {
            headers: ['الإجراء', 'القسم', 'التفاصيل', 'التاريخ'],
            rows: filtered.slice(0, 500).map((l) => [
              l.action,
              MODULE_LABELS[l.module as ActivityModule] || l.module,
              l.details,
              fmtDate(l.timestamp instanceof Date ? l.timestamp : new Date(l.timestamp)),
            ]),
          },
        }],
      });
      toast.success('تم تنزيل ملف PDF بنجاح');
    } catch (e: any) {
      toast.error('تعذّر إنشاء PDF: ' + (e.message || ''));
    }
  };

  return (
    <div className="space-y-4" data-testid="activity-log-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Activity className="h-6 w-6" /> {AR.nav.activityLog}</h2>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} سجل · تتبع جميع العمليات المنجزة في النظام.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportExcel}>{AR.actions.exportExcel}</Button>
          <Button variant="outline" onClick={exportPdf} className="gap-1.5" data-testid="export-pdf-button">
            <FileDown className="h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" className="text-destructive hover:text-destructive" onClick={clearAll}>
            <Trash2 className="h-4 w-4 ml-1" /> مسح السجل
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="glass border-0 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="ابحث في السجل…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pr-9" data-testid="activity-search-input" />
          </div>
          <Select value={moduleFilter} onValueChange={(v) => { setModuleFilter(v as any); setPage(0); }}>
            <SelectTrigger data-testid="module-filter"><SelectValue placeholder="القسم" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{AR.actions.all}</SelectItem>
              {(Object.keys(MODULE_LABELS) as ActivityModule[]).map((k) => <SelectItem key={k} value={k}>{MODULE_LABELS[k]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Timeline list */}
      <Card className="glass border-0 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{AR.common.date}</TableHead>
                <TableHead>الإجراء</TableHead>
                <TableHead>القسم</TableHead>
                <TableHead>التفاصيل</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">{AR.common.empty}</TableCell></TableRow>
              ) : paginated.map((log) => (
                <TableRow key={log.id} data-testid={`log-row-${log.id}`}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    <div>{fmtDate(log.timestamp)}</div>
                    <div className="text-[11px]">{fmtRelative(log.timestamp)}</div>
                  </TableCell>
                  <TableCell className="font-medium text-sm">{log.action}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${MODULE_TONE[log.module] || MODULE_TONE.system}`}>
                      {MODULE_LABELS[log.module] || log.module}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{log.details || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 py-3 border-t border-border/30">
            <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              {AR.actions.previous}
            </Button>
            <span className="text-sm text-muted-foreground num">{page + 1} / {totalPages}</span>
            <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}>
              {AR.actions.next}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
