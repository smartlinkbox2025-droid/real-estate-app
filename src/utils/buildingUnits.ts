import type { BuildingUnit, Property, PropertyStatus } from '../models/types';

export interface OccupancyStats {
  total: number;
  vacant: number;
  rented: number;
  sold: number;
  archived: number;
  occupied: number;
  occupancy: number;
}

function wholeNumber(value: number): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export function createBuildingUnits(
  apartmentCount: number,
  annexCount: number,
  apartmentsPerFloor: number,
  existing: BuildingUnit[] = [],
): BuildingUnit[] {
  const units: BuildingUnit[] = [];
  const perFloor = Math.max(1, wholeNumber(apartmentsPerFloor));
  const previous = new Map(existing.map((unit) => [unit.id, unit]));

  for (let index = 1; index <= wholeNumber(apartmentCount); index += 1) {
    const id = `apartment-${index}`;
    units.push(previous.get(id) || {
      id,
      number: String(index),
      kind: 'apartment',
      floor: Math.ceil(index / perFloor),
      status: 'vacant',
      annualPrice: 0,
      notes: '',
    });
  }

  for (let index = 1; index <= wholeNumber(annexCount); index += 1) {
    const id = `annex-${index}`;
    units.push(previous.get(id) || {
      id,
      number: `ملحق ${index}`,
      kind: 'annex',
      status: 'vacant',
      annualPrice: 0,
      notes: '',
    });
  }

  return units;
}

export function hasManagedUnits(property: Property | undefined): boolean {
  return property?.type === 'building' && !!property.buildingDetails?.units?.length;
}

export function vacantBuildingUnits(property: Property | undefined): BuildingUnit[] {
  return property?.buildingDetails?.units?.filter((unit) => unit.status === 'vacant') || [];
}

export function propertyHasVacancy(property: Property): boolean {
  return hasManagedUnits(property) ? vacantBuildingUnits(property).length > 0 : property.status === 'vacant';
}

export function getUnit(property: Property | undefined, unitId?: string): BuildingUnit | undefined {
  if (!unitId) return undefined;
  return property?.buildingDetails?.units?.find((unit) => unit.id === unitId);
}

export function propertyContractLabel(property: Property | undefined, unitId?: string): string {
  if (!property) return '—';
  const unit = getUnit(property, unitId);
  return unit ? `${property.name} — ${unit.kind === 'annex' ? unit.number : `شقة ${unit.number}`}` : property.name;
}

export function aggregateBuildingStatus(units: BuildingUnit[]): PropertyStatus {
  if (units.some((unit) => unit.status === 'vacant')) return 'vacant';
  if (units.some((unit) => unit.status === 'rented')) return 'rented';
  if (units.some((unit) => unit.status === 'sold')) return 'sold';
  return 'archived';
}

export function setBuildingUnitStatus(property: Property, unitId: string, status: PropertyStatus): Property {
  const details = property.buildingDetails;
  if (!details) throw new Error('بيانات وحدات العمارة غير موجودة.');
  const found = details.units.some((unit) => unit.id === unitId);
  if (!found) throw new Error('الوحدة المختارة غير موجودة.');
  const units = details.units.map((unit) => unit.id === unitId ? { ...unit, status } : unit);
  return {
    ...property,
    status: aggregateBuildingStatus(units),
    buildingDetails: { ...details, units },
    updatedAt: new Date(),
  };
}

export function calculateOccupancyStats(properties: Property[]): OccupancyStats {
  const counts: Record<PropertyStatus, number> = {
    vacant: 0,
    rented: 0,
    sold: 0,
    archived: 0,
  };

  for (const property of properties) {
    const statuses = hasManagedUnits(property)
      ? property.buildingDetails!.units.map((unit) => unit.status)
      : [property.status];
    for (const status of statuses) counts[status] += 1;
  }

  const total = counts.vacant + counts.rented + counts.sold + counts.archived;
  const occupied = counts.rented + counts.sold;
  return {
    total,
    vacant: counts.vacant,
    rented: counts.rented,
    sold: counts.sold,
    archived: counts.archived,
    occupied,
    occupancy: total ? Math.round((occupied / total) * 100) : 0,
  };
}
