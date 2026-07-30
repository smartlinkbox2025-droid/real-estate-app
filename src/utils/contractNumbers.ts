import type { Contract } from '../models/types';

const CONTRACT_PREFIX = 'CNT';

function contractYear(value: Date | string | undefined): number {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isFinite(date.getTime()) ? date.getFullYear() : new Date().getFullYear();
}

export function formatContractNumber(year: number, sequence: number): string {
  return `${CONTRACT_PREFIX}-${year}-${String(sequence).padStart(4, '0')}`;
}

export function parseContractNumber(value: string | undefined): { year: number; sequence: number } | null {
  const match = value?.match(/^CNT-(\d{4})-(\d{4,})$/);
  if (!match) return null;
  return { year: Number(match[1]), sequence: Number(match[2]) };
}

export function nextContractNumber(contracts: Contract[], createdAt = new Date()): string {
  const year = contractYear(createdAt);
  const sequences = contracts
    .map((contract) => parseContractNumber(contract.contractNumber))
    .filter((item): item is { year: number; sequence: number } => Boolean(item && item.year === year))
    .map((item) => item.sequence);
  return formatContractNumber(year, sequences.length ? Math.max(...sequences) + 1 : 1);
}

export function planMissingContractNumbers(
  contracts: Contract[],
): Array<{ id: string; contractNumber: string }> {
  const counters = new Map<number, number>();
  contracts.forEach((contract) => {
    const parsed = parseContractNumber(contract.contractNumber);
    if (parsed) counters.set(parsed.year, Math.max(counters.get(parsed.year) || 0, parsed.sequence));
  });

  return [...contracts]
    .filter((contract) => contract.id && !parseContractNumber(contract.contractNumber))
    .sort((a, b) => {
      const dateDelta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return dateDelta || String(a.id).localeCompare(String(b.id));
    })
    .map((contract) => {
      const year = contractYear(contract.createdAt);
      const sequence = (counters.get(year) || 0) + 1;
      counters.set(year, sequence);
      return { id: contract.id!, contractNumber: formatContractNumber(year, sequence) };
    });
}

export function getContractDisplayNumber(contract: Contract, contracts: Contract[]): string {
  return contract.contractNumber
    || planMissingContractNumbers(contracts).find((item) => item.id === contract.id)?.contractNumber
    || formatContractNumber(contractYear(contract.createdAt), 1);
}
