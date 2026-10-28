import type { ContractType, JobOpportunity, WorkMode } from '../../../types/opportunity';

export interface ITJobsJob {
  id?: number | string;
  title?: string;
  body?: string;
  company?: { name?: string } | null;
  locations?: Array<{ name?: string }> | null;
  country?: string;
  workModel?: number;
  salaryMin?: number;
  salaryMax?: number;
  types?: Array<{ id?: string | number; name?: string }> | null;
  contracts?: Array<{ id?: string | number; name?: string }> | null;
  publishedAt?: string;
  originalUrl?: string;
  url?: string;
}

export interface ITJobsSearchResponse {
  total: number;
  page: number;
  limit: number;
  query?: string;
  results: unknown[];
}

const stringValue = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const numberValue = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

function mapWorkMode(value: unknown): WorkMode | null {
  if (value === 0) return 'onsite';
  if (value === 1) return 'remote';
  if (value === 2) return 'hybrid';
  return null;
}

function mapContract(job: ITJobsJob): ContractType | null {
  const ids = (job.contracts ?? []).map((item) => String(item.id ?? ''));
  if (ids.includes('1')) return 'fixed-term';
  if (ids.includes('2')) return 'permanent';
  if (ids.includes('3') || ids.includes('5')) return 'internship';
  if (ids.includes('4')) return 'contract';
  const typeIds = (job.types ?? []).map((item) => String(item.id ?? ''));
  if (typeIds.includes('1')) return 'full-time';
  if (typeIds.includes('2')) return 'part-time';
  return null;
}

export function mapITJobsOpportunity(job: ITJobsJob, collectedAt: string): JobOpportunity | null {
  const externalId = job.id === undefined || job.id === null || String(job.id).trim() === '' ? null : String(job.id);
  const title = stringValue(job.title);
  if (!externalId || !title) return null;

  const minimum = numberValue(job.salaryMin);
  const maximum = numberValue(job.salaryMax);
  const salary = minimum !== null || maximum !== null ? { minimum, maximum, currency: 'EUR' } : null;
  const rawUrl = stringValue(job.originalUrl) ?? stringValue(job.url);
  let originalUrl: string | null = null;
  if (rawUrl) {
    try { const parsed = new URL(rawUrl); if (parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 'www.itjobs.pt') originalUrl = parsed.toString(); }
    catch { /* Keep unavailable or malformed listing links empty. */ }
  }

  return {
    id: `itjobs:${externalId}`,
    title,
    company: stringValue(job.company?.name) ?? 'Empresa não indicada',
    location: Array.isArray(job.locations) ? job.locations.map((entry) => stringValue(entry?.name)).filter((entry): entry is string => Boolean(entry)).join(', ') || null : null,
    country: stringValue(job.country),
    workMode: mapWorkMode(job.workModel),
    contractType: mapContract(job),
    salary,
    description: stringValue(job.body) ?? '',
    requirements: [],
    skills: [],
    professionalAreas: [],
    experienceLevel: null,
    publishedAt: stringValue(job.publishedAt),
    collectedAt,
    source: 'ITJobs',
    originalUrl,
    status: 'unknown',
    externalId,
    isDemo: false,
  };
}

export function mapITJobsResults(results: readonly ITJobsJob[], collectedAt: string): JobOpportunity[] {
  return results.flatMap((item) => {
    const mapped = mapITJobsOpportunity(item, collectedAt);
    return mapped ? [mapped] : [];
  });
}
