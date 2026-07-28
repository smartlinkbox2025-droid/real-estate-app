import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../database/db';
import { AR } from '../constants/arabicTerms';
import type { Contract, ContractType, PaymentFrequency, ContractStatus } from '../models/types';
import { createContractWithInvoices, terminateContract, deleteContract, uploadDocument, downloadDocument } from '../database/queries';
import { fmtDate, fmtMoney, toISODate } from '../utils/dateHelpers';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Plus, FileText, Trash2, XCircle, Eye, Paperclip, Download, FileDown, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { generateArabicPDF } from '../utils/pdfGenerator';
import { exportToExcel } from '../utils/excelExporter';

const STATUS_TONE: Record<ContractStatus, string> = {
  active:     'bg-success/15 text-success border-success/30',
  extended:   'bg-accent/15 text-accent border-accent/30',
  terminated: 'bg-muted text-muted-foreground border-border',
  canceled:   'bg-destructive/15 text-destructive border-destructive/30',
  draft:      'bg-warning/15 text-warning border-warning/30',
};

export default function Contracts() {
  const contracts  = useLiveQuery(() => db.contracts.toArray(), []) || [];
  const properties = useLiveQuery(() => db.properties.toArray(), []) || [];
  const customers  = useLiveQuery(() => db.customers.toArray(), []) || [];
  const invoices   = useLiveQuery(() => db.invoices.toArray(), []) || [];
  const settings   = useLiveQuery(() => db.settings.get('singleton'), []);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewing, setViewing] = useState<Contract | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | ContractStatus>('all');

  const filtered = useMemo(() =>
    contracts.filter((c) => statusFilter === 'all' || c.status === statusFilter),
    [contracts, statusFilter]);

  const propName = (id: string) => properties.find((p) => p.id === id)?.name || '—';
  const custName = (id: string) => customers.find((c) => c.id === id)?.fullName || '—';

  const exportExcel = () => {
    exportToExcel({
      filename: `العقود_${new Date().toISOString().slice(0, 10)}`,
      sheetName: 'العقود',
      headers: ['العقار', 'العميل', 'نوع العقد', 'تاريخ البداية', 'تاريخ النهاية', 'القيمة الكلية', 'الرصيد المتبقي', 'دورية الدفع', 'الحالة'],
      rows: filtered.map((c) => [
        propName(c.propertyId), custName(c.customerId),
        AR.contract.types[c.contractType],
        fmtDate(c.startDate), fmtDate(c.endDate),
        c.totalAmount, c.remainingBalance,
        AR.contract.frequencies[c.paymentFrequency],
        AR.contract.statuses[c.status],
      ]),
      columnWidths: [24, 22, 12, 12, 12, 14, 14, 14, 12],
    });
    toast.success('تم تصدير ملف إكسل');
  };

  const exportPdf = async () => {
    try {
      await generateArabicPDF({
        title: AR.nav.contracts,
        subtitle: `${filtered.length} عقد`,
        companyName: settings?.companyName,
        logoBase64: settings?.logoBase64,
        filename: `العقود_${new Date().toISOString().slice(0, 10)}.pdf`,
        sections: [{
          table: {
            headers: ['العقار', 'العميل', 'نوع العقد', 'تاريخ البداية', 'تاريخ النهاية', 'القيمة الكلية', 'دورية الدفع', 'الحالة'],
            rows: filtered.map((c) => [
              propName(c.propertyId), custName(c.customerId),
              AR.contract.types[c.contractType],
              fmtDate(c.startDate), fmtDate(c.endDate),
              fmtMoney(c.totalAmount),
              AR.contract.frequencies[c.paymentFrequency],
              AR.contract.statuses[c.status],
            ]),
          },
        }],
      });
      toast.success('تم تنزيل ملف PDF بنجاح');
    } catch (e: any) { toast.error('تعذّر إنشاء PDF: ' + (e.message || '')); }
  };

  const onTerminate = async (id: string) => {
    if (!confirm('هل تريد إنهاء العقد؟ سيعود العقار إلى حالة "شاغر".')) return;
    await terminateContract(id);
    toast.success('تم إنهاء العقد');
  };

  const onDelete = async (id: string) => {
    if (!confirm('سيتم حذف العقد وكل فواتيره ومدفوعاته نهائياً. هل أنت متأكد؟')) return;
    await deleteContract(id);
    toast.success('تم حذف العقد');
  };

  const printContract = async (c: Contract) => {
    const relatedInvoices = invoices.filter((i) => i.contractId === c.id);
    try {
      await generateArabicPDF({
        title: 'عقد ' + AR.contract.types[c.contractType],
        subtitle: fmtDate(c.createdAt),
        companyName: settings?.companyName,
        logoBase64: settings?.logoBase64,
        sections: [
          {
            heading: 'أطراف العقد',
            table: {
              headers: ['البند', 'التفاصيل'],
              rows: [
                ['العقار', propName(c.propertyId)],
                ['العميل', custName(c.customerId)],
              ],
            },
          },
          {
            heading: 'التفاصيل المالية',
            table: {
              headers: ['البند', 'القيمة'],
              rows: [
                [AR.contract.type, AR.contract.types[c.contractType]],
                [AR.contract.startDate, fmtDate(c.startDate)],
                [AR.contract.endDate, fmtDate(c.endDate)],
                [AR.contract.totalAmount, fmtMoney(c.totalAmount)],
                [AR.contract.remainingBalance, fmtMoney(c.remainingBalance)],
                [AR.contract.paymentFrequency, AR.contract.frequencies[c.paymentFrequency]],
                [AR.contract.penaltyRate, `${c.penaltyRate}%`],
              ],
            },
          },
          {
            heading: `${AR.contract.generatedInvoices} (${relatedInvoices.length})`,
            table: {
              headers: [AR.invoice.number, AR.invoice.dueDate, AR.invoice.amountDue, AR.invoice.status],
              rows: relatedInvoices.map((i) => [i.invoiceNumber, fmtDate(i.dueDate), fmtMoney(i.amountDue), AR.invoice.statuses[i.status]]),
            },
          },
        ],
        filename: `عقد_${c.id?.slice(-6)}.pdf`,
      });
    } catch (e: any) { toast.error('تعذّر إنشاء PDF: ' + (e.message || '')); }
  };

  return (
    <div className="space-y-4" data-testid="contracts-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" /> {AR.nav.contracts}</h2>
          <p className="text-sm text-muted-foreground mt-1">إبرام العقود مع توليد الأقساط والفواتير آلياً.</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="col-span-2 w-full sm:w-40" data-testid="contract-status-filter"><SelectValue placeholder={AR.contract.status} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{AR.actions.all}</SelectItem>
              {(Object.keys(AR.contract.statuses) as ContractStatus[]).map((k) => <SelectItem key={k} value={k}>{AR.contract.statuses[k]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportExcel} className="w-full sm:w-auto">{AR.actions.exportExcel}</Button>
          <Button variant="outline" onClick={exportPdf} className="w-full gap-1.5 sm:w-auto" data-testid="export-contracts-pdf">
            <FileDown className="h-4 w-4" /> PDF
          </Button>
          <Button onClick={() => setDialogOpen(true)} data-testid="add-contract-button" className="col-span-2 w-full gap-1.5 sm:w-auto">
            <Plus className="h-4 w-4" /> {AR.contract.addNew}
          </Button>
        </div>
      </div>

      <Card className="glass border-0 overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[56rem]">
            <TableHeader>
              <TableRow>
                <TableHead>{AR.contract.property}</TableHead>
                <TableHead>{AR.contract.customer}</TableHead>
                <TableHead>{AR.contract.type}</TableHead>
                <TableHead>{AR.contract.startDate}</TableHead>
                <TableHead>{AR.contract.endDate}</TableHead>
                <TableHead>{AR.contract.totalAmount}</TableHead>
                <TableHead>{AR.contract.remainingBalance}</TableHead>
                <TableHead>{AR.contract.status}</TableHead>
                <TableHead className="text-left">{AR.actions.view}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">{AR.common.empty}</TableCell></TableRow>
              ) : filtered.map((c) => (
                <TableRow key={c.id} data-testid={`contract-row-${c.id}`}>
                  <TableCell className="font-medium">{propName(c.propertyId)}</TableCell>
                  <TableCell>{custName(c.customerId)}</TableCell>
                  <TableCell>{AR.contract.types[c.contractType]}</TableCell>
                  <TableCell className="text-xs">{fmtDate(c.startDate)}</TableCell>
                  <TableCell className="text-xs">{fmtDate(c.endDate)}</TableCell>
                  <TableCell className="num">{fmtMoney(c.totalAmount)}</TableCell>
                  <TableCell className="num">{fmtMoney(c.remainingBalance)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_TONE[c.status]}>{AR.contract.statuses[c.status]}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setViewing(c)} data-testid={`view-contract-${c.id}`}><Eye className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => printContract(c)} data-testid={`print-contract-${c.id}`}><FileText className="h-4 w-4" /></Button>
                      {c.status === 'active' && (
                        <Button size="icon" variant="ghost" className="text-warning" onClick={() => onTerminate(c.id!)} data-testid={`terminate-contract-${c.id}`}><XCircle className="h-4 w-4" /></Button>
                      )}
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => onDelete(c.id!)} data-testid={`delete-contract-${c.id}`}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <ContractDialog open={dialogOpen} onOpenChange={setDialogOpen} properties={properties} customers={customers} />

      {viewing && (
        <ContractView
          contract={viewing}
          onClose={() => setViewing(null)}
          propertyName={propName(viewing.propertyId)}
          customerName={custName(viewing.customerId)}
          invoices={invoices.filter((i) => i.contractId === viewing.id)}
        />
      )}
    </div>
  );
}

function ContractDialog({ open, onOpenChange, properties, customers }: { open: boolean; onOpenChange: (v: boolean) => void; properties: any[]; customers: any[] }) {
  const today     = new Date();
  const yearAhead = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);
  const fileRef   = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    propertyId: '', customerId: '',
    contractType: 'rent' as ContractType,
    startDate: toISODate(today), endDate: toISODate(yearAhead),
    totalAmount: 0, paymentFrequency: 'monthly' as PaymentFrequency,
    penaltyRate: 0, status: 'active' as ContractStatus,
  });
  const [attachedFile, setAttachedFile] = useState<File | null>(null);

  useEffect(() => {
    if (open) {
      setForm({ propertyId: '', customerId: '', contractType: 'rent', startDate: toISODate(today), endDate: toISODate(yearAhead), totalAmount: 0, paymentFrequency: 'monthly', penaltyRate: 0, status: 'active' });
      setAttachedFile(null);
    }
  }, [open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setAttachedFile(file);
    e.target.value = '';
  };

  const submit = async () => {
    if (!form.propertyId || !form.customerId || !form.totalAmount) { toast.error('يرجى اختيار العقار والعميل وإدخال القيمة'); return; }
    const startDate = new Date(form.startDate);
    const endDate = new Date(form.endDate);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
      toast.error('يجب أن يكون تاريخ نهاية العقد بعد تاريخ البداية');
      return;
    }
    if (!Number.isFinite(Number(form.totalAmount)) || Number(form.totalAmount) <= 0) {
      toast.error('يجب أن تكون القيمة الإجمالية أكبر من صفر');
      return;
    }
    try {
      const { contractId, invoicesCreated } = await createContractWithInvoices({ ...form, startDate, endDate, totalAmount: Number(form.totalAmount), penaltyRate: Number(form.penaltyRate) });
      // Upload contract image if attached
      if (attachedFile) {
        await uploadDocument(attachedFile, 'contract', contractId);
      }
      toast.success(`تم إبرام العقد وتوليد ${invoicesCreated} فاتورة تلقائياً${attachedFile ? ' ورُفعت صورة العقد' : ''}`);
      onOpenChange(false);
    } catch (e: any) { toast.error(e.message || AR.common.error); }
  };

  const vacantProps = properties.filter((p) => p.status === 'vacant');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="contract-dialog">
        <DialogHeader><DialogTitle>{AR.contract.addNew}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label={AR.contract.property}>
            <Select value={form.propertyId} onValueChange={(v) => setForm({ ...form, propertyId: v })}>
              <SelectTrigger data-testid="contract-property-select"><SelectValue placeholder="اختر العقار" /></SelectTrigger>
              <SelectContent>
                {vacantProps.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">لا توجد عقارات شاغرة</div>}
                {vacantProps.map((p) => <SelectItem key={p.id} value={p.id!}>{p.name} — {p.city}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label={AR.contract.customer}>
            <Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v })}>
              <SelectTrigger data-testid="contract-customer-select"><SelectValue placeholder="اختر العميل" /></SelectTrigger>
              <SelectContent className="max-h-64 overflow-y-scroll">
                {customers.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">لا يوجد عملاء</div>}
                {customers.map((c) => <SelectItem key={c.id} value={c.id!}>{c.fullName} · {c.phone}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label={AR.contract.type}>
            <Select value={form.contractType} onValueChange={(v) => setForm({ ...form, contractType: v as ContractType })}>
              <SelectTrigger data-testid="contract-type-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rent">{AR.contract.types.rent}</SelectItem>
                <SelectItem value="sale">{AR.contract.types.sale}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={AR.contract.paymentFrequency}>
            <Select value={form.paymentFrequency} onValueChange={(v) => setForm({ ...form, paymentFrequency: v as PaymentFrequency })}>
              <SelectTrigger data-testid="contract-frequency-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(AR.contract.frequencies) as PaymentFrequency[]).map((k) => <SelectItem key={k} value={k}>{AR.contract.frequencies[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label={AR.contract.startDate}><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} data-testid="contract-start-input" /></Field>
          <Field label={AR.contract.endDate}><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} data-testid="contract-end-input" /></Field>
          <Field label={AR.contract.totalAmount}><Input type="number" value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: parseFloat(e.target.value) })} data-testid="contract-amount-input" /></Field>
          <Field label={AR.contract.penaltyRate}><Input type="number" step="0.1" value={form.penaltyRate} onChange={(e) => setForm({ ...form, penaltyRate: parseFloat(e.target.value) })} data-testid="contract-penalty-input" /></Field>

          {/* Contract image upload — spans full width */}
          <div className="md:col-span-2 space-y-1.5">
            <Label className="text-xs">إرفاق صورة العقد</Label>
            <div
              className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => fileRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
            >
              <ImagePlus className="h-5 w-5 text-muted-foreground shrink-0" />
              {attachedFile ? (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{attachedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(attachedFile.size / 1024).toFixed(0)} KB</p>
                </div>
              ) : (
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">اضغط لرفع صورة أو ملف العقد</p>
                  <p className="text-xs text-muted-foreground">PDF · JPG · PNG · DOC</p>
                </div>
              )}
              {attachedFile && (
                <Button
                  size="sm" variant="ghost" type="button"
                  className="text-destructive hover:text-destructive shrink-0"
                  onClick={(e) => { e.stopPropagation(); setAttachedFile(null); }}
                >
                  إلغاء
                </Button>
              )}
            </div>
            <input
              ref={fileRef} type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={handleFileChange}
              data-testid="contract-image-input"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{AR.actions.cancel}</Button>
          <Button onClick={submit} data-testid="contract-save-button">{AR.actions.confirm} وتوليد الفواتير</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContractView({ contract, onClose, propertyName, customerName, invoices }: { contract: Contract; onClose: () => void; propertyName: string; customerName: string; invoices: any[] }) {
  const docs = useLiveQuery(() => db.documents.where('relatedId').equals(contract.id!).toArray(), [contract.id]) || [];
  const fileRef = useRef<HTMLInputElement>(null);

  const attach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { await uploadDocument(file, 'contract', contract.id!); toast.success('تم رفع المستند'); }
    catch (err: any) { toast.error(err.message || AR.common.error); }
    e.target.value = '';
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl" data-testid="contract-view-dialog">
        <DialogHeader><DialogTitle>تفاصيل العقد</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <Info label={AR.contract.property} value={propertyName} />
            <Info label={AR.contract.customer} value={customerName} />
            <Info label={AR.contract.type} value={AR.contract.types[contract.contractType]} />
            <Info label={AR.contract.status} value={AR.contract.statuses[contract.status]} />
            <Info label={AR.contract.startDate} value={fmtDate(contract.startDate)} />
            <Info label={AR.contract.endDate} value={fmtDate(contract.endDate)} />
            <Info label={AR.contract.totalAmount} value={fmtMoney(contract.totalAmount)} />
            <Info label={AR.contract.remainingBalance} value={fmtMoney(contract.remainingBalance)} />
          </div>

          {/* Invoices */}
          <div>
            <h3 className="font-bold mb-2">{AR.contract.generatedInvoices} ({invoices.length})</h3>
            <div className="max-h-48 overflow-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{AR.invoice.number}</TableHead>
                    <TableHead>{AR.invoice.dueDate}</TableHead>
                    <TableHead>{AR.invoice.amountDue}</TableHead>
                    <TableHead>{AR.invoice.status}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="num">{i.invoiceNumber}</TableCell>
                      <TableCell>{fmtDate(i.dueDate)}</TableCell>
                      <TableCell className="num">{fmtMoney(i.amountDue)}</TableCell>
                      <TableCell>{AR.invoice.statuses[i.status as keyof typeof AR.invoice.statuses]}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold">{AR.contract.attachments} ({docs.length})</h3>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} className="gap-1.5" data-testid="attach-file-button">
                <Paperclip className="h-4 w-4" /> {AR.actions.attach}
              </Button>
              <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={attach} data-testid="contract-file-input" />
            </div>
            {docs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3 rounded-xl bg-muted/30">{AR.common.empty}</p>
            ) : (
              <ul className="space-y-2">
                {docs.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm truncate max-w-48">{doc.fileName}</span>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => downloadDocument(doc)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{AR.actions.close}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
