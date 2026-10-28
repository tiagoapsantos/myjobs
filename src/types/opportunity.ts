import type { ProfessionalAreaName } from './profile';
export type WorkMode = 'remote'|'hybrid'|'onsite';
export type ContractType = 'full-time'|'part-time'|'permanent'|'fixed-term'|'contract'|'freelance'|'internship'|'temporary';
export type ExperienceLevel = 'entry'|'junior'|'mid'|'senior'|'lead'|'any';
export type OpportunityStatus = 'active'|'closed'|'expired'|'unknown';
export type OpportunitySort = 'relevance'|'date'|'salary';
export interface SalaryRange { minimum: number|null; maximum: number|null; currency: string|null; }
export interface JobOpportunity {
  id: string; title: string; company: string; location: string|null; country: string|null;
  workMode: WorkMode|null; contractType: ContractType|null; salary: SalaryRange|null;
  description: string; requirements: string[]; skills: string[];
  professionalAreas: ProfessionalAreaName[]; experienceLevel: ExperienceLevel|null;
  publishedAt: string|null; collectedAt: string|null; source: string;
  originalUrl: string|null; status: OpportunityStatus; externalId: string|null; isDemo: boolean;
}
export interface OpportunityFilters {
  area: ProfessionalAreaName|''; location: string; country: string; workMode: WorkMode|'';
  contractType: ContractType|''; experienceLevel: ExperienceLevel|'';
  salaryMinimum: string; salaryMaximum: string; publishedWithinDays: string;
}
export interface OpportunitySearchQuery { text: string; filters: OpportunityFilters; sort: OpportunitySort; }
export interface SavedOpportunitySearch extends OpportunitySearchQuery { id: string; name: string; updatedAt: string; }
