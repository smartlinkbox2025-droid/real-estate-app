import assert from 'node:assert/strict';
import { fmtMoney, normalizeCurrency } from '../src/utils/dateHelpers.ts';
import {
  buildWhatsAppUrl,
  isValidCountryCode,
  isValidInternationalPhone,
  normalizeCountryCode,
  normalizeInternationalPhone,
} from '../src/utils/phoneHelpers.ts';
import {
  documentMatchesCustomerName,
  getDocumentCustomerNames,
} from '../src/utils/documentCustomers.ts';
import {
  nextContractNumber,
  parseContractNumber,
  planMissingContractNumbers,
} from '../src/utils/contractNumbers.ts';

assert.equal(normalizeCountryCode('+962'), '962');
assert.equal(normalizeCountryCode('00971'), '971');
assert.equal(isValidCountryCode('1'), true);
assert.equal(isValidCountryCode('000'), false);
assert.equal(normalizeInternationalPhone('0791234567', '962'), '962791234567');
assert.equal(isValidInternationalPhone('962791234567', '962'), true);
assert.equal(isValidInternationalPhone('96212', '962'), false);
assert.match(buildWhatsAppUrl('0791234567', 'اختبار', '962'), /^https:\/\/wa\.me\/962791234567/);

assert.equal(normalizeCurrency('usd'), 'USD');
assert.equal(fmtMoney(1250.5, 'USD'), '1,250.5 $');
assert.equal(fmtMoney(1250, 'JOD'), '1,250 د.أ');

const sources = {
  customers: [
    { id: 'customer-a', fullName: 'أحمد علي' },
    { id: 'customer-b', fullName: 'سارة محمد' },
  ] as any[],
  contracts: [
    { id: 'contract-a', customerId: 'customer-a', propertyId: 'property-a' },
    { id: 'contract-b', customerId: 'customer-b', propertyId: 'property-a' },
  ] as any[],
  invoices: [{ id: 'invoice-a', customerId: 'customer-a', contractId: 'contract-a' }] as any[],
  payments: [{ id: 'payment-a', invoiceId: 'invoice-a', contractId: 'contract-a' }] as any[],
};
const contractDocument = { relatedType: 'contract', relatedId: 'contract-a' } as any;
const paymentDocument = { relatedType: 'payment', relatedId: 'payment-a' } as any;
const propertyDocument = { relatedType: 'property', relatedId: 'property-a' } as any;

assert.deepEqual(getDocumentCustomerNames(contractDocument, sources), ['أحمد علي']);
assert.deepEqual(getDocumentCustomerNames(paymentDocument, sources), ['أحمد علي']);
assert.deepEqual(getDocumentCustomerNames(propertyDocument, sources), ['أحمد علي', 'سارة محمد']);
assert.equal(documentMatchesCustomerName(paymentDocument, 'أحمد', sources), true);
assert.equal(documentMatchesCustomerName(paymentDocument, 'سارة', sources), false);

const contractNumberFixtures = [
  { id: 'old-2025', createdAt: new Date('2025-02-01T00:00:00Z') },
  { id: 'numbered-2026', contractNumber: 'CNT-2026-0007', createdAt: new Date('2026-01-01T00:00:00Z') },
  { id: 'old-2026', createdAt: new Date('2026-03-01T00:00:00Z') },
] as any[];
assert.deepEqual(parseContractNumber('CNT-2026-0012'), { year: 2026, sequence: 12 });
assert.equal(parseContractNumber('INV-2026-0012'), null);
assert.equal(nextContractNumber(contractNumberFixtures, new Date('2026-07-30T00:00:00Z')), 'CNT-2026-0008');
assert.deepEqual(planMissingContractNumbers(contractNumberFixtures), [
  { id: 'old-2025', contractNumber: 'CNT-2025-0001' },
  { id: 'old-2026', contractNumber: 'CNT-2026-0008' },
]);

console.log('Document, international phone, currency, and contract number acceptance tests passed.');
