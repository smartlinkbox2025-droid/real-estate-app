import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../database/db';
import { AR } from '../constants/arabicTerms';
import type { MaintenanceItem, MaintenanceStatus, MaintenancePriority } from '../models/types';
import { createMaintenanceItem, updateMaintenanceItem, deleteMaintenanceItem } from '../database/queries';
import { fmtDate, fmtMoney, toISODate } from '../utils/dateHelpers';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Plus, Pencil, Trash2, Wrench, CheckCircle2, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../utils/excelExporter';
import { generateArabicPDF } from '../utils/pdfGenerator';
import {
  isValidInternationalPhone,
  normalizeCountryCode,
  normalizeInternationalPhone,
} from '../utils/phoneHelpers';

const STATUS_TONE: Record<MaintenanceStatus, string> = {
  pending:     'bg-warning/15 text-warning border-warning/30',
  in_progress: 'bg-accent/15 text-accent border-accent/30',
  completed:   'bg-success/15 text-success border-success/30',
  canceled:    'bg-muted text-muted-foreground border-border',
};

const PRIORITY_TONE: Record<MaintenancePriority, string> = {
  low:    'bg-muted text-muted-foreground border-border',
  medium: 'bg-accent/10 text-accent border-accent/20',
  high:   'bg-warning/15 text-warning border-warning/30',
  urgent: 'bg-destructive/15 text-destructive border-destructive/30',
};

export default function Maintenance() {
  const items      = useLiveQuery(() => db.maintenance.toArray(), []) || [];
  const properties = useLiveQuery(() => db.properties.toArray(), []) || [];
  const settings   = useLiveQuery(() => db.settings.get('singleton'), []);
  const [statusFilter, setStatusFilter] = useState<'all' | MaintenanceStatus>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceItem | null>(null);

  const propName = (id: string) => properties.find((p) => p.id === id)?.name || '—';

  const filtered = useMemo(() =>
    statusFilter === 'all' ? items : items.filter((i) => i.status === statusFilter),
    [items, statusFilter]);

  const totalCost = useMemo(() => filtered.reduce((s, i) => s + (i.cost || 0), 0), [filtered]);

  const onDelete = async (id: string, title: string) => {
    if (!confirm(`${AR.common.confirmDelete}\n${title}`)) return;
    try { await deleteMaintenanceItem(id); toast.success('تم حذف طلب الصيانة'); }
    catch (e: any) { toast.error(e.message || AR.common.error); }
  };

  const markCompleted = async (id: string) => {
    await updateMaintenanceItem(id, { status: 'completed', completedDate: new Date() });
    toast.success('تم تحديد الطلب كمكتمل');
  };

  const exportExcel = () => {
    exportToExcel({
      filename: `الصيانة_${new Date().toISOString().slice(0, 10)}`,
      sheetName: 'الصيانة',
      headers: ['العقار', 'العنوان', 'الأولوية', 'الحالة', 'التكلفة', 'المقاول', 'تاريخ الجدولة', 'تاريخ الإتمام'],
      rows: filtered.map((i) => [propName(i.propertyId), i.title, AR.maintenance.priorities[i.priority], AR.maintenance.statuses[i.status], i.cost || 0, i.vendorName || '', i.scheduledDate ? fmtDate(i.scheduledDate) : '', i.completedDate ? fmtDate(i.completedDate) : '']),
      columnWidths: [24, 28, 12, 14, 12, 20, 14, 14],
    });
    toast.success('تم تصدير ملف إكسل');
  };

  const exportPdf = async () => {
    try {
      await generateArabicPDF({
        title: AR.maintenance.title,
        subtitle: `إجمالي التكاليف: ${fmtMoney(totalCost)}`,
        filename: `الصيانة_${new Date().toISOString().slice(0, 10)}.pdf`,
        sections: [{
          table: {
            headers: ['العقار', 'العنوان', 'الأولوية', 'الحالة', 'التكلفة', 'المقاول', 'تاريخ الجدولة'],
            rows: filtered.map((i) => [
              propName(i.propertyId), i.title,
              AR.maintenance.priorities[i.priority],
              AR.maintenance.statuses[i.status],
              fmtMoney(i.cost || 0),
              i.vendorName || '—',
              i.scheduledDate ? fmtDate(i.scheduledDate) : '—',
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
    <div className="space-y-4" data-testid="maintenance-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Wrench className="h-6 w-6" /> {AR.maintenance.title}</h2>
          <p className="text-sm text-muted-foreground mt-1">إجمالي التكاليف: <span className="font-bold num">{fmtMoney(totalCost)}</span></p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="الحالة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{AR.actions.all}</SelectItem>
              {(Object.keys(AR.maintenance.statuses) as MaintenanceStatus[]).map((k) => <SelectItem key={k} value={k}>{AR.maintenance.statuses[k]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportExcel}>{AR.actions.exportExcel}</Button>
          <Button variant="outline" onClick={exportPdf} className="gap-1.5" data-testid="export-pdf-button">
            <FileDown className="h-4 w-4" /> PDF
          </Button>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-1.5">
            <Plus className="h-4 w-4" /> {AR.maintenance.addNew}
          </Button>
        </div>
      </div>

      <Card className="glass border-0 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{AR.contract.property}</TableHead>
                <TableHead>{AR.common.title}</TableHead>
                <TableHead>{AR.common.priority}</TableHead>
                <TableHead>{AR.common.status}</TableHead>
                <TableHead>{AR.common.cost}</TableHead>
                <TableHead>{AR.common.vendor}</TableHead>
                <TableHead>{AR.common.date_scheduled}</TableHead>
                <TableHead className="text-left">{AR.actions.edit}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">{AR.common.empty}</TableCell></TableRow>
              ) : filtered.map((item) => (
                <TableRow key={item.id} data-testid={`maintenance-row-${item.id}`}>
                  <TableCell className="font-medium">{propName(item.propertyId)}</TableCell>
                  <TableCell>{item.title}</TableCell>
                  <TableCell><Badge variant="outline" className={PRIORITY_TONE[item.priority]}>{AR.maintenance.priorities[item.priority]}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_TONE[item.status]}>{AR.maintenance.statuses[item.status]}</Badge></TableCell>
                  <TableCell className="num">{item.cost ? fmtMoney(item.cost) : '—'}</TableCell>
                  <TableCell>{item.vendorName || '—'}</TableCell>
                  <TableCell className="text-xs">{item.scheduledDate ? fmtDate(item.scheduledDate) : '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {item.status !== 'completed' && (
                        <Button size="icon" variant="ghost" className="text-success" onClick={() => markCompleted(item.id!)} title="تحديد كمكتمل"><CheckCircle2 className="h-4 w-4" /></Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(item); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => onDelete(item.id!, item.title)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <MaintenanceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        properties={properties}
        countryCode={settings?.countryCode || '966'}
      />
    </div>
  );
}

function MaintenanceDialog({
  open,
  onOpenChange,
  editing,
  properties,
  countryCode,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: MaintenanceItem | null;
  properties: any[];
  countryCode: string;
}) {
  const [form, setForm] = useState<Partial<MaintenanceItem>>({});
  const normalizedCountryCode = normalizeCountryCode(countryCode) || '966';

  useEffect(() => {
    if (editing) setForm({
      ...editing,
      vendorPhone: editing.vendorPhone || '',
    });
    else setForm({ propertyId: '', title: '', description: '', status: 'pending', priority: 'medium', cost: 0, vendorName: '', vendorPhone: '' });
  }, [editing, open]);

  const submit = async () => {
    if (!form.propertyId || !form.title) { toast.error('يرجى اختيار العقار وإدخال عنوان الطلب'); return; }
    const vendorPhone = form.vendorPhone ? normalizeInternationalPhone(form.vendorPhone, normalizedCountryCode) : '';
    if (vendorPhone && !isValidInternationalPhone(vendorPhone, normalizedCountryCode)) {
      toast.error(`أدخل رقم جوال صحيحاً بالرمز الدولي +${normalizedCountryCode}`);
      return;
    }
    try {
      if (editing?.id) { await updateMaintenanceItem(editing.id, { ...form, vendorPhone }); toast.success('تم تحديث طلب الصيانة'); }
      else {
        await createMaintenanceItem({ propertyId: form.propertyId!, title: form.title!, description: form.description || '', status: form.status as MaintenanceStatus || 'pending', priority: form.priority as MaintenancePriority || 'medium', cost: Number(form.cost) || 0, vendorName: form.vendorName, vendorPhone: vendorPhone || undefined, scheduledDate: form.scheduledDate });
        toast.success('تم إضافة طلب الصيانة');
      }
      onOpenChange(false);
    } catch (e: any) { toast.error(e.message || AR.common.error); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{editing ? AR.maintenance.editTitle : AR.maintenance.addNew}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label={AR.maintenance.property}>
            <Select value={form.propertyId || ''} onValueChange={(v) => setForm({ ...form, propertyId: v })}>
              <SelectTrigger><SelectValue placeholder="اختر العقار" /></SelectTrigger>
              <SelectContent>{properties.map((p) => <SelectItem key={p.id} value={p.id!}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label={AR.common.title}><Input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label={AR.common.priority}>
            <Select value={form.priority || 'medium'} onValueChange={(v) => setForm({ ...form, priority: v as MaintenancePriority })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(AR.maintenance.priorities) as MaintenancePriority[]).map((k) => <SelectItem key={k} value={k}>{AR.maintenance.priorities[k]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label={AR.common.status}>
            <Select value={form.status || 'pending'} onValueChange={(v) => setForm({ ...form, status: v as MaintenanceStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(AR.maintenance.statuses) as MaintenanceStatus[]).map((k) => <SelectItem key={k} value={k}>{AR.maintenance.statuses[k]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label={AR.common.cost}><Input type="number" value={form.cost ?? 0} onChange={(e) => setForm({ ...form, cost: parseFloat(e.target.value) })} /></Field>
          <Field label={AR.common.date_scheduled}><Input type="date" value={form.scheduledDate ? toISODate(new Date(form.scheduledDate)) : ''} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value ? new Date(e.target.value) : undefined })} /></Field>
          <Field label={AR.common.vendor}><Input value={form.vendorName || ''} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} /></Field>
          <Field label={`${AR.common.phone} (+${normalizedCountryCode})`}>
            <Input
              dir="ltr"
              inputMode="tel"
              placeholder={`${normalizedCountryCode}XXXXXXXXX`}
              value={form.vendorPhone || ''}
              onChange={(e) => setForm({ ...form, vendorPhone: e.target.value })}
              onBlur={(e) => setForm({
                ...form,
                vendorPhone: normalizeInternationalPhone(e.target.value, normalizedCountryCode),
              })}
            />
          </Field>
          <Field label={AR.maintenance.description} className="md:col-span-2"><Textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{AR.actions.cancel}</Button>
          <Button onClick={submit}>{AR.actions.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`space-y-1.5 ${className}`}><Label className="text-xs">{label}</Label>{children}</div>;
}
