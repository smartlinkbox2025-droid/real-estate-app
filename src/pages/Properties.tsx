import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../database/db';
import { AR, CITIES_SA } from '../constants/arabicTerms';
import type { Property, PropertyStatus, PropertyType } from '../models/types';
import { createProperty, updateProperty, deleteProperty } from '../database/queries';
import { fmtMoney, fmtDate } from '../utils/dateHelpers';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Plus, Pencil, Trash2, Search, Building2, ArrowUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../utils/excelExporter';
import { generateArabicPDF } from '../utils/pdfGenerator';

const STATUS_TONE: Record<PropertyStatus, string> = {
  vacant:   'bg-warning/15 text-warning border-warning/30',
  rented:   'bg-success/15 text-success border-success/30',
  sold:     'bg-accent/15 text-accent border-accent/30',
  archived: 'bg-muted text-muted-foreground border-border',
};

type SortField = 'name' | 'price' | 'createdAt';

export default function Properties() {
  const properties = useLiveQuery(() => db.properties.toArray(), []) || [];
  const settings   = useLiveQuery(() => db.settings.get('singleton'), []);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter]     = useState<'all' | PropertyType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | PropertyStatus>('all');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('desc');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing]   = useState<Property | null>(null);

  const filtered = useMemo(() => {
    let list = properties.filter((p) => {
      if (search) {
        const s = search.toLowerCase();
        if (!p.name.toLowerCase().includes(s) && !p.address.toLowerCase().includes(s) && !p.city.toLowerCase().includes(s)) return false;
      }
      if (typeFilter !== 'all' && p.type !== typeFilter) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      const min = parseFloat(minPrice); const max = parseFloat(maxPrice);
      if (!isNaN(min) && p.price < min) return false;
      if (!isNaN(max) && p.price > max) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      let av: any = a[sortField]; let bv: any = b[sortField];
      if (av instanceof Date) av = av.getTime();
      if (bv instanceof Date) bv = bv.getTime();
      if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return list;
  }, [properties, search, typeFilter, statusFilter, minPrice, maxPrice, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const onDelete = async (id: string, name: string) => {
    if (!confirm(`${AR.common.confirmDelete}\n${name}`)) return;
    try { await deleteProperty(id); toast.success('تم حذف العقار'); }
    catch (e: any) { toast.error(e.message || AR.common.error); }
  };

  const exportExcel = () => {
    exportToExcel({
      filename: `العقارات_${new Date().toISOString().slice(0, 10)}`,
      sheetName: 'العقارات',
      headers: ['الاسم', 'النوع', 'الحالة', 'المدينة', 'العنوان', 'السعر', 'ملاحظات', 'تاريخ الإضافة'],
      rows: filtered.map((p) => [p.name, AR.property.types[p.type], AR.property.statuses[p.status], p.city, p.address, p.price, p.notes || '', p.createdAt]),
      columnWidths: [26, 12, 12, 14, 30, 14, 24, 14],
    });
    toast.success('تم تصدير ملف إكسل');
  };

  const exportPdf = async () => {
    try {
      await generateArabicPDF({
        title: 'تقرير العقارات',
        subtitle: `${filtered.length} عقاراً · ${fmtDate(new Date())}`,
        companyName: settings?.companyName,
        logoBase64: settings?.logoBase64,
        sections: [{
          table: {
            headers: ['#', 'الاسم', 'النوع', 'الحالة', 'المدينة', 'السعر'],
            rows: filtered.map((p, idx) => [idx + 1, p.name, AR.property.types[p.type], AR.property.statuses[p.status], p.city, fmtMoney(p.price)]),
          },
        }],
      });
      toast.success('تم إنشاء ملف PDF');
    } catch (e: any) { toast.error('تعذّر إنشاء PDF: ' + (e.message || '')); }
  };

  return (
    <div className="space-y-4" data-testid="properties-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6" /> {AR.nav.properties}</h2>
          <p className="text-sm text-muted-foreground mt-1">إدارة كاملة لعقاراتك مع بحث وتصفية فورية.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={exportExcel} data-testid="export-excel-button">{AR.actions.exportExcel}</Button>
          <Button variant="outline" onClick={exportPdf} data-testid="export-pdf-button">{AR.actions.exportPdf}</Button>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }} data-testid="add-property-button" className="gap-1.5">
            <Plus className="h-4 w-4" /> {AR.property.addNew}
          </Button>
        </div>
      </div>

      <Card className="glass border-0 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input data-testid="properties-search-input" placeholder={`${AR.actions.search} بالاسم أو العنوان…`} value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
            <SelectTrigger data-testid="type-filter"><SelectValue placeholder={AR.property.type} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{AR.actions.all}</SelectItem>
              {(Object.keys(AR.property.types) as PropertyType[]).map((k) => <SelectItem key={k} value={k}>{AR.property.types[k]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger data-testid="status-filter"><SelectValue placeholder={AR.property.status} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{AR.actions.all}</SelectItem>
              {(Object.keys(AR.property.statuses) as PropertyStatus[]).map((k) => <SelectItem key={k} value={k}>{AR.property.statuses[k]}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input data-testid="min-price-input" type="number" placeholder={AR.property.minPrice} value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
            <Input data-testid="max-price-input" type="number" placeholder={AR.property.maxPrice} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
          </div>
        </div>
      </Card>

      <Card className="glass border-0 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button className="flex items-center gap-1 font-semibold" onClick={() => toggleSort('name')} data-testid="sort-name">
                    {AR.property.name} <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead>{AR.property.type}</TableHead>
                <TableHead>{AR.property.status}</TableHead>
                <TableHead>{AR.property.city}</TableHead>
                <TableHead>
                  <button className="flex items-center gap-1 font-semibold" onClick={() => toggleSort('price')} data-testid="sort-price">
                    {AR.property.price} <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead>{AR.common.date}</TableHead>
                <TableHead className="text-left">{AR.actions.edit}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{AR.common.empty}</TableCell></TableRow>
              ) : filtered.map((p) => (
                <TableRow key={p.id} data-testid={`property-row-${p.id}`}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{AR.property.types[p.type]}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_TONE[p.status]}>{AR.property.statuses[p.status]}</Badge>
                  </TableCell>
                  <TableCell>{p.city}</TableCell>
                  <TableCell className="num">{fmtMoney(p.price, p.currency)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(p.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setDialogOpen(true); }} data-testid={`edit-property-${p.id}`}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => onDelete(p.id!, p.name)} className="text-destructive hover:text-destructive" data-testid={`delete-property-${p.id}`}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <PropertyDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  );
}

function PropertyDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (v: boolean) => void; editing: Property | null }) {
  const [form, setForm] = useState<Partial<Property>>({});

  useMemo(() => {
    if (editing) setForm(editing);
    else setForm({ name: '', type: 'apartment', status: 'vacant', address: '', city: 'الرياض', price: 0, currency: 'SAR', notes: '' });
  }, [editing, open]);

  const submit = async () => {
    if (!form.name || !form.address || !form.city || !form.price) { toast.error('يرجى تعبئة الحقول الإلزامية'); return; }
    try {
      if (editing?.id) { await updateProperty(editing.id, form); toast.success('تم تحديث بيانات العقار'); }
      else {
        await createProperty({ name: form.name!, type: form.type as PropertyType, status: form.status as PropertyStatus, address: form.address!, city: form.city!, price: Number(form.price), currency: form.currency || 'SAR', notes: form.notes });
        toast.success('تمت إضافة العقار');
      }
      onOpenChange(false);
    } catch (e: any) { toast.error(e.message || AR.common.error); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="property-dialog">
        <DialogHeader><DialogTitle>{editing ? AR.property.editTitle : AR.property.addNew}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label={AR.property.name}><Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="property-name-input" /></Field>
          <Field label={AR.property.type}>
            <Select value={form.type as string} onValueChange={(v) => setForm({ ...form, type: v as PropertyType })}>
              <SelectTrigger data-testid="property-type-select"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(AR.property.types) as PropertyType[]).map((k) => <SelectItem key={k} value={k}>{AR.property.types[k]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label={AR.property.status}>
            <Select value={form.status as string} onValueChange={(v) => setForm({ ...form, status: v as PropertyStatus })}>
              <SelectTrigger data-testid="property-status-select"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(AR.property.statuses) as PropertyStatus[]).map((k) => <SelectItem key={k} value={k}>{AR.property.statuses[k]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label={AR.property.city}>
            <Select value={form.city || 'الرياض'} onValueChange={(v) => setForm({ ...form, city: v })}>
              <SelectTrigger data-testid="property-city-select"><SelectValue /></SelectTrigger>
              <SelectContent>{CITIES_SA.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label={AR.property.address} className="md:col-span-2"><Input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="property-address-input" /></Field>
          <Field label={AR.property.price}><Input type="number" value={form.price ?? 0} onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) })} data-testid="property-price-input" /></Field>
          <Field label={AR.property.notes} className="md:col-span-2"><Textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="property-notes-textarea" /></Field>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="property-cancel-button">{AR.actions.cancel}</Button>
          <Button onClick={submit} data-testid="property-save-button">{AR.actions.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`space-y-1.5 ${className}`}><Label className="text-xs">{label}</Label>{children}</div>;
}
