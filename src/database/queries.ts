import { db } from './db';
import { v4 as uuid } from 'uuid';
import type {
  Property, Customer, Contract, Invoice, Payment, DocumentFile,
  ActivityLog, MaintenanceItem, Task,
} from '../models/types';
import { roundCurrency } from '../utils/financialCalculations';
import { allocateInvoiceAmounts, calculateIntervals } from '../utils/contractCalculations';
export { calculateIntervals } from '../utils/contractCalculations';

// ---------- ACTIVITY LOG ----------
export async function logActivity(
  action: string,
  module: ActivityLog['module'],
  details = ''
): Promise<void> {
  await db.activityLogs.add({
    id: uuid(),
    action,
    module,
    timestamp: new Date(),
    details,
  });
}

// ---------- PROPERTIES ----------
export async function createProperty(data: Omit<Property, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const id = uuid();
  const now = new Date();
  await db.properties.add({ ...data, id, createdAt: now, updatedAt: now });
  await logActivity('إضافة عقار جديد', 'properties', data.name);
  return id;
}

export async function updateProperty(id: string, data: Partial<Property>): Promise<void> {
  await db.properties.update(id, { ...data, updatedAt: new Date() });
  await logActivity('تعديل عقار', 'properties', data.name || id);
}

export async function deleteProperty(id: string): Promise<void> {
  const contracts = await db.contracts.where('propertyId').equals(id).count();
  if (contracts > 0) {
    throw new Error('لا يمكن حذف العقار لوجود عقود مرتبطة به. يرجى إنهاء العقود أولاً.');
  }
  const prop = await db.properties.get(id);
  await db.properties.delete(id);
  await db.documents.where('relatedId').equals(id).delete();
  await logActivity('حذف عقار', 'properties', prop?.name || id);
}

// ---------- CUSTOMERS ----------
export async function createCustomer(data: Omit<Customer, 'id' | 'createdAt'>): Promise<string> {
  const id = uuid();
  await db.customers.add({ ...data, id, createdAt: new Date() });
  await logActivity('إضافة عميل جديد', 'customers', data.fullName);
  return id;
}

export async function updateCustomer(id: string, data: Partial<Customer>): Promise<void> {
  await db.customers.update(id, data);
  await logActivity('تعديل بيانات عميل', 'customers', data.fullName || id);
}

export async function deleteCustomer(id: string): Promise<void> {
  const contracts = await db.contracts.where('customerId').equals(id).count();
  if (contracts > 0) {
    throw new Error('لا يمكن حذف العميل لوجود عقود مرتبطة به.');
  }
  const c = await db.customers.get(id);
  await db.customers.delete(id);
  await logActivity('حذف عميل', 'customers', c?.fullName || id);
}

// ---------- CONTRACTS + INVOICE GENERATION ----------
function padSeq(n: number): string {
  return n.toString().padStart(4, '0');
}

export async function createContractWithInvoices(
  data: Omit<Contract, 'id' | 'createdAt' | 'remainingBalance'>
): Promise<{ contractId: string; invoicesCreated: number }> {
  if (!Number.isFinite(data.totalAmount) || data.totalAmount <= 0) {
    throw new Error('يجب أن تكون القيمة الإجمالية للعقد أكبر من صفر.');
  }
  const contractId = uuid();
  const intervals = calculateIntervals(data.startDate, data.endDate, data.paymentFrequency);
  const totalAmount = roundCurrency(data.totalAmount);
  const invoiceAmounts = allocateInvoiceAmounts(totalAmount, intervals.length);

  await db.transaction(
    'rw',
    db.contracts, db.invoices, db.properties, db.activityLogs,
    async () => {
      await db.contracts.add({
        ...data,
        id: contractId,
        totalAmount,
        remainingBalance: totalAmount,
        createdAt: new Date(),
      });
      const year = new Date().getFullYear();
      const prefix = `INV-${year}-`;
      const existing = await db.invoices.toArray();
      const startSeq = existing
        .map((i) => i.invoiceNumber)
        .filter((n) => n?.startsWith(prefix))
        .map((n) => parseInt(n.replace(prefix, ''), 10))
        .filter((n) => !isNaN(n));
      let seq = startSeq.length ? Math.max(...startSeq) : 0;

      for (const [index, interval] of intervals.entries()) {
        seq += 1;
        const inv: Invoice = {
          id: uuid(),
          contractId,
          customerId: data.customerId,
          propertyId: data.propertyId,
          invoiceNumber: `${prefix}${padSeq(seq)}`,
          dueDate: interval.dueDate,
          amountDue: invoiceAmounts[index],
          amountPaid: 0,
          status: 'unpaid',
          createdAt: new Date(),
        };
        await db.invoices.add(inv);
      }
      const nextStatus = data.contractType === 'rent' ? 'rented' : 'sold';
      await db.properties.update(data.propertyId, { status: nextStatus, updatedAt: new Date() });
      await db.activityLogs.add({
        id: uuid(), action: 'إبرام عقد جديد', module: 'contracts',
        timestamp: new Date(), details: `تم إنشاء ${intervals.length} فاتورة`,
      });
    }
  );

  return { contractId, invoicesCreated: intervals.length };
}

export async function terminateContract(id: string): Promise<void> {
  const contract = await db.contracts.get(id);
  if (!contract) return;
  await db.transaction('rw', db.contracts, db.invoices, db.properties, db.activityLogs, async () => {
    const now = new Date();
    const invoices = await db.invoices.where('contractId').equals(id).toArray();
    let remainingBalance = 0;
    for (const invoice of invoices) {
      const shouldCancel = invoice.amountPaid <= 0 && new Date(invoice.dueDate) > now && invoice.status !== 'paid';
      if (shouldCancel) {
        await db.invoices.update(invoice.id!, { status: 'canceled' });
      } else if (invoice.status !== 'canceled') {
        remainingBalance += Math.max(0, invoice.amountDue - invoice.amountPaid);
      }
    }
    await db.contracts.update(id, {
      status: 'terminated',
      remainingBalance: roundCurrency(remainingBalance),
    });
    await db.properties.update(contract.propertyId, { status: 'vacant', updatedAt: new Date() });
    await db.activityLogs.add({ id: uuid(), action: 'إنهاء عقد', module: 'contracts', timestamp: new Date(), details: id });
  });
}

export async function deleteContract(id: string): Promise<void> {
  const contract = await db.contracts.get(id);
  if (!contract) return;
  await db.transaction('rw', [db.contracts, db.invoices, db.payments, db.documents, db.properties, db.activityLogs], async () => {
    await db.invoices.where('contractId').equals(id).delete();
    await db.payments.where('contractId').equals(id).delete();
    await db.documents.where('relatedId').equals(id).delete();
    await db.contracts.delete(id);
    await db.properties.update(contract.propertyId, { status: 'vacant', updatedAt: new Date() });
    await db.activityLogs.add({ id: uuid(), action: 'حذف عقد وفواتيره', module: 'contracts', timestamp: new Date(), details: id });
  });
}

// ---------- PAYMENTS ----------
export async function recordPayment(data: Omit<Payment, 'id'>): Promise<string> {
  const id = uuid();
  await db.transaction('rw', db.payments, db.invoices, db.contracts, db.activityLogs, async () => {
    const invoice = await db.invoices.get(data.invoiceId);
    if (!invoice) throw new Error('الفاتورة غير موجودة.');
    if (invoice.contractId !== data.contractId) throw new Error('الفاتورة لا تتبع العقد المحدد.');
    if (invoice.status === 'canceled') throw new Error('لا يمكن تسجيل سداد لفاتورة ملغاة.');
    const amountPaid = roundCurrency(Number(data.amountPaid));
    const balance = roundCurrency(Math.max(0, invoice.amountDue - invoice.amountPaid));
    if (!Number.isFinite(amountPaid) || amountPaid <= 0) throw new Error('مبلغ السداد غير صالح.');
    if (amountPaid > balance) throw new Error('مبلغ السداد يتجاوز الرصيد المتبقي.');
    await db.payments.add({ ...data, amountPaid, id });
    const newPaid = roundCurrency(invoice.amountPaid + amountPaid);
    let newStatus: Invoice['status'] = 'unpaid';
    if (newPaid >= invoice.amountDue) newStatus = 'paid';
    else if (newPaid > 0) newStatus = 'partial';
    else if (invoice.dueDate < new Date()) newStatus = 'overdue';
    await db.invoices.update(data.invoiceId, { amountPaid: newPaid, status: newStatus });
    const contract = await db.contracts.get(data.contractId);
    if (contract) {
      const contractInvoices = await db.invoices.where('contractId').equals(data.contractId).toArray();
      const remainingBalance = contractInvoices.reduce((sum, item) => (
        item.status === 'canceled' ? sum : sum + Math.max(0, item.amountDue - item.amountPaid)
      ), 0);
      await db.contracts.update(data.contractId, {
        remainingBalance: roundCurrency(remainingBalance),
      });
    }
    await db.activityLogs.add({
      id: uuid(), action: 'تسجيل دفعة', module: 'payments',
      timestamp: new Date(), details: `${amountPaid}`,
    });
  });
  return id;
}

// ---------- DOCUMENTS ----------
export async function uploadDocument(file: File, relatedType: DocumentFile['relatedType'], relatedId: string): Promise<void> {
  const base64 = await fileToBase64(file);
  await db.documents.add({
    id: uuid(),
    relatedType,
    relatedId,
    fileName: file.name,
    fileType: file.type,
    fileDataBase64: base64,
    uploadedAt: new Date(),
  });
  await logActivity('رفع مستند', 'contracts', file.name);
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function downloadDocument(doc: DocumentFile): void {
  const a = document.createElement('a');
  a.href = doc.fileDataBase64;
  a.download = doc.fileName;
  a.click();
}

// ---------- Overdue refresh ----------
export async function refreshOverdueInvoices(): Promise<number> {
  const now = new Date();
  const invoices = await db.invoices.toArray();
  const contracts = await db.contracts.toArray();
  const contractStatus = new Map(contracts.map((contract) => [contract.id, contract.status]));
  const balancesToRefresh = new Set<string>();
  let count = 0;
  for (const inv of invoices) {
    const status = contractStatus.get(inv.contractId);
    if ((status === 'terminated' || status === 'canceled') && inv.amountPaid <= 0 && inv.dueDate > now && inv.status !== 'canceled') {
      await db.invoices.update(inv.id!, { status: 'canceled' });
      balancesToRefresh.add(inv.contractId);
      continue;
    }
    if (inv.status === 'unpaid' && inv.dueDate < now) {
      await db.invoices.update(inv.id!, { status: 'overdue' });
      count++;
    }
  }
  for (const contractId of balancesToRefresh) {
    const contractInvoices = await db.invoices.where('contractId').equals(contractId).toArray();
    const remainingBalance = contractInvoices.reduce((sum, invoice) => (
      invoice.status === 'canceled' ? sum : sum + Math.max(0, invoice.amountDue - invoice.amountPaid)
    ), 0);
    await db.contracts.update(contractId, { remainingBalance: roundCurrency(remainingBalance) });
  }
  return count;
}

// ---------- MAINTENANCE ----------
export async function createMaintenanceItem(data: Omit<MaintenanceItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const id = uuid();
  const now = new Date();
  await db.maintenance.add({ ...data, id, createdAt: now, updatedAt: now });
  await logActivity('إضافة طلب صيانة', 'maintenance', data.title);
  return id;
}

export async function updateMaintenanceItem(id: string, data: Partial<MaintenanceItem>): Promise<void> {
  await db.maintenance.update(id, { ...data, updatedAt: new Date() });
  await logActivity('تعديل طلب صيانة', 'maintenance', data.title || id);
}

export async function deleteMaintenanceItem(id: string): Promise<void> {
  const item = await db.maintenance.get(id);
  await db.maintenance.delete(id);
  await logActivity('حذف طلب صيانة', 'maintenance', item?.title || id);
}

// ---------- TASKS ----------
export async function createTask(data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const id = uuid();
  const now = new Date();
  await db.tasks.add({ ...data, id, createdAt: now, updatedAt: now });
  await logActivity('إضافة مهمة', 'tasks', data.title);
  return id;
}

export async function updateTask(id: string, data: Partial<Task>): Promise<void> {
  await db.tasks.update(id, { ...data, updatedAt: new Date() });
  await logActivity('تعديل مهمة', 'tasks', data.title || id);
}

export async function deleteTask(id: string): Promise<void> {
  const task = await db.tasks.get(id);
  await db.tasks.delete(id);
  await logActivity('حذف مهمة', 'tasks', task?.title || id);
}

// ---------- Backup ----------
export async function exportBackup(): Promise<Blob> {
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    properties: await db.properties.toArray(),
    customers: await db.customers.toArray(),
    contracts: await db.contracts.toArray(),
    payments: await db.payments.toArray(),
    invoices: await db.invoices.toArray(),
    documents: await db.documents.toArray(),
    notifications: await db.notifications.toArray(),
    activityLogs: await db.activityLogs.toArray(),
    settings: await db.settings.toArray(),
    maintenance: await db.maintenance.toArray(),
    tasks: await db.tasks.toArray(),
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

export async function importBackup(json: string): Promise<{ ok: boolean; message: string }> {
  let data: any;
  try { data = JSON.parse(json); } catch { return { ok: false, message: 'الملف تالف أو غير صالح' }; }
  const requiredKeys = ['properties', 'customers', 'contracts', 'invoices', 'payments'];
  for (const k of requiredKeys) {
    if (!(k in data)) return { ok: false, message: `الملف ينقصه الجدول: ${k}` };
  }
  const revive = <T extends Record<string, any>>(arr: T[], dateFields: string[]) =>
    (arr || []).map((r) => {
      const clone: any = { ...r };
      for (const f of dateFields) { if (clone[f]) clone[f] = new Date(clone[f]); }
      return clone as T;
    });
  await db.transaction('rw',
    [db.properties, db.customers, db.contracts, db.payments, db.invoices,
     db.documents, db.notifications, db.activityLogs, db.settings, db.maintenance, db.tasks],
    async () => {
      await Promise.all([
        db.properties.clear(), db.customers.clear(), db.contracts.clear(),
        db.payments.clear(), db.invoices.clear(), db.documents.clear(),
        db.notifications.clear(), db.activityLogs.clear(), db.maintenance.clear(), db.tasks.clear(),
      ]);
      if (data.properties?.length) await db.properties.bulkAdd(revive(data.properties, ['createdAt', 'updatedAt']));
      if (data.customers?.length) await db.customers.bulkAdd(revive(data.customers, ['createdAt']));
      if (data.contracts?.length) await db.contracts.bulkAdd(revive(data.contracts, ['startDate', 'endDate', 'createdAt']));
      if (data.payments?.length) await db.payments.bulkAdd(revive(data.payments, ['paymentDate']));
      if (data.invoices?.length) await db.invoices.bulkAdd(revive(data.invoices, ['dueDate', 'createdAt']));
      if (data.documents?.length) await db.documents.bulkAdd(revive(data.documents, ['uploadedAt']));
      if (data.notifications?.length) await db.notifications.bulkAdd(revive(data.notifications, ['triggerDate']));
      if (data.activityLogs?.length) await db.activityLogs.bulkAdd(revive(data.activityLogs, ['timestamp']));
      if (data.maintenance?.length) await db.maintenance.bulkAdd(revive(data.maintenance, ['scheduledDate', 'completedDate', 'createdAt', 'updatedAt']));
      if (data.tasks?.length) await db.tasks.bulkAdd(revive(data.tasks, ['dueDate', 'createdAt', 'updatedAt']));
      if (data.settings?.length) { for (const s of data.settings) await db.settings.put(s); }
    }
  );
  return { ok: true, message: 'تم استيراد النسخة الاحتياطية بنجاح' };
}

export async function resetDatabase(): Promise<void> {
  await db.transaction('rw',
    [db.properties, db.customers, db.contracts, db.payments, db.invoices,
     db.documents, db.notifications, db.activityLogs, db.settings, db.maintenance, db.tasks],
    async () => {
      await Promise.all([
        db.properties.clear(), db.customers.clear(), db.contracts.clear(),
        db.payments.clear(), db.invoices.clear(), db.documents.clear(),
        db.notifications.clear(), db.activityLogs.clear(), db.settings.clear(),
        db.maintenance.clear(), db.tasks.clear(),
      ]);
    }
  );
}

export async function seedDemoData(): Promise<void> {
  if (localStorage.getItem('sre_demo_seeded')) return;
  const propCount = await db.properties.count();
  if (propCount > 0) {
    localStorage.setItem('sre_demo_seeded', '1');
    return;
  }
  const now = new Date();
  const props: Property[] = [
    { id: uuid(), name: 'برج الياسمين', type: 'building', status: 'vacant', address: 'شارع الملك فهد', city: 'الرياض', price: 1200000, currency: 'SAR', createdAt: now, updatedAt: now },
    { id: uuid(), name: 'فيلا الشاطئ', type: 'villa', status: 'vacant', address: 'حي الروضة', city: 'جدة', price: 250000, currency: 'SAR', createdAt: now, updatedAt: now },
    { id: uuid(), name: 'شقة النخيل', type: 'apartment', status: 'vacant', address: 'حي النخيل', city: 'الرياض', price: 45000, currency: 'SAR', createdAt: now, updatedAt: now },
    { id: uuid(), name: 'محل تجاري الوادي', type: 'commercial', status: 'vacant', address: 'شارع التحلية', city: 'الدمام', price: 90000, currency: 'SAR', createdAt: now, updatedAt: now },
  ];
  await db.properties.bulkAdd(props);
  const customers: Customer[] = [
    { id: uuid(), fullName: 'محمد أحمد الغامدي', nationalId: '1023456789', phone: '0555123456', email: 'm.ghamdi@example.sa', address: 'حي الملز', city: 'الرياض', createdAt: now },
    { id: uuid(), fullName: 'خديجة عبدالله السبيعي', nationalId: '1099887766', phone: '0561234567', email: 'k.subaie@example.sa', address: 'حي الصفا', city: 'جدة', createdAt: now },
  ];
  await db.customers.bulkAdd(customers);
    await logActivity('تهيئة بيانات تجريبية', 'system', 'عقارات وعملاء');
  localStorage.setItem('sre_demo_seeded', '1');
}
