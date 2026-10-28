import type { OpportunitySource, OpportunitySourceSearchRequest, OpportunitySourcePage } from '../../../types/opportunity-source';
import { ITJobsClient } from './itjobs-client';

/** No default instance is exported, so importing this adapter cannot activate network traffic. */
export class ITJobsOpportunitySource implements OpportunitySource {
  readonly id = 'itjobs';
  readonly displayName = 'ITJobs';

  constructor(private readonly client: ITJobsClient) {}

  search(request: OpportunitySourceSearchRequest): Promise<OpportunitySourcePage> {
    return this.client.search(request);
  }
}
