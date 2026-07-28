const REQUIRED_TABLES = ['properties', 'customers', 'contracts', 'invoices', 'payments'] as const;
const OPTIONAL_TABLES = ['documents', 'notifications', 'activityLogs', 'settings', 'maintenance', 'tasks'] as const;

type BackupRecord = Record<string, unknown>;

export interface BackupValidationResult {
  ok: boolean;
  message: string;
  warnings: string[];
}

function isRecord(value: unknown): value is BackupRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validDate(value: unknown): boolean {
  return value == null || value === '' || !Number.isNaN(new Date(String(value)).getTime());
}

export function validateBackupPayload(data: unknown): BackupValidationResult {
  if (!isRecord(data)) {
    return { ok: false, message: 'الملف لا يحتوي على نسخة احتياطية صالحة', warnings: [] };
  }

  const version = Number(data.version);
  if (!Number.isInteger(version) || version < 1 || version > 2) {
    return { ok: false, message: 'إصدار النسخة الاحتياطية غير مدعوم', warnings: [] };
  }

  for (const table of REQUIRED_TABLES) {
    if (!Array.isArray(data[table])) {
      return { ok: false, message: `الملف ينقصه الجدول: ${table}`, warnings: [] };
    }
  }
  for (const table of OPTIONAL_TABLES) {
    if (data[table] != null && !Array.isArray(data[table])) {
      return { ok: false, message: `جدول ${table} غير صالح`, warnings: [] };
    }
  }

  const tables = [...REQUIRED_TABLES, ...OPTIONAL_TABLES];
  const ids = new Map<string, Set<string>>();
  for (const table of tables) {
    const records = (data[table] as unknown[] | undefined) || [];
    const seen = new Set<string>();
    for (const record of records) {
      if (!isRecord(record) || typeof record.id !== 'string' || !record.id.trim()) {
        return { ok: false, message: `يوجد سجل غير صالح في جدول ${table}`, warnings: [] };
      }
      if (seen.has(record.id)) {
        return { ok: false, message: `يوجد معرّف مكرر في جدول ${table}`, warnings: [] };
      }
      seen.add(record.id);
    }
    ids.set(table, seen);
  }

  const dateFields: Record<string, string[]> = {
    properties: ['createdAt', 'updatedAt'],
    customers: ['createdAt'],
    contracts: ['startDate', 'endDate', 'createdAt'],
    payments: ['paymentDate'],
    invoices: ['dueDate', 'createdAt'],
    documents: ['uploadedAt'],
    notifications: ['triggerDate'],
    activityLogs: ['timestamp'],
    maintenance: ['scheduledDate', 'completedDate', 'createdAt', 'updatedAt'],
    tasks: ['dueDate', 'createdAt', 'updatedAt'],
  };
  for (const [table, fields] of Object.entries(dateFields)) {
    for (const record of ((data[table] as BackupRecord[] | undefined) || [])) {
      if (fields.some((field) => !validDate(record[field]))) {
        return { ok: false, message: `يوجد تاريخ غير صالح في جدول ${table}`, warnings: [] };
      }
    }
  }

  const properties = ids.get('properties')!;
  const customers = ids.get('customers')!;
  const contracts = ids.get('contracts')!;
  const invoices = ids.get('invoices')!;
  const hasId = (set: Set<string>, value: unknown) => typeof value === 'string' && set.has(value);

  for (const contract of data.contracts as BackupRecord[]) {
    if (!hasId(properties, contract.propertyId) || !hasId(customers, contract.customerId)) {
      return { ok: false, message: 'يوجد عقد مرتبط بعقار أو عميل غير موجود', warnings: [] };
    }
  }
  for (const invoice of data.invoices as BackupRecord[]) {
    if (
      !hasId(contracts, invoice.contractId)
      || !hasId(properties, invoice.propertyId)
      || !hasId(customers, invoice.customerId)
    ) {
      return { ok: false, message: 'توجد فاتورة مرتبطة بسجل غير موجود', warnings: [] };
    }
  }
  for (const payment of data.payments as BackupRecord[]) {
    if (!hasId(contracts, payment.contractId) || !hasId(invoices, payment.invoiceId)) {
      return { ok: false, message: 'توجد دفعة مرتبطة بعقد أو فاتورة غير موجودة', warnings: [] };
    }
  }

  let orphanDocuments = 0;
  for (const document of ((data.documents as BackupRecord[] | undefined) || [])) {
    const target = document.relatedType === 'property'
      ? properties
      : document.relatedType === 'customer'
        ? customers
        : document.relatedType === 'contract'
          ? contracts
          : undefined;
    if (!target || !hasId(target, document.relatedId)) orphanDocuments += 1;
  }

  const warnings = orphanDocuments > 0
    ? [`يوجد ${orphanDocuments} مستنداً قديماً غير مرتبط؛ سيُحفظ دون أن يؤثر في السجلات الحالية`]
    : [];
  return { ok: true, message: 'النسخة الاحتياطية صالحة للاستيراد', warnings };
}
