import { PROFESSIONAL_AREAS } from '../types/profile';
import type { ProfessionalAreaName } from '../types/profile';
import type {
  ContractType,
  ExperienceLevel,
  JobOpportunity,
  OpportunityFilters,
  OpportunitySearchQuery,
  OpportunitySort,
  SalaryRange,
  WorkMode,
} from '../types/opportunity';

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const string = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : [];
const enumValue = <T extends string>(value: unknown, allowed: readonly T[]): T | null =>
  typeof value === 'string' && allowed.includes(value as T) ? (value as T) : null;
const modes: readonly WorkMode[] = ['remote', 'hybrid', 'onsite'];
const contracts: readonly ContractType[] = ['full-time', 'part-time', 'permanent', 'fixed-term', 'contract', 'freelance', 'internship', 'temporary'];
const levels: readonly ExperienceLevel[] = ['entry', 'junior', 'mid', 'senior', 'lead', 'any'];
const statuses = ['active', 'closed', 'expired', 'unknown'] as const;

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim()
    .replace(/\bremoto\b/g, 'remote')
    .replace(/\bhibrido\b/g, 'hybrid')
    .replace(/\bpresencial\b/g, 'onsite');
}

export function normalizeOpportunity(value: unknown): JobOpportunity {
  const raw = record(value);
  const salaryRaw = record(raw.salary);
  let salary: SalaryRange | null = null;

  if (raw.salary && typeof raw.salary === 'object' && !Array.isArray(raw.salary)) {
    const minimum = typeof salaryRaw.minimum === 'number' && Number.isFinite(salaryRaw.minimum) && salaryRaw.minimum >= 0
      ? salaryRaw.minimum
      : null;
    const maximum = typeof salaryRaw.maximum === 'number' && Number.isFinite(salaryRaw.maximum) && salaryRaw.maximum >= 0
      ? salaryRaw.maximum
      : null;
    salary = { minimum, maximum, currency: string(salaryRaw.currency) || null };
    if (minimum === null && maximum === null) salary = null;
  }

  const professionalAreas = Array.isArray(raw.professionalAreas)
    ? raw.professionalAreas.filter(
        (area): area is ProfessionalAreaName =>
          typeof area === 'string' && PROFESSIONAL_AREAS.includes(area as ProfessionalAreaName),
      )
    : [];
  const id = string(raw.id) || `unidentified-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

  return {
    id,
    title: string(raw.title),
    company: string(raw.company),
    location: string(raw.location) || null,
    country: string(raw.country) || null,
    workMode: enumValue(raw.workMode, modes),
    contractType: enumValue(raw.contractType, contracts),
    salary,
    description: string(raw.description),
    requirements: strings(raw.requirements),
    skills: strings(raw.skills),
    professionalAreas,
    experienceLevel: enumValue(raw.experienceLevel, levels),
    publishedAt: string(raw.publishedAt) || null,
    collectedAt: string(raw.collectedAt) || null,
    source: string(raw.source) || 'Unknown source',
    originalUrl: string(raw.originalUrl) || null,
    status: enumValue(raw.status, statuses) ?? 'unknown',
    externalId: string(raw.externalId) || null,
    isDemo: raw.isDemo === true,
  };
}

export function createEmptyFilters(): OpportunityFilters {
  return {
    area: '', location: '', country: '', workMode: '', contractType: '', experienceLevel: '',
    salaryMinimum: '', salaryMaximum: '', publishedWithinDays: '',
  };
}

export function createEmptyQuery(): OpportunitySearchQuery {
  return { text: '', filters: createEmptyFilters(), sort: 'relevance' };
}

function validNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function salaryMatches(job: JobOpportunity, filters: OpportunityFilters): boolean {
  const minimum = validNumber(filters.salaryMinimum);
  const maximum = validNumber(filters.salaryMaximum);
  if (minimum === null && maximum === null) return true;
  if (!job.salary) return false;

  const lower = job.salary.minimum;
  const upper = job.salary.maximum;
  if (minimum !== null && (upper ?? lower) !== null && (upper ?? lower)! < minimum) return false;
  if (maximum !== null && (lower ?? upper) !== null && (lower ?? upper)! > maximum) return false;
  return true;
}

function dateMatches(job: JobOpportunity, days: string, now: number): boolean {
  if (!days) return true;
  const published = job.publishedAt ? Date.parse(job.publishedAt) : NaN;
  const duration = Number(days);
  if (!Number.isFinite(published) || !Number.isFinite(duration) || duration < 0) return false;
  return now - published <= duration * 86_400_000 && published <= now;
}

function jobText(job: JobOpportunity): string[] {
  return [
    job.title,
    job.company,
    job.location ?? '',
    job.country ?? '',
    job.description,
    ...job.requirements,
    ...job.skills,
  ].map(normalizeSearchText);
}

function relevanceScore(job: JobOpportunity, terms: string[]): number {
  const weightedFields: Array<[string[], number]> = [
    [[normalizeSearchText(job.title)], 8],
    [job.skills.map(normalizeSearchText), 6],
    [[normalizeSearchText(job.company)], 5],
    [job.professionalAreas.map(normalizeSearchText), 4],
    [[normalizeSearchText(job.location ?? ''), normalizeSearchText(job.country ?? '')], 3],
    [job.requirements.map(normalizeSearchText), 2],
    [[normalizeSearchText(job.description)], 1],
  ];
  let score = 0;
  for (const term of terms) {
    for (const [values, weight] of weightedFields) {
      if (values.some((value) => value.includes(term))) {
        score += weight;
        break;
      }
    }
  }
  return score;
}

export interface SearchedOpportunity {
  job: JobOpportunity;
  relevance: number;
}

export function searchOpportunities(
  jobs: readonly JobOpportunity[],
  query: OpportunitySearchQuery,
  now = Date.now(),
  includeInactive = false,
): SearchedOpportunity[] {
  const terms = normalizeSearchText(query.text).split(/\s+/).filter(Boolean);
  const filters = query.filters;
  const results: SearchedOpportunity[] = [];

  for (const raw of jobs) {
    const job = normalizeOpportunity(raw);
    if (!includeInactive && (job.status === 'closed' || job.status === 'expired')) continue;
    const fields = jobText(job);
    if (terms.some((term) => !fields.some((field) => field.includes(term)))) continue;
    if (filters.area && !job.professionalAreas.includes(filters.area)) continue;
    if (filters.location && !normalizeSearchText(`${job.location ?? ''} ${job.country ?? ''}`).includes(normalizeSearchText(filters.location))) continue;
    if (filters.country && normalizeSearchText(job.country ?? '') !== normalizeSearchText(filters.country)) continue;
    if (filters.workMode && job.workMode !== filters.workMode) continue;
    if (filters.contractType && job.contractType !== filters.contractType) continue;
    if (filters.experienceLevel && job.experienceLevel !== filters.experienceLevel) continue;
    if (!salaryMatches(job, filters)) continue;
    if (!dateMatches(job, filters.publishedWithinDays, now)) continue;
    results.push({ job, relevance: terms.length ? relevanceScore(job, terms) : 0 });
  }

  const sort = query.sort as OpportunitySort;
  if (sort === 'date') {
    results.sort((a, b) => (Date.parse(b.job.publishedAt ?? '') || 0) - (Date.parse(a.job.publishedAt ?? '') || 0));
  } else if (sort === 'salary') {
    results.sort((a, b) => (b.job.salary?.maximum ?? b.job.salary?.minimum ?? -1) - (a.job.salary?.maximum ?? a.job.salary?.minimum ?? -1));
  } else {
    results.sort((a, b) => b.relevance - a.relevance || (Date.parse(b.job.publishedAt ?? '') || 0) - (Date.parse(a.job.publishedAt ?? '') || 0));
  }
  return results;
}

function normalizedUrl(value: string | null): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || ['ref', 'source', 'trackingid'].includes(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${url.pathname}${url.search}`;
  } catch {
    return value.trim().replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  }
}

export function areDuplicateOpportunities(first: JobOpportunity, second: JobOpportunity): boolean {
  if (first.id === second.id) return true;
  if (first.externalId && second.externalId && first.externalId === second.externalId && normalizeSearchText(first.source) === normalizeSearchText(second.source)) return true;
  const urlA = normalizedUrl(first.originalUrl);
  const urlB = normalizedUrl(second.originalUrl);
  if (urlA && urlB && urlA === urlB) return true;
  const titleA = normalizeSearchText(first.title);
  const titleB = normalizeSearchText(second.title);
  const companyA = normalizeSearchText(first.company);
  const companyB = normalizeSearchText(second.company);
  const locationA = normalizeSearchText(first.location ?? '');
  const locationB = normalizeSearchText(second.location ?? '');
  return Boolean(titleA && companyA && locationA && titleA === titleB && companyA === companyB && locationA === locationB);
}

export function findDuplicateOpportunities(jobs: readonly JobOpportunity[]): Array<[string, string]> {
  const duplicates: Array<[string, string]> = [];
  for (let i = 0; i < jobs.length; i++) {
    for (let j = i + 1; j < jobs.length; j++) {
      if (areDuplicateOpportunities(jobs[i], jobs[j])) duplicates.push([jobs[i].id, jobs[j].id]);
    }
  }
  return duplicates;
}
