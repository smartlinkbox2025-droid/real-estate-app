import { AR } from '../constants/arabicTerms';
import type { Contract, Customer, Property } from '../models/types';
import type { Section } from './pdfGenerator';
import { fmtDate, fmtMoney, getAppCurrency } from './dateHelpers';
import { getUnit, hasManagedUnits } from './buildingUnits';
import { getContractDisplayNumber } from './contractNumbers';

function customerName(customers: Customer[], customerId: string): string {
  return customers.find((customer) => customer.id === customerId)?.fullName || '—';
}

function unitName(property: Property, unitId?: string): string {
  const unit = getUnit(property, unitId);
  if (!unit) return '—';
  return unit.kind === 'annex' ? unit.number : `شقة ${unit.number}`;
}

export function buildPropertyPdfSections(
  property: Property,
  contracts: Contract[],
  customers: Customer[],
): Section[] {
  const relatedContracts = contracts
    .filter((contract) => contract.propertyId === property.id)
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  const sections: Section[] = [
    {
      heading: 'البيانات الأساسية',
      table: {
        headers: ['البيان', 'القيمة'],
        rows: [
          ['اسم العقار', property.name],
          ['نوع العقار', AR.property.types[property.type]],
          ['الحالة', AR.property.statuses[property.status]],
          ['اسم المالك', property.ownerName || '—'],
          ['المدينة', property.city],
          ['العنوان', property.address],
          ['السعر / الإيجار السنوي', fmtMoney(property.price)],
          ['العملة', getAppCurrency()],
          ['ملاحظات', property.notes || '—'],
          ['تاريخ الإضافة', fmtDate(property.createdAt)],
          ['آخر تحديث', fmtDate(property.updatedAt)],
        ],
      },
    },
  ];

  if (hasManagedUnits(property)) {
    const details = property.buildingDetails!;
    sections.push(
      {
        heading: 'بيانات العمارة',
        table: {
          headers: ['البيان', 'القيمة'],
          rows: [
            ['عدد الشقق', details.apartmentCount],
            ['عدد الطوابق', details.floorCount],
            ['عدد الملحقات', details.annexCount],
            ['عدد الشقق في كل طابق', details.apartmentsPerFloor],
            ['إجمالي الوحدات', details.units.length],
          ],
        },
      },
      {
        heading: 'تفاصيل الوحدات',
        table: {
          headers: ['رقم الوحدة', 'النوع', 'الطابق', 'الحالة', 'السعر / الإيجار السنوي', 'ملاحظات'],
          rows: details.units.map((unit) => [
            unit.kind === 'annex' ? unit.number : `شقة ${unit.number}`,
            unit.kind === 'annex' ? 'ملحق' : 'شقة',
            unit.floor || '—',
            AR.property.statuses[unit.status],
            fmtMoney(unit.annualPrice),
            unit.notes || '—',
          ]),
        },
      },
    );
  }

  sections.push({
    heading: 'العقود المرتبطة',
    table: {
      headers: ['رقم العقد', 'العميل', 'الوحدة', 'نوع العقد', 'تاريخ البداية', 'تاريخ النهاية', 'القيمة', 'الحالة'],
      rows: relatedContracts.map((contract) => [
        getContractDisplayNumber(contract, contracts),
        customerName(customers, contract.customerId),
        hasManagedUnits(property) ? unitName(property, contract.unitId) : property.name,
        AR.contract.types[contract.contractType],
        fmtDate(contract.startDate),
        fmtDate(contract.endDate),
        fmtMoney(contract.totalAmount),
        AR.contract.statuses[contract.status],
      ]),
    },
  });

  return sections;
}
