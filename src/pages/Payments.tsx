import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../database/db';
import { AR } from '../constants/arabicTerms';
import type { PaymentMethod, InvoiceStatus } from '../models/types';
import { deletePayment, fileToBase64, recordPayment } from '../database/queries';
import { fmtDate, fmtMoney, isDateWithinInclusiveRange, toISODate } from '../utils/dateHelpers';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Wallet, Search, Receipt, FileDown, ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '../utils/excelExporter';
import { generateReceipt, generateArabicPDF } from '../utils/pdfGenerator';
import {
  buildInvoiceWhatsAppMessage,
  buildWhatsAppUrl,
} from '../utils/phoneHelpers';
import { WhatsAppIcon } from '../components/icons/WhatsAppIcon';

const INV_TONE: Record<InvoiceStatus, string> = {
  paid:    'bg-success/15 text-success border-success/30',
  partial: 'bg-accent/15 text-accent border-accent/30',
  overdue: 'bg-destructive/15 text-destructive border-destructive/30',
  unpaid:  'bg-warning/15 text-warning border-warning/30',
  canceled:'bg-muted text-muted-foreground border-border',
};

export default function Payments() {
  const invoices   = useLiveQuery(() => db.invoices.toArray(), []) || [];
  const properties = useLiveQuery(() => db.properties.toArray(), []) || [];
  const customers  = useLiveQuery(() => db.customers.toArray(), []) || [];
  const payments   = useLiveQuery(() => db.payments.orderBy('paymentDate').reverse().toArray(), []) || [];
  const settings   = useLiveQuery(() => db.settings.get('singleton'), []);

  const [search, setSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [invoiceDateFrom, setInvoiceDateFrom] = useState('');
  const [invoiceDateTo, setInvoiceDateTo] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all');
  const [tab, setTab] = useState<'invoices' | 'history'>('invoices');
  const [payDialog, setPayDialog] = useState<{ invoiceId: string; contractId: string; balance: number } | null>(null);

  const propName = (id: string) => properties.find((p) => p.id === id)?.name || '—';
  const custName = (id: string) => customers.find((c) => c.id === id)?.fullName || '—';

  const filtered = useMemo(() =>
    invoices
      .filter((i) => {
        if (statusFilter !== 'all' && i.status !== statusFilter) return false;
        if (!isDateWithinInclusiveRange(i.dueDate, invoiceDateFrom, invoiceDateTo)) return false;
        if (search) {
          const s = search.toLowerCase();
          if (!i.invoiceNumber.toLowerCase().includes(s) && !custName(i.customerId).toLowerCase().includes(s) && !propName(i.propertyId).toLowerCase().includes(s)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    [invoices, statusFilter, search, invoiceDateFrom, invoiceDateTo, properties, customers]);

  const filteredHistory = useMemo(() => {
    const term = historySearch.trim().toLocaleLowerCase('ar');
    return payments.filter((payment) => {
      if (!isDateWithinInclusiveRange(payment.paymentDate, historyDateFrom, historyDateTo)) return false;
      if (!term) return true;
      const invoice = invoices.find((item) => item.id === payment.invoiceId);
      const invoiceNumber = invoice?.invoiceNumber || '';
      const customerName = custName(invoice?.customerId || '');
      return invoiceNumber.toLocaleLowerCase('en').includes(term.toLocaleLowerCase('en'))
        || customerName.toLocaleLowerCase('ar').includes(term);
    });
  }, [payments, invoices, customers, historySearch, historyDateFrom, historyDateTo]);

  const removePayment = async (payment: typeof payments[0]) => {
    const invoice = invoices.find((item) => item.id === payment.invoiceId);
    const approved = window.confirm(
      `هل أنت متأكد من حذف هذا السداد بقيمة ${fmtMoney(payment.amountPaid)}؟\n`
      + `سيُعاد حساب الفاتورة ${invoice?.invoiceNumber || ''} ورصيد العقد تلقائياً.`,
    );
    if (!approved || !payment.id) return;
    try {
      await deletePayment(payment.id);
      toast.success('تم حذف السداد وإعادة حساب الفاتورة والعقد');
    } catch (error: any) {
      toast.error(error?.message || 'تعذّر حذف السداد');
    }
  };

  const sendInvoiceReminder = (invoice: typeof invoices[0], balance: number) => {
    const customer = customers.find((item) => item.id === invoice.customerId);
    if (!customer) {
      toast.error('تعذّر العثور على بيانات العميل المرتبط بالفاتورة');
      return;
    }
    try {
      const message = buildInvoiceWhatsAppMessage({
        customerName: customer.fullName,
        invoiceNumber: invoice.invoiceNumber,
        dueDate: fmtDate(invoice.dueDate),
        amountDue: fmtMoney(balance),
        companyName: settings?.companyName,
      });
      const url = buildWhatsAppUrl(customer.phone, message, settings?.countryCode || '966');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      toast.error(error?.message || 'تعذّر فتح واتساب');
    }
  };

  const exportInvoicesExcel = () => {
    exportToExcel({
      filename: `الفواتير_${new Date().toISOString().slice(0, 10)}`,
      sheetName: 'الفواتير',
      headers: [AR.invoice.number, AR.contract.customer, AR.contract.property, AR.invoice.dueDate, AR.invoice.amountDue, AR.invoice.amountPaid, AR.invoice.balance, AR.invoice.status],
      rows: filtered.map((i) => [i.invoiceNumber, custName(i.customerId), propName(i.propertyId), i.dueDate instanceof Date ? i.dueDate : new Date(i.dueDate), i.amountDue, i.amountPaid, Math.max(0, i.amountDue - i.amountPaid), AR.invoice.statuses[i.status]]),
      columnWidths: [16, 24, 24, 14, 14, 14, 14, 14],
    });
    toast.success('تم تصدير ملف إكسل');
  };

  const exportInvoicesPdf = async () => {
    try {
      await generateArabicPDF({
        title: 'الفواتير',
        subtitle: `${filtered.length} فاتورة — ${new Date().toLocaleDateString('en-SA')}`,
        companyName: settings?.companyName,
        logoBase64: settings?.logoBase64,
        pageOrientation: 'landscape',
        filename: `الفواتير_${new Date().toISOString().slice(0, 10)}.pdf`,
        sections: [{
          table: {
            headers: [AR.invoice.number, AR.contract.customer, AR.contract.property, AR.invoice.dueDate, AR.invoice.amountDue, AR.invoice.balance, AR.invoice.status],
            rows: filtered.map((i) => [
              i.invoiceNumber,
              custName(i.customerId),
              propName(i.propertyId),
              fmtDate(i.dueDate),
              fmtMoney(i.amountDue),
              fmtMoney(Math.max(0, i.amountDue - i.amountPaid)),
              AR.invoice.statuses[i.status],
            ]),
          },
        }],
      });
      toast.success('تم تنزيل ملف PDF بنجاح');
    } catch (e: any) { toast.error('تعذّر إنشاء PDF: ' + (e.message || '')); }
  };

  const exportHistoryExcel = () => {
    exportToExcel({
      filename: `سجل_المدفوعات_${new Date().toISOString().slice(0, 10)}`,
      sheetName: 'المدفوعات',
      headers: [AR.payment.paymentDate, AR.payment.invoice, AR.contract.customer, AR.contract.property, AR.payment.amountPaid, AR.payment.paymentMethod, AR.payment.referenceNumber],
      rows: filteredHistory.map((p) => {
        const inv = invoices.find((i) => i.id === p.invoiceId);
        return [
          p.paymentDate instanceof Date ? p.paymentDate : new Date(p.paymentDate),
          inv?.invoiceNumber || '—',
          custName(inv?.customerId || ''),
          propName(inv?.propertyId || ''),
          p.amountPaid,
          AR.payment.methods[p.paymentMethod],
          p.referenceNumber || '—',
        ];
      }),
      columnWidths: [14, 16, 24, 24, 14, 16, 18],
    });
    toast.success('تم تصدير ملف إكسل');
  };

  const exportHistoryPdf = async () => {
    try {
      await generateArabicPDF({
        title: 'سجل المدفوعات',
        subtitle: `${filteredHistory.length} عملية سداد — ${new Date().toLocaleDateString('en-SA')}`,
        companyName: settings?.companyName,
        logoBase64: settings?.logoBase64,
        filename: `سجل_المدفوعات_${new Date().toISOString().slice(0, 10)}.pdf`,
        sections: [{
          table: {
            headers: [AR.payment.paymentDate, AR.payment.invoice, AR.contract.customer, AR.contract.property, AR.payment.amountPaid, AR.payment.paymentMethod],
            rows: filteredHistory.map((p) => {
              const inv = invoices.find((i) => i.id === p.invoiceId);
              return [
                fmtDate(p.paymentDate),
                inv?.invoiceNumber || '—',
                custName(inv?.customerId || ''),
                propName(inv?.propertyId || ''),
                fmtMoney(p.amountPaid),
                AR.payment.methods[p.paymentMethod],
              ];
            }),
          },
        }],
      });
      toast.success('تم تنزيل ملف PDF بنجاح');
    } catch (e: any) { toast.error('تعذّر إنشاء PDF: ' + (e.message || '')); }
  };

  const printReceipt = async (p: typeof payments[0]) => {
    const inv = invoices.find((i) => i.id === p.invoiceId);
    const customer = customers.find((c) => c.id === inv?.customerId);
    const property = properties.find((pr) => pr.id === inv?.propertyId);
    try {
      await generateReceipt({
        receiptNumber: p.id?.slice(-8).toUpperCase() || 'RCP-001',
        paymentDate: p.paymentDate,
        amountPaid: p.amountPaid,
        paymentMethod: AR.payment.methods[p.paymentMethod],
        referenceNumber: p.referenceNumber,
        notes: p.notes,
        customerName: customer?.fullName || '—',
        propertyName: property?.name || '—',
        invoiceNumber: inv?.invoiceNumber,
        companyName: settings?.companyName,
        companyPhone: settings?.phone,
        currency: settings?.currency,
        logoBase64: settings?.logoBase64,
      });
    } catch (e: any) {
      toast.error('تعذّر إنشاء سند القبض: ' + (e.message || ''));
    }
  };

  return (
    <div className="space-y-4" data-testid="payments-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Wallet className="h-6 w-6" /> {AR.nav.payments}</h2>
          <p className="text-sm text-muted-foreground mt-1">فواتير ومدفوعات — تتبع الاستحقاقات والسداد.</p>
        </div>
        <div className="flex gap-2">
          {tab === 'invoices' ? (
            <>
              <Button variant="outline" onClick={exportInvoicesExcel} data-testid="export-excel-button">{AR.actions.exportExcel}</Button>
              <Button variant="outline" onClick={exportInvoicesPdf} className="gap-1.5" data-testid="export-invoices-pdf">
                <FileDown className="h-4 w-4" /> PDF
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={exportHistoryExcel} data-testid="export-history-excel">{AR.actions.exportExcel}</Button>
              <Button variant="outline" onClick={exportHistoryPdf} className="gap-1.5" data-testid="export-history-pdf">
                <FileDown className="h-4 w-4" /> PDF
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant={tab === 'invoices' ? 'default' : 'outline'} onClick={() => setTab('invoices')} data-testid="tab-invoices">الفواتير</Button>
        <Button variant={tab === 'history' ? 'default' : 'outline'} onClick={() => setTab('history')} data-testid="tab-history">سجل المدفوعات</Button>
      </div>

      {tab === 'invoices' && (
        <>
          <Card className="glass border-0 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input data-testid="payments-search-input" className="pr-9" placeholder="ابحث برقم الفاتورة أو العميل…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger data-testid="invoice-status-filter"><SelectValue placeholder={AR.invoice.status} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{AR.actions.all}</SelectItem>
                  {(Object.keys(AR.invoice.statuses) as InvoiceStatus[]).map((k) => <SelectItem key={k} value={k}>{AR.invoice.statuses[k]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Field label="تاريخ الاستحقاق من">
                <Input
                  type="date"
                  value={invoiceDateFrom}
                  max={invoiceDateTo || undefined}
                  onChange={(e) => setInvoiceDateFrom(e.target.value)}
                  data-testid="invoice-date-from"
                />
              </Field>
              <Field label="تاريخ الاستحقاق إلى">
                <Input
                  type="date"
                  value={invoiceDateTo}
                  min={invoiceDateFrom || undefined}
                  onChange={(e) => setInvoiceDateTo(e.target.value)}
                  data-testid="invoice-date-to"
                />
              </Field>
            </div>
          </Card>

          <Card className="glass border-0 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{AR.invoice.number}</TableHead>
                    <TableHead>{AR.contract.customer}</TableHead>
                    <TableHead>{AR.contract.property}</TableHead>
                    <TableHead>{AR.invoice.dueDate}</TableHead>
                    <TableHead>{AR.invoice.amountDue}</TableHead>
                    <TableHead>{AR.invoice.balance}</TableHead>
                    <TableHead>{AR.invoice.status}</TableHead>
                    <TableHead className="text-left">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">{AR.common.empty}</TableCell></TableRow>
                  ) : filtered.map((i) => {
                    const balance = Math.max(0, i.amountDue - i.amountPaid);
                    return (
                      <TableRow key={i.id} data-testid={`invoice-row-${i.id}`}>
                        <TableCell className="num font-semibold">{i.invoiceNumber}</TableCell>
                        <TableCell>{custName(i.customerId)}</TableCell>
                        <TableCell>{propName(i.propertyId)}</TableCell>
                        <TableCell className="text-xs">{fmtDate(i.dueDate)}</TableCell>
                        <TableCell className="num">{fmtMoney(i.amountDue)}</TableCell>
                        <TableCell className="num">{fmtMoney(balance)}</TableCell>
                        <TableCell><Badge variant="outline" className={INV_TONE[i.status]}>{AR.invoice.statuses[i.status]}</Badge></TableCell>
                        <TableCell>
                          {balance > 0 && i.status !== 'canceled' && (
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <Button size="sm" variant="outline" onClick={() => setPayDialog({ invoiceId: i.id!, contractId: i.contractId, balance })} data-testid={`pay-invoice-${i.id}`}>
                                {AR.payment.recordPayment}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-[#25D366] hover:bg-[#25D366]/10 hover:text-[#128C7E]"
                                onClick={() => sendInvoiceReminder(i, balance)}
                                title="إرسال تذكير بالسداد عبر واتساب"
                                aria-label={`إرسال تذكير واتساب للفاتورة ${i.invoiceNumber}`}
                                data-testid={`whatsapp-invoice-${i.id}`}
                              >
                                <WhatsAppIcon className="h-5 w-5" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}

      {tab === 'history' && (
        <>
          <Card className="glass border-0 p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  data-testid="payment-history-search-input"
                  className="pr-9"
                  placeholder="ابحث برقم الفاتورة INV أو اسم العميل…"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                />
              </div>
              <Field label="تاريخ السداد من">
                <Input
                  type="date"
                  value={historyDateFrom}
                  max={historyDateTo || undefined}
                  onChange={(e) => setHistoryDateFrom(e.target.value)}
                  data-testid="payment-history-date-from"
                />
              </Field>
              <Field label="تاريخ السداد إلى">
                <Input
                  type="date"
                  value={historyDateTo}
                  min={historyDateFrom || undefined}
                  onChange={(e) => setHistoryDateTo(e.target.value)}
                  data-testid="payment-history-date-to"
                />
              </Field>
            </div>
          </Card>
          <Card className="glass border-0 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{AR.payment.paymentDate}</TableHead>
                  <TableHead>{AR.payment.invoice}</TableHead>
                  <TableHead>{AR.contract.customer}</TableHead>
                  <TableHead>{AR.payment.amountPaid}</TableHead>
                  <TableHead>{AR.payment.paymentMethod}</TableHead>
                  <TableHead>{AR.payment.referenceNumber}</TableHead>
                  <TableHead className="text-left">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHistory.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{AR.common.empty}</TableCell></TableRow>
                ) : filteredHistory.map((p) => {
                  const inv = invoices.find((i) => i.id === p.invoiceId);
                  return (
                    <TableRow key={p.id} data-testid={`payment-row-${p.id}`}>
                      <TableCell>{fmtDate(p.paymentDate)}</TableCell>
                      <TableCell className="num">{inv?.invoiceNumber || '—'}</TableCell>
                      <TableCell>{custName(inv?.customerId || '')}</TableCell>
                      <TableCell className="num">{fmtMoney(p.amountPaid)}</TableCell>
                      <TableCell>{AR.payment.methods[p.paymentMethod]}</TableCell>
                      <TableCell className="num text-xs">{p.referenceNumber || '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" onClick={() => printReceipt(p)} title="سند قبض" data-testid={`receipt-${p.id}`}>
                          <Receipt className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => removePayment(p)}
                          title="حذف السداد"
                          aria-label="حذف السداد"
                          data-testid={`delete-payment-${p.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}

      {payDialog && <PaymentDialog {...payDialog} onClose={() => setPayDialog(null)} />}
    </div>
  );
}

function PaymentDialog({ invoiceId, contractId, balance, onClose }: { invoiceId: string; contractId: string; balance: number; onClose: () => void }) {
  const receiptRef = useRef<HTMLInputElement>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    amountPaid: balance,
    paymentDate: toISODate(new Date()),
    paymentMethod: 'cash' as PaymentMethod,
    referenceNumber: '',
    notes: '',
  });

  const submit = async () => {
    if (!form.amountPaid || form.amountPaid <= 0) { toast.error('يرجى إدخال مبلغ صالح'); return; }
    if (form.amountPaid > balance) { toast.error(`المبلغ يتجاوز الرصيد المتبقي (${fmtMoney(balance)})`); return; }
    try {
      const receipt = receiptFile ? {
        fileName: receiptFile.name,
        fileType: receiptFile.type,
        fileDataBase64: await fileToBase64(receiptFile),
      } : undefined;
      await recordPayment(
        {
          contractId,
          invoiceId,
          amountPaid: Number(form.amountPaid),
          paymentDate: new Date(form.paymentDate),
          paymentMethod: form.paymentMethod,
          referenceNumber: form.referenceNumber || undefined,
          notes: form.notes || undefined,
          status: 'completed',
        },
        receipt,
      );
      toast.success(receiptFile ? 'تم تسجيل السداد وإرفاق صورة الوصل' : 'تم تسجيل السداد');
      onClose();
    } catch (e: any) { toast.error(e.message || AR.common.error); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="payment-dialog">
        <DialogHeader><DialogTitle>{AR.payment.addNew}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-xl bg-muted/60 px-4 py-3">
            <div className="text-xs text-muted-foreground">{AR.invoice.balance}</div>
            <div className="font-bold text-lg num">{fmtMoney(balance)}</div>
          </div>
          <Field label={AR.payment.amountPaid}><Input type="number" value={form.amountPaid} onChange={(e) => setForm({ ...form, amountPaid: parseFloat(e.target.value) })} data-testid="payment-amount-input" /></Field>
          <Field label={AR.payment.paymentDate}><Input type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} data-testid="payment-date-input" /></Field>
          <Field label={AR.payment.paymentMethod}>
            <Select value={form.paymentMethod} onValueChange={(v) => setForm({ ...form, paymentMethod: v as PaymentMethod })}>
              <SelectTrigger data-testid="payment-method-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(AR.payment.methods) as PaymentMethod[]).map((k) => <SelectItem key={k} value={k}>{AR.payment.methods[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label={AR.payment.referenceNumber}><Input value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} data-testid="payment-reference-input" /></Field>
          <Field label={AR.payment.notes}><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <Field label="إرفاق صورة الوصل (اختياري)">
            <div
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 transition-colors hover:bg-muted/50"
              onClick={() => receiptRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => event.key === 'Enter' && receiptRef.current?.click()}
              data-testid="payment-receipt-upload"
            >
              <ImagePlus className="h-5 w-5 shrink-0 text-muted-foreground" />
              {receiptFile ? (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{receiptFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(receiptFile.size / 1024).toFixed(0)} KB</p>
                </div>
              ) : (
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">اضغط لإرفاق صورة وصل السداد</p>
                  <p className="text-xs text-muted-foreground">JPG · PNG · WEBP - بحد أقصى 8 MB</p>
                </div>
              )}
              {receiptFile && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={(event) => {
                    event.stopPropagation();
                    setReceiptFile(null);
                  }}
                >
                  إلغاء
                </Button>
              )}
            </div>
            <input
              ref={receiptRef}
              type="file"
              className="hidden"
              accept="image/jpeg,image/png,image/webp"
              data-testid="payment-receipt-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                if (!file.type.startsWith('image/')) {
                  toast.error('يرجى اختيار صورة وصل بصيغة JPG أو PNG أو WEBP');
                  return;
                }
                if (file.size > 8 * 1024 * 1024) {
                  toast.error('حجم صورة الوصل يجب ألا يتجاوز 8 MB');
                  return;
                }
                setReceiptFile(file);
              }}
            />
          </Field>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>{AR.actions.cancel}</Button>
          <Button onClick={submit} data-testid="payment-save-button">{AR.actions.confirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
