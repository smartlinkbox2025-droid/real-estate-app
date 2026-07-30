import Dexie, { type Table } from 'dexie';
import type {
  Property, Customer, Contract, Payment, Invoice,
  DocumentFile, Notification, ActivityLog, SystemSettings,
  MaintenanceItem, Task,
} from '../models/types';

export class SmartRealEstateDB extends Dexie {
  properties!: Table<Property, string>;
  customers!: Table<Customer, string>;
  contracts!: Table<Contract, string>;
  payments!: Table<Payment, string>;
  invoices!: Table<Invoice, string>;
  documents!: Table<DocumentFile, string>;
  notifications!: Table<Notification, string>;
  activityLogs!: Table<ActivityLog, string>;
  settings!: Table<SystemSettings, string>;
  maintenance!: Table<MaintenanceItem, string>;
  tasks!: Table<Task, string>;

  constructor() {
    super('SmartRealEstateDB');
    this.version(1).stores({
      properties: '++id, name, type, status, price, city',
      customers: '++id, fullName, nationalId, phone, email',
      contracts: '++id, propertyId, customerId, contractType, status, startDate, endDate',
      payments: '++id, contractId, invoiceId, paymentDate, status',
      invoices: '++id, contractId, customerId, propertyId, invoiceNumber, dueDate, status',
      documents: '++id, relatedType, relatedId, uploadedAt',
      notifications: '++id, type, isRead, triggerDate',
      activityLogs: '++id, module, timestamp',
      settings: 'id',
      maintenance: '++id, propertyId, status, priority, scheduledDate',
      tasks: '++id, status, priority, dueDate',
    });
  }
}

export const db = new SmartRealEstateDB();

export async function ensureDefaults(): Promise<SystemSettings> {
  const existing = await db.settings.get('singleton');
  if (existing) {
    const normalized: SystemSettings = {
      ...existing,
      countryCode: existing.countryCode || '966',
      currency: existing.currency?.trim() || 'SAR',
    };
    if (normalized.countryCode !== existing.countryCode || normalized.currency !== existing.currency) {
      await db.settings.put(normalized);
    }
    if (typeof localStorage !== 'undefined') localStorage.setItem('sre_currency', normalized.currency);
    return normalized;
  }
  const defaults: SystemSettings = {
    id: 'singleton',
    ownerName: '',
    companyName: 'المتخصص الذكي للعقارات',
    countryCode: '966',
    phone: '966',
    email: '',
    taxNumber: '',
    currency: 'SAR',
    theme: (localStorage.getItem('sre_theme') as 'light' | 'dark') || 'light',
    enableLocalNotifications: true,
    logoBase64: undefined,
  };
  await db.settings.put(defaults);
  if (typeof localStorage !== 'undefined') localStorage.setItem('sre_currency', defaults.currency);
  return defaults;
}
