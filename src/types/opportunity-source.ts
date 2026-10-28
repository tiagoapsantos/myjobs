import type { JobOpportunity } from './opportunity';

/** Common, provider-neutral contract for read-only opportunity sources. */
export interface OpportunitySource {
  readonly id: string;
  readonly displayName: string;
  search(request: OpportunitySourceSearchRequest): Promise<OpportunitySourcePage>;
}

export interface OpportunitySourceSearchRequest {
  query: string;
  page?: number;
  limit?: number;
  signal?: AbortSignal;
}

export interface OpportunitySourcePage {
  sourceId: string;
  opportunities: JobOpportunity[];
  page: number;
  limit: number;
  total: number;
}

/** Duplicate candidates are reported for review; records are never discarded. */
export interface OpportunityDuplicateCandidate {
  firstId: string;
  secondId: string;
}
