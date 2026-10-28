import { findDuplicateOpportunities } from './opportunity-search';
import type { JobOpportunity } from '../types/opportunity';
import type { OpportunityDuplicateCandidate, OpportunitySource } from '../types/opportunity-source';

/** Explicit opt-in utility; the current UI does not call it or activate external sources. */
export async function searchOpportunitySources(
  sources: readonly OpportunitySource[],
  request: { query: string; page?: number; limit?: number; signal?: AbortSignal },
): Promise<{ opportunities: JobOpportunity[]; duplicateCandidates: OpportunityDuplicateCandidate[] }> {
  const pages = await Promise.all(sources.map((source) => source.search(request)));
  const opportunities = pages.flatMap((page) => page.opportunities);
  return {
    opportunities,
    duplicateCandidates: findDuplicateOpportunities(opportunities).map(([firstId, secondId]) => ({ firstId, secondId })),
  };
}
