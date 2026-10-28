import { PROFESSIONAL_AREAS } from '../types/profile';
import type { ContractType, OpportunityFilters, OpportunitySearchQuery, OpportunitySort, SavedOpportunitySearch, WorkMode } from '../types/opportunity';
import { createEmptyFilters } from './opportunity-search';

export const FAVORITES_STORAGE_KEY = 'myjobs:demo:v1:opportunity-favorites:v1';
export const SAVED_SEARCHES_STORAGE_KEY = 'myjobs:demo:v1:saved-searches:v1';

export interface OpportunityKeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface OpportunityStore {
  loadFavoriteIds(): string[];
  toggleFavorite(id: string): string[];
  removeFavorite(id: string): string[];
  loadSavedSearches(): SavedOpportunitySearch[];
  saveSearch(name: string, query: OpportunitySearchQuery): SavedOpportunitySearch;
  renameSearch(id: string, name: string): SavedOpportunitySearch[];
  deleteSearch(id: string): SavedOpportunitySearch[];
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
const enumOf = <T extends string>(value: unknown, allowed: readonly T[]): T | '' =>
  typeof value === 'string' && allowed.includes(value as T) ? (value as T) : '';
const modes: readonly WorkMode[] = ['remote', 'hybrid', 'onsite'];
const contracts: readonly ContractType[] = ['full-time', 'part-time', 'permanent', 'fixed-term', 'contract', 'freelance', 'internship', 'temporary'];
const levels = ['entry', 'junior', 'mid', 'senior', 'lead', 'any'] as const;
const sorts: readonly OpportunitySort[] = ['relevance', 'date', 'salary'];

export function normalizeFilters(value: unknown): OpportunityFilters {
  const raw = asRecord(value);
  const salaryMinimum = asString(raw.salaryMinimum);
  const salaryMaximum = asString(raw.salaryMaximum);
  return {
    area: enumOf(raw.area, PROFESSIONAL_AREAS),
    location: asString(raw.location),
    country: asString(raw.country),
    workMode: enumOf(raw.workMode, modes),
    contractType: enumOf(raw.contractType, contracts),
    experienceLevel: enumOf(raw.experienceLevel, levels),
    salaryMinimum: /^\d+(\.\d+)?$/.test(salaryMinimum) ? salaryMinimum : '',
    salaryMaximum: /^\d+(\.\d+)?$/.test(salaryMaximum) ? salaryMaximum : '',
    publishedWithinDays: ['1', '7', '14', '30'].includes(asString(raw.publishedWithinDays))
      ? asString(raw.publishedWithinDays)
      : createEmptyFilters().publishedWithinDays,
  };
}

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `search-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createOpportunityStore(storage: OpportunityKeyValueStorage): OpportunityStore {
  const loadFavoriteIds = (): string[] => {
    try {
      const raw = storage.getItem(FAVORITES_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? [...new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0))]
        : [];
    } catch {
      return [];
    }
  };

  const loadSavedSearches = (): SavedOpportunitySearch[] => {
    try {
      const raw = storage.getItem(SAVED_SEARCHES_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((value) => {
        const item = asRecord(value);
        if (typeof item.id !== 'string' || typeof item.name !== 'string' || !item.name.trim()) return [];
        return [{
          id: item.id,
          name: item.name.trim(),
          text: asString(item.text),
          filters: normalizeFilters(item.filters),
          sort: enumOf(item.sort, sorts) || 'relevance',
          updatedAt: asString(item.updatedAt),
        }];
      });
    } catch {
      return [];
    }
  };

  const writeSearches = (searches: SavedOpportunitySearch[]) =>
    storage.setItem(SAVED_SEARCHES_STORAGE_KEY, JSON.stringify(searches));

  return {
    loadFavoriteIds,
    toggleFavorite(id) {
      if (!id) return loadFavoriteIds();
      const current = loadFavoriteIds();
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      return next;
    },
    removeFavorite(id) {
      const next = loadFavoriteIds().filter((item) => item !== id);
      storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      return next;
    },
    loadSavedSearches,
    saveSearch(name, query) {
      if (!name.trim()) throw new Error('A saved search needs a name.');
      const search: SavedOpportunitySearch = {
        id: makeId(),
        name: name.trim(),
        text: query.text,
        filters: normalizeFilters(query.filters),
        sort: enumOf(query.sort, sorts) || 'relevance',
        updatedAt: new Date().toISOString(),
      };
      writeSearches([search, ...loadSavedSearches()]);
      return search;
    },
    renameSearch(id, name) {
      if (!name.trim()) throw new Error('A saved search needs a name.');
      const searches = loadSavedSearches().map((item) =>
        item.id === id ? { ...item, name: name.trim(), updatedAt: new Date().toISOString() } : item,
      );
      writeSearches(searches);
      return searches;
    },
    deleteSearch(id) {
      const searches = loadSavedSearches().filter((item) => item.id !== id);
      writeSearches(searches);
      return searches;
    },
  };
}
