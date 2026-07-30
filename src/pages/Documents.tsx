import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../database/db';
import { AR } from '../constants/arabicTerms';
import { fmtDate, fmtRelative } from '../utils/dateHelpers';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { FolderOpen, Download, Trash2, Upload, Search, File, FileImage, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { uploadDocument, downloadDocument } from '../database/queries';
import type { DocumentRelated } from '../models/types';
import { documentMatchesCustomerName, getDocumentCustomerNames } from '../utils/documentCustomers';
import { getContractDisplayNumber } from '../utils/contractNumbers';

const RELATED_LABELS: Record<DocumentRelated, string> = {
  property: 'عقار',
  contract: 'عقد',
  customer: 'عميل',
  payment: 'سداد',
};

function FileIcon({ type }: { type: string }) {
  if (type.startsWith('image/')) return <FileImage className="h-4 w-4 text-accent" />;
  if (type === 'application/pdf') return <FileText className="h-4 w-4 text-destructive" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

export default function Documents() {
  const docs        = useLiveQuery(() => db.documents.orderBy('uploadedAt').reverse().toArray(), []) || [];
  const properties  = useLiveQuery(() => db.properties.toArray(), []) || [];
  const contracts   = useLiveQuery(() => db.contracts.toArray(), []) || [];
  const customers   = useLiveQuery(() => db.customers.toArray(), []) || [];
  const payments    = useLiveQuery(() => db.payments.orderBy('paymentDate').reverse().toArray(), []) || [];
  const invoices    = useLiveQuery(() => db.invoices.toArray(), []) || [];

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | DocumentRelated>('all');
  const [selectedRelatedType, setSelectedRelatedType] = useState<DocumentRelated>('contract');
  const [selectedRelatedId, setSelectedRelatedId] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const relatedOptions = useMemo(() => {
    if (selectedRelatedType === 'property') return properties.map((p) => ({ id: p.id!, label: p.name }));
    if (selectedRelatedType === 'contract')  return contracts.map((c) => ({ id: c.id!, label: `عقد ${getContractDisplayNumber(c, contracts)}` }));
    if (selectedRelatedType === 'customer')  return customers.map((c) => ({ id: c.id!, label: c.fullName }));
    if (selectedRelatedType === 'payment') return payments.map((payment) => ({
      id: payment.id!,
      label: `${invoices.find((invoice) => invoice.id === payment.invoiceId)?.invoiceNumber || 'سداد'} - ${fmtDate(payment.paymentDate)}`,
    }));
    return [];
  }, [selectedRelatedType, properties, contracts, customers, payments, invoices]);

  const related = (doc: typeof docs[0]) => {
    if (doc.relatedType === 'property') return properties.find((p) => p.id === doc.relatedId)?.name || '—';
    if (doc.relatedType === 'contract') {
      const contract = contracts.find((item) => item.id === doc.relatedId);
      return contract ? `عقد ${getContractDisplayNumber(contract, contracts)}` : `عقد ${doc.relatedId.slice(-6)}`;
    }
    if (doc.relatedType === 'customer') return customers.find((c) => c.id === doc.relatedId)?.fullName || '—';
    if (doc.relatedType === 'payment') {
      const payment = payments.find((item) => item.id === doc.relatedId);
      const invoice = invoices.find((item) => item.id === payment?.invoiceId);
      return invoice ? `سداد ${invoice.invoiceNumber}` : `سداد ${doc.relatedId.slice(-6)}`;
    }
    return '—';
  };

  const customerNames = (doc: typeof docs[0]) => getDocumentCustomerNames(doc, {
    customers,
    contracts,
    invoices,
    payments,
  });

  const filtered = useMemo(() => {
    return docs.filter((d) => {
      if (typeFilter !== 'all' && d.relatedType !== typeFilter) return false;
      if (!documentMatchesCustomerName(d, search, { customers, contracts, invoices, payments })) return false;
      return true;
    });
  }, [docs, typeFilter, search, customers, contracts, invoices, payments]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!selectedRelatedId) { toast.error('يرجى اختيار السجل المرتبط أولاً'); return; }
    try {
      await uploadDocument(file, selectedRelatedType, selectedRelatedId);
      toast.success('تم رفع المستند');
    } catch (err: any) { toast.error(err.message || AR.common.error); }
    e.target.value = '';
  };

  const onDelete = async (id: string, name: string) => {
    if (!confirm(`${AR.common.confirmDelete}\n${name}`)) return;
    await db.documents.delete(id);
    toast.success('تم حذف المستند');
  };

  const totalSize = useMemo(() => {
    // Rough estimate: base64 is ~4/3 original size
    return docs.reduce((s, d) => s + Math.round(d.fileDataBase64.length * 0.75 / 1024), 0);
  }, [docs]);

  return (
    <div className="space-y-4" data-testid="documents-page">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2"><FolderOpen className="h-6 w-6" /> {AR.nav.documents}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {docs.length} مستند · حجم تقريبي: {totalSize < 1024 ? `${totalSize} كب` : `${(totalSize / 1024).toFixed(1)} مب`}
        </p>
      </div>

      {/* Upload area */}
      <Card className="glass border-0">
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Upload className="h-4 w-4" /> رفع مستند جديد</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Select value={selectedRelatedType} onValueChange={(v) => { setSelectedRelatedType(v as DocumentRelated); setSelectedRelatedId(''); }}>
              <SelectTrigger><SelectValue placeholder="نوع السجل" /></SelectTrigger>
              <SelectContent>
                {Object.entries(RELATED_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={selectedRelatedId} onValueChange={setSelectedRelatedId}>
              <SelectTrigger><SelectValue placeholder="اختر السجل" /></SelectTrigger>
              <SelectContent>
                {relatedOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={() => fileRef.current?.click()} className="gap-1.5" data-testid="upload-doc-button">
              <Upload className="h-4 w-4" /> {AR.actions.upload}
            </Button>
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" onChange={onUpload} data-testid="doc-file-input" />
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="glass border-0 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ابحث باسم العميل…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9"
              data-testid="documents-customer-search-input"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
            <SelectTrigger><SelectValue placeholder="نوع السجل" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{AR.actions.all}</SelectItem>
              {Object.entries(RELATED_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Table */}
      <Card className="glass border-0 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الملف</TableHead>
                <TableHead>نوع السجل</TableHead>
                <TableHead>اسم العميل</TableHead>
                <TableHead>مرتبط بـ</TableHead>
                <TableHead>تاريخ الرفع</TableHead>
                <TableHead className="text-left">{AR.actions.view}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{AR.common.empty}</TableCell></TableRow>
              ) : filtered.map((doc) => (
                <TableRow key={doc.id} data-testid={`doc-row-${doc.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileIcon type={doc.fileType} />
                      <span className="text-sm truncate max-w-48">{doc.fileName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{RELATED_LABELS[doc.relatedType]}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{customerNames(doc).join('، ') || '—'}</TableCell>
                  <TableCell className="text-sm">{related(doc)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtRelative(doc.uploadedAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => downloadDocument(doc)} title={AR.actions.download}><Download className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => onDelete(doc.id!, doc.fileName)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
