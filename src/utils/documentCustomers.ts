import type {
  Contract,
  Customer,
  DocumentFile,
  Invoice,
  Payment,
} from '../models/types';

interface DocumentCustomerSources {
  customers: Customer[];
  contracts: Contract[];
  invoices: Invoice[];
  payments: Payment[];
}

export function getDocumentCustomerNames(
  document: DocumentFile,
  sources: DocumentCustomerSources,
): string[] {
  const { customers, contracts, invoices, payments } = sources;
  const customerIds = new Set<string>();

  if (document.relatedType === 'customer') {
    customerIds.add(document.relatedId);
  } else if (document.relatedType === 'contract') {
    const contract = contracts.find((item) => item.id === document.relatedId);
    if (contract) customerIds.add(contract.customerId);
  } else if (document.relatedType === 'payment') {
    const payment = payments.find((item) => item.id === document.relatedId);
    const invoice = invoices.find((item) => item.id === payment?.invoiceId);
    const contract = contracts.find((item) => item.id === payment?.contractId);
    if (invoice) customerIds.add(invoice.customerId);
    else if (contract) customerIds.add(contract.customerId);
  } else if (document.relatedType === 'property') {
    contracts
      .filter((item) => item.propertyId === document.relatedId)
      .forEach((item) => customerIds.add(item.customerId));
  }

  return [...customerIds]
    .map((id) => customers.find((item) => item.id === id)?.fullName)
    .filter((name): name is string => Boolean(name))
    .sort((a, b) => a.localeCompare(b, 'ar'));
}

export function documentMatchesCustomerName(
  document: DocumentFile,
  search: string,
  sources: DocumentCustomerSources,
): boolean {
  const term = search.trim().toLocaleLowerCase('ar');
  if (!term) return true;
  return getDocumentCustomerNames(document, sources)
    .some((name) => name.toLocaleLowerCase('ar').includes(term));
}
