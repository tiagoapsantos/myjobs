import type { OpportunitySourcePage, OpportunitySourceSearchRequest } from '../../../types/opportunity-source';
import { mapITJobsResults, type ITJobsJob, type ITJobsSearchResponse } from './itjobs-mapper';

const ENDPOINT = 'https://api.itjobs.pt/job/search.json';

export type ITJobsTransport = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: URLSearchParams; signal: AbortSignal }) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

export type ITJobsErrorKind = 'configuration' | 'timeout' | 'http' | 'invalid-response' | 'network';

/** Deliberately contains no request URL, response body, transport message, or API key. */
export class ITJobsClientError extends Error {
  readonly name = 'ITJobsClientError';
  constructor(readonly kind: ITJobsErrorKind, message: string) { super(message); }
}

export interface ITJobsClientOptions {
  apiKey: string;
  transport: ITJobsTransport;
  timeoutMs?: number;
  now?: () => string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateSearchResponse(value: unknown): ITJobsSearchResponse {
  if (!isRecord(value) || !Array.isArray(value.results)) throw new ITJobsClientError('invalid-response', 'ITJobs returned an invalid response.');
  const total = value.total;
  const page = value.page;
  const limit = value.limit;
  if (![total, page, limit].every((item) => typeof item === 'number' && Number.isInteger(item) && item >= 0)
    || (page as number) < 1 || (limit as number) < 1
    || !value.results.every((item) => isRecord(item))) {
    throw new ITJobsClientError('invalid-response', 'ITJobs returned an invalid response.');
  }
  return value as unknown as ITJobsSearchResponse;
}

/** Isolated client. A transport must be explicitly injected; no global fetch is used. */
export class ITJobsClient {
  private readonly timeoutMs: number;
  private readonly now: () => string;

  constructor(private readonly options: ITJobsClientOptions) {
    if (!options.apiKey?.trim()) throw new ITJobsClientError('configuration', 'ITJobs integration is not configured.');
    if (typeof options.transport !== 'function') throw new ITJobsClientError('configuration', 'ITJobs integration is not configured.');
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async search(request: OpportunitySourceSearchRequest): Promise<OpportunitySourcePage> {
    const query = request.query.trim();
    const page = request.page ?? 1;
    const limit = request.limit ?? 20;
    if (!query || !Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1) {
      throw new ITJobsClientError('configuration', 'A search term, positive page, and positive result limit are required.');
    }
    const body = new URLSearchParams({ api_key: this.options.apiKey, q: query, page: String(page), limit: String(limit) });
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener('abort', onAbort, { once: true });
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutFailure = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new ITJobsClientError('timeout', 'ITJobs request timed out.'));
      }, this.timeoutMs);
    });

    try {
      const response = await Promise.race([this.options.transport(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', accept: 'application/json' },
        body,
        signal: controller.signal,
      }), timeoutFailure]);
      if (!response.ok) throw new ITJobsClientError('http', `ITJobs request failed (HTTP ${response.status}).`);
      let raw: unknown;
      try { raw = await response.json(); }
      catch { throw new ITJobsClientError('invalid-response', 'ITJobs returned invalid JSON.'); }
      const parsed = validateSearchResponse(raw);
      return {
        sourceId: 'itjobs',
        page: parsed.page,
        limit: parsed.limit,
        total: parsed.total,
        opportunities: mapITJobsResults(parsed.results as ITJobsJob[], this.now()),
      };
    } catch (error) {
      if (error instanceof ITJobsClientError) throw error;
      if (timedOut || controller.signal.aborted && !request.signal?.aborted) throw new ITJobsClientError('timeout', 'ITJobs request timed out.');
      if (request.signal?.aborted) throw new ITJobsClientError('network', 'ITJobs request was cancelled.');
      throw new ITJobsClientError('network', 'ITJobs could not be reached.');
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      request.signal?.removeEventListener('abort', onAbort);
    }
  }
}
