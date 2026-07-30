import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../database/db';
import { AR, CITIES_SA } from '../constants/arabicTerms';
import type { BuildingUnit, Property, PropertyStatus, PropertyType } from '../models/types';
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
import { Plus, Pencil, Trash2, Search, Building2, ArrowUpDown, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../utils/excelExporter';
import { generateArabicPDF } from '../utils/pdfGenerator';
import { aggregateBuildingStatus, createBuildingUnits } from '../utils/buildingUnits';

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
  const [managingBuildingId, setManagingBuildingId] = useState<string | null>(null);
  const managingBuilding = properties.find((property) => property.id === managingBuildingId) || null;

  const filtered = useMemo(() => {
    let list = properties.filter((p) => {
      if (search) {
        const s = search.toLowerCase();
        if (!p.name.toLowerCase().includes(s) && !p.address.toLowerCase().includes(s) && !p.city.toLowerCase().includes(s) && !(p.ownerName || '').toLowerCase().includes(s)) return false;
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
      headers: ['الاسم', 'اسم المالك', 'النوع', 'الحالة', 'المدينة', 'العنوان', 'السعر', 'ملاحظات', 'تاريخ الإضافة'],
      rows: filtered.map((p) => [p.name, p.ownerName || '', AR.property.types[p.type], AR.property.statuses[p.status], p.city, p.address, p.price, p.notes || '', p.createdAt]),
      columnWidths: [26, 20, 12, 12, 14, 30, 14, 24, 14],
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
                <TableHead>اسم المالك</TableHead>
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
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">{AR.common.empty}</TableCell></TableRow>
              ) : filtered.map((p) => (
                <TableRow key={p.id} data-testid={`property-row-${p.id}`}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{AR.property.types[p.type]}</TableCell>
                  <TableCell>{p.ownerName || '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_TONE[p.status]}>{AR.property.statuses[p.status]}</Badge>
                  </TableCell>
                  <TableCell>{p.city}</TableCell>
                  <TableCell className="num">{fmtMoney(p.price)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(p.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {p.type === 'building' && p.buildingDetails && (
                        <Button size="icon" variant="ghost" title="إدارة شقق العمارة" onClick={() => setManagingBuildingId(p.id!)} data-testid={`manage-building-${p.id}`}>
                          <ListChecks className="h-4 w-4" />
                        </Button>
                      )}
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

      <PropertyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onBuildingSaved={setManagingBuildingId}
        appCurrency={settings?.currency || 'SAR'}
      />
      <BuildingUnitsDialog property={managingBuilding} open={!!managingBuilding} onOpenChange={(value) => { if (!value) setManagingBuildingId(null); }} />
    </div>
  );
}

function PropertyDialog({ open, onOpenChange, editing, onBuildingSaved, appCurrency }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Property | null;
  onBuildingSaved: (id: string) => void;
  appCurrency: string;
}) {
  const [form, setForm] = useState<Partial<Property>>({});

  useEffect(() => {
    if (!open) return;
    if (editing) setForm(editing);
    else setForm({
      name: '', ownerName: '', type: 'apartment', status: 'vacant',
      address: '', city: 'الرياض', price: 0, currency: appCurrency, notes: '',
    });
  }, [editing, open, appCurrency]);

  const submit = async () => {
    if (!form.name?.trim() || !form.ownerName?.trim() || !form.address?.trim() || !form.city || !Number(form.price)) {
      toast.error('يرجى تعبئة الاسم واسم المالك والمدينة والعنوان والسعر');
      return;
    }
    let buildingDetails = form.buildingDetails;
    if (form.type === 'building') {
      const apartmentCount = Number(buildingDetails?.apartmentCount || 0);
      const floorCount = Number(buildingDetails?.floorCount || 0);
      const annexCount = Number(buildingDetails?.annexCount || 0);
      const apartmentsPerFloor = Number(buildingDetails?.apartmentsPerFloor || 0);
      if (apartmentCount < 1 || floorCount < 1 || apartmentsPerFloor < 1 || annexCount < 0) {
        toast.error('يرجى إدخال أعداد صحيحة لبيانات العمارة');
        return;
      }
      if (apartmentCount > floorCount * apartmentsPerFloor) {
        toast.error('عدد الشقق أكبر من سعة الطوابق المحددة');
        return;
      }
      buildingDetails = {
        apartmentCount, floorCount, annexCount, apartmentsPerFloor,
        units: createBuildingUnits(apartmentCount, annexCount, apartmentsPerFloor, buildingDetails?.units),
      };
    } else {
      buildingDetails = undefined;
    }
    try {
      let savedId: string;
      const payload = { ...form, name: form.name.trim(), ownerName: form.ownerName.trim(), buildingDetails };
      if (editing?.id) {
        savedId = editing.id;
        await updateProperty(editing.id, payload);
        toast.success('تم تحديث بيانات العقار');
      }
      else {
        savedId = await createProperty({
          name: form.name.trim(), ownerName: form.ownerName.trim(),
          type: form.type as PropertyType, status: form.status as PropertyStatus,
          address: form.address!.trim(), city: form.city!, price: Number(form.price),
          currency: appCurrency, notes: form.notes, buildingDetails,
        });
        toast.success('تمت إضافة العقار');
      }
      onOpenChange(false);
      if (form.type === 'building') onBuildingSaved(savedId);
    } catch (e: any) { toast.error(e.message || AR.common.error); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="property-dialog">
        <DialogHeader><DialogTitle>{editing ? AR.property.editTitle : AR.property.addNew}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label={AR.property.name}><Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="property-name-input" /></Field>
          <Field label="اسم المالك"><Input value={form.ownerName || ''} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} data-testid="property-owner-input" /></Field>
          <Field label={AR.property.type}>
            <Select value={form.type as string} onValueChange={(v) => setForm({ ...form, type: v as PropertyType })} disabled={!!editing?.buildingDetails}>
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
          {form.type === 'building' && (
            <div className="md:col-span-2 rounded-xl border bg-muted/20 p-3">
              <div className="font-semibold mb-3">بيانات العمارة</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <NumberField disabled={!!editing?.buildingDetails} label="عدد الشقق" value={form.buildingDetails?.apartmentCount} testId="building-apartment-count" onChange={(value) => setForm({ ...form, buildingDetails: { apartmentCount: value, floorCount: form.buildingDetails?.floorCount || 0, annexCount: form.buildingDetails?.annexCount || 0, apartmentsPerFloor: form.buildingDetails?.apartmentsPerFloor || 0, units: form.buildingDetails?.units || [] } })} />
                <NumberField disabled={!!editing?.buildingDetails} label="عدد الطوابق" value={form.buildingDetails?.floorCount} testId="building-floor-count" onChange={(value) => setForm({ ...form, buildingDetails: { apartmentCount: form.buildingDetails?.apartmentCount || 0, floorCount: value, annexCount: form.buildingDetails?.annexCount || 0, apartmentsPerFloor: form.buildingDetails?.apartmentsPerFloor || 0, units: form.buildingDetails?.units || [] } })} />
                <NumberField disabled={!!editing?.buildingDetails} label="عدد الملحقات" value={form.buildingDetails?.annexCount} testId="building-annex-count" onChange={(value) => setForm({ ...form, buildingDetails: { apartmentCount: form.buildingDetails?.apartmentCount || 0, floorCount: form.buildingDetails?.floorCount || 0, annexCount: value, apartmentsPerFloor: form.buildingDetails?.apartmentsPerFloor || 0, units: form.buildingDetails?.units || [] } })} />
                <NumberField disabled={!!editing?.buildingDetails} label="الشقق في كل طابق" value={form.buildingDetails?.apartmentsPerFloor} testId="building-per-floor" onChange={(value) => setForm({ ...form, buildingDetails: { apartmentCount: form.buildingDetails?.apartmentCount || 0, floorCount: form.buildingDetails?.floorCount || 0, annexCount: form.buildingDetails?.annexCount || 0, apartmentsPerFloor: value, units: form.buildingDetails?.units || [] } })} />
              </div>
            </div>
          )}
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

function NumberField({ label, value, onChange, testId, disabled = false }: { label: string; value?: number; onChange: (value: number) => void; testId: string; disabled?: boolean }) {
  return <Field label={label}><Input disabled={disabled} type="number" min={0} value={value ?? 0} onChange={(event) => onChange(Math.max(0, Math.floor(Number(event.target.value) || 0)))} data-testid={testId} /></Field>;
}

function BuildingUnitsDialog({ property, open, onOpenChange }: { property: Property | null; open: boolean; onOpenChange: (value: boolean) => void }) {
  const [units, setUnits] = useState<BuildingUnit[]>([]);

  useEffect(() => {
    if (open) setUnits(property?.buildingDetails?.units.map((unit) => ({ ...unit })) || []);
  }, [open, property?.id, property?.updatedAt]);

  if (!property?.buildingDetails) return null;

  const updateUnit = (id: string, changes: Partial<BuildingUnit>) => {
    setUnits((current) => current.map((unit) => unit.id === id ? { ...unit, ...changes } : unit));
  };

  const save = async () => {
    const numbers = units.map((unit) => unit.number.trim());
    if (numbers.some((number) => !number)) { toast.error('رقم الشقة أو الملحق مطلوب'); return; }
    if (new Set(numbers).size !== numbers.length) { toast.error('لا يمكن تكرار رقم الوحدة'); return; }
    if (units.some((unit) => !Number.isFinite(Number(unit.annualPrice)) || Number(unit.annualPrice) < 0)) {
      toast.error('السعر أو الإيجار السنوي غير صالح');
      return;
    }
    try {
      const normalized = units.map((unit) => ({ ...unit, number: unit.number.trim(), annualPrice: Number(unit.annualPrice), notes: unit.notes?.trim() || '' }));
      await updateProperty(property.id!, {
        status: aggregateBuildingStatus(normalized),
        buildingDetails: { ...property.buildingDetails!, units: normalized },
      });
      toast.success('تم حفظ بيانات وحدات العمارة');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || AR.common.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-6xl max-h-[92vh] overflow-y-auto" data-testid="building-units-dialog">
        <DialogHeader><DialogTitle>وحدات {property.name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <ReadOnlyField label="اسم العمارة" value={property.name} />
          <ReadOnlyField label="المدينة" value={property.city} />
          <ReadOnlyField label="العنوان" value={property.address} />
          <ReadOnlyField label="اسم المالك" value={property.ownerName || '—'} />
        </div>
        <div className="rounded-xl border overflow-x-auto">
          <Table className="min-w-[780px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">رقم الشقة / الملحق</TableHead>
                <TableHead className="w-36">الحالة</TableHead>
                <TableHead className="w-48">السعر / الإيجار السنوي</TableHead>
                <TableHead>ملاحظات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((unit) => (
                <TableRow key={unit.id} data-testid={`building-unit-${unit.id}`}>
                  <TableCell><Input value={unit.number} onChange={(event) => updateUnit(unit.id, { number: event.target.value })} /></TableCell>
                  <TableCell>
                    <Select value={unit.status} onValueChange={(value) => updateUnit(unit.id, { status: value as PropertyStatus })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{(Object.keys(AR.property.statuses) as PropertyStatus[]).map((status) => <SelectItem key={status} value={status}>{AR.property.statuses[status]}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Input type="number" min={0} value={unit.annualPrice} onChange={(event) => updateUnit(unit.id, { annualPrice: Number(event.target.value) })} /></TableCell>
                  <TableCell><Input value={unit.notes || ''} onChange={(event) => updateUnit(unit.id, { notes: event.target.value })} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{AR.actions.cancel}</Button>
          <Button onClick={save} data-testid="building-units-save">{AR.actions.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <Field label={label}><Input value={value} readOnly disabled className="disabled:opacity-100 disabled:bg-muted" /></Field>;
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`space-y-1.5 ${className}`}><Label className="text-xs">{label}</Label>{children}</div>;
}
