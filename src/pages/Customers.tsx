import { useMemo, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../database/db';
import { AR, CITIES_SA } from '../constants/arabicTerms';
import type { Customer } from '../models/types';
import { createCustomer, updateCustomer, deleteCustomer } from '../database/queries';
import { fmtDate } from '../utils/dateHelpers';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Plus, Pencil, Trash2, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../utils/excelExporter';
import { generateArabicPDF } from '../utils/pdfGenerator';
import {
  isValidInternationalPhone,
  normalizeCountryCode,
  normalizeInternationalPhone,
} from '../utils/phoneHelpers';

export default function Customers() {
  const customers = useLiveQuery(() => db.customers.toArray(), []) || [];
  const settings  = useLiveQuery(() => db.settings.get('singleton'), []);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const filtered = useMemo(() => {
    if (!search) return customers;
    const s = search.toLowerCase();
    return customers.filter((c) =>
      c.fullName.toLowerCase().includes(s) || c.phone.includes(s) ||
      c.nationalId.includes(s) || c.email.toLowerCase().includes(s)
    );
  }, [customers, search]);

  const onDelete = async (id: string, name: string) => {
    if (!confirm(`${AR.common.confirmDelete}\n${name}`)) return;
    try { await deleteCustomer(id); toast.success('تم حذف العميل'); }
    catch (e: any) { toast.error(e.message || AR.common.error); }
  };

  const exportExcel = () => {
    exportToExcel({
      filename: `العملاء_${new Date().toISOString().slice(0, 10)}`,
      sheetName: 'العملاء',
      headers: ['الاسم', 'الهوية', 'الجوال', 'البريد', 'المدينة', 'العنوان', 'تاريخ الإضافة'],
      rows: filtered.map((c) => [c.fullName, c.nationalId, c.phone, c.email, c.city, c.address, c.createdAt]),
      columnWidths: [26, 16, 14, 24, 14, 28, 14],
    });
    toast.success('تم تصدير ملف إكسل');
  };

  const exportPdf = async () => {
    try {
      await generateArabicPDF({
        title: 'تقرير العملاء',
        subtitle: `${filtered.length} عميلاً · ${fmtDate(new Date())}`,
        companyName: settings?.companyName,
        logoBase64: settings?.logoBase64,
        sections: [{
          table: {
            headers: ['الاسم', 'الهوية', 'الجوال', 'المدينة'],
            rows: filtered.map((c) => [c.fullName, c.nationalId, c.phone, c.city]),
          },
        }],
        filename: `تقرير_العملاء_${new Date().toISOString().slice(0, 10)}.pdf`,
      });
      toast.success('تم إنشاء PDF');
    } catch (e: any) { toast.error('تعذّر إنشاء PDF: ' + (e.message || '')); }
  };

  return (
    <div className="space-y-4" data-testid="customers-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6" /> {AR.nav.customers}</h2>
          <p className="text-sm text-muted-foreground mt-1">قاعدة العملاء (المستأجرون والمشترون).</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportExcel} data-testid="export-excel-button">{AR.actions.exportExcel}</Button>
          <Button variant="outline" onClick={exportPdf} data-testid="export-pdf-button">{AR.actions.exportPdf}</Button>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }} data-testid="add-customer-button" className="gap-1.5">
            <Plus className="h-4 w-4" /> {AR.customer.addNew}
          </Button>
        </div>
      </div>

      <Card className="glass border-0 p-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input data-testid="customers-search-input" className="pr-9" placeholder="ابحث بالاسم أو الجوال أو الهوية…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </Card>

      <Card className="glass border-0 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{AR.customer.fullName}</TableHead>
                <TableHead>{AR.customer.nationalId}</TableHead>
                <TableHead>{AR.customer.phone}</TableHead>
                <TableHead>{AR.customer.email}</TableHead>
                <TableHead>{AR.customer.city}</TableHead>
                <TableHead>{AR.common.date}</TableHead>
                <TableHead className="text-left">{AR.actions.edit}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{AR.common.empty}</TableCell></TableRow>
              ) : filtered.map((c) => (
                <TableRow key={c.id} data-testid={`customer-row-${c.id}`}>
                  <TableCell className="font-medium">{c.fullName}</TableCell>
                  <TableCell className="num">{c.nationalId}</TableCell>
                  <TableCell className="num" dir="ltr">{c.phone}</TableCell>
                  <TableCell>{c.email}</TableCell>
                  <TableCell>{c.city}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(c.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setDialogOpen(true); }} data-testid={`edit-customer-${c.id}`}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => onDelete(c.id!, c.fullName)} data-testid={`delete-customer-${c.id}`}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <CustomerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        countryCode={settings?.countryCode || '966'}
      />
    </div>
  );
}

function CustomerDialog({
  open,
  onOpenChange,
  editing,
  countryCode,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Customer | null;
  countryCode: string;
}) {
  const [form, setForm] = useState<Partial<Customer>>({});
  const normalizedCountryCode = normalizeCountryCode(countryCode) || '966';

  useEffect(() => {
    if (editing) setForm({ ...editing });
    else setForm({ fullName: '', nationalId: '', phone: normalizedCountryCode, email: '', address: '', city: 'الرياض', notes: '' });
  }, [editing, open, normalizedCountryCode]);

  const submit = async () => {
    if (!form.fullName || !form.nationalId || !form.phone) { toast.error('يرجى تعبئة الحقول الإلزامية'); return; }
    const phone = normalizeInternationalPhone(form.phone, normalizedCountryCode);
    if (!isValidInternationalPhone(phone, normalizedCountryCode)) {
      toast.error(`أدخل رقم جوال صحيحاً بالرمز الدولي +${normalizedCountryCode}`);
      return;
    }
    try {
      if (editing?.id) { await updateCustomer(editing.id, { ...form, phone }); toast.success('تم تحديث بيانات العميل'); }
      else {
        await createCustomer({ fullName: form.fullName!, nationalId: form.nationalId!, phone, email: form.email || '', address: form.address || '', city: form.city || 'الرياض', notes: form.notes });
        toast.success('تمت إضافة العميل');
      }
      onOpenChange(false);
    } catch (e: any) { toast.error(e.message || AR.common.error); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="customer-dialog">
        <DialogHeader><DialogTitle>{editing ? AR.customer.editTitle : AR.customer.addNew}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label={AR.customer.fullName} className="md:col-span-2"><Input value={form.fullName || ''} onChange={(e) => setForm({ ...form, fullName: e.target.value })} data-testid="customer-name-input" /></Field>
          <Field label={AR.customer.nationalId}><Input value={form.nationalId || ''} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} data-testid="customer-id-input" /></Field>
          <Field label={`${AR.customer.phone} (+${normalizedCountryCode})`}>
            <Input
              dir="ltr"
              inputMode="tel"
              placeholder={`${normalizedCountryCode}XXXXXXXXX`}
              value={form.phone || ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              onBlur={(e) => setForm({
                ...form,
                phone: normalizeInternationalPhone(e.target.value, normalizedCountryCode) || normalizedCountryCode,
              })}
              data-testid="customer-phone-input"
            />
          </Field>
          <Field label={AR.customer.email}><Input type="email" dir="ltr" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="customer-email-input" /></Field>
          <Field label={AR.customer.city}>
            <Select value={form.city || 'الرياض'} onValueChange={(v) => setForm({ ...form, city: v })}>
              <SelectTrigger data-testid="customer-city-select"><SelectValue /></SelectTrigger>
              <SelectContent>{CITIES_SA.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label={AR.customer.address} className="md:col-span-2"><Input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="customer-address-input" /></Field>
          <Field label={AR.customer.notes} className="md:col-span-2"><Textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{AR.actions.cancel}</Button>
          <Button onClick={submit} data-testid="customer-save-button">{AR.actions.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`space-y-1.5 ${className}`}><Label className="text-xs">{label}</Label>{children}</div>;
}
