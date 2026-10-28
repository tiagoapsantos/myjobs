import assert from 'node:assert/strict';
import test from 'node:test';
import type { ITJobsTransport } from '../src/lib/sources/itjobs/itjobs-client';
import { handleITJobsSearch, type ITJobsWorkerDependencies, type JobFinderWorkerEnv } from '../src/worker/itjobs-search';

const ORIGIN = 'https://jobfinder.example';
const KEY = 'worker-secret-test-key';
const rateLimiter = { limit: async (_options: { key: string }) => ({ success: true }) };
const ENV: JobFinderWorkerEnv = {
  ALLOWED_ORIGIN: ORIGIN,
  ITJOBS_API_KEY: KEY,
  ACCESS_TEAM_DOMAIN: 'jobfinder-team.cloudflareaccess.com',
  ACCESS_AUD: 'fake-access-audience',
  SEARCH_LIMITER: rateLimiter,
};
const authenticated = async () => ({ authenticated: true as const, identity: { subject: 'test-user-subject', email: 'test-user@example.invalid' } });
const withAccess = (overrides: Partial<ITJobsWorkerDependencies> = {}): ITJobsWorkerDependencies => ({ authenticate: authenticated, ...overrides });
const sampleResponse = {
  total: 1,
  page: 1,
  limit: 20,
  query: 'frontend',
  results: [{
    id: 841,
    title: 'Frontend Engineer',
    body: 'Fictional listing body',
    company: { name: 'Example Company' },
    locations: [{ name: 'Porto' }],
    country: 'PT',
    workModel: 1,
    types: [{ id: '1', name: 'Full Time' }],
    contracts: [{ id: '1', name: 'Contrato a termo' }],
    publishedAt: '2026-10-20 10:00:00',
  }],
};

function makeRequest(body: unknown, options: { origin?: string | null; method?: string; contentType?: string } = {}): Request {
  const headers = new Headers();
  if (options.origin !== null) headers.set('origin', options.origin ?? ORIGIN);
  if (body !== undefined) headers.set('content-type', options.contentType ?? 'application/json');
  return new Request('https://worker.example/api/itjobs/search', {
    method: options.method ?? (body === undefined ? 'GET' : 'POST'),
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function upstream(payload: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function serialized(response: Response) { return response.text(); }

test('valid request uses the ITJobs adapter and returns normalized opportunities', async () => {
  let sentUrl = '';
  let sentBody = '';
  const transport: ITJobsTransport = async (url, init) => { sentUrl = url; sentBody = init.body.toString(); return upstream(sampleResponse); };
  const response = await handleITJobsSearch(makeRequest({ query: 'frontend' }), ENV, withAccess({ transport }));
  const payload = await response.json() as { source: string; total: number; opportunities: Array<Record<string, unknown>> };
  assert.equal(response.status, 200);
  assert.equal(sentUrl, 'https://api.itjobs.pt/job/search.json');
  assert.equal(new URLSearchParams(sentBody).get('api_key'), KEY);
  assert.equal(new URLSearchParams(sentBody).get('q'), 'frontend');
  assert.equal(payload.source, 'itjobs');
  assert.equal(payload.total, 1);
  assert.equal(payload.opportunities[0]?.id, 'itjobs:841');
  assert.equal(payload.opportunities[0]?.source, 'ITJobs');
  assert.equal(payload.opportunities[0]?.workMode, 'remote');
  assert.equal(payload.opportunities[0]?.contractType, 'fixed-term');
  assert.equal(payload.opportunities[0]?.isDemo, false);
  assert.equal(JSON.stringify(payload).includes(KEY), false);
});

test('valid empty search returns an empty result list', async () => {
  const response = await handleITJobsSearch(makeRequest({ query: 'no-results', page: 3, limit: 10 }), ENV, withAccess({
    transport: async () => upstream({ total: 0, page: 3, limit: 10, results: [] }),
  }));
  assert.equal(response.status, 200);
  const payload = await response.json() as { total: number; page: number; opportunities: unknown[] };
  assert.equal(payload.total, 0);
  assert.equal(payload.page, 3);
  assert.deepEqual(payload.opportunities, []);
});

test('rejects malformed, oversized, or out-of-range search parameters before upstream access', async () => {
  let calls = 0;
  const transport: ITJobsTransport = async () => { calls += 1; return upstream(sampleResponse); };
  const invalidBodies = [
    {}, { query: '' }, { query: 'x'.repeat(121) }, { query: 'one,,two' },
    { query: 'frontend', page: 0 }, { query: 'frontend', page: 1001 },
    { query: 'frontend', limit: 0 }, { query: 'frontend', limit: 51 },
    { query: 'frontend', unknown: true }, { query: 'frontend\nmalicious' },
  ];
  for (const body of invalidBodies) {
    const response = await handleITJobsSearch(makeRequest(body), ENV, withAccess({ transport }));
    assert.equal(response.status, 400);
  }
  assert.equal((await handleITJobsSearch(makeRequest({ query: 'ok' }, { contentType: 'text/plain' }), ENV, withAccess())).status, 400);
  const tooLarge = new Request('https://worker.example/api/itjobs/search', {
    method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: `{"query":"${'a'.repeat(5_000)}"}`,
  });
  assert.equal((await handleITJobsSearch(tooLarge, ENV, withAccess({ transport }))).status, 413);
  const malformedJson = new Request('https://worker.example/api/itjobs/search', {
    method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: '{invalid json',
  });
  assert.equal((await handleITJobsSearch(malformedJson, ENV, withAccess({ transport }))).status, 400);
  assert.equal(calls, 0);
});

test('missing API secret fails closed and does not reveal the secret name or value', async () => {
  const response = await handleITJobsSearch(makeRequest({ query: 'test' }), { ...ENV, ITJOBS_API_KEY: undefined }, withAccess());
  assert.equal(response.status, 503);
  const body = await serialized(response);
  assert.equal(body.includes(KEY), false);
  assert.equal(body.includes('ITJOBS_API_KEY'), false);
});

test('upstream HTTP errors are reduced to a safe client response', async () => {
  const response = await handleITJobsSearch(makeRequest({ query: 'test' }), ENV, withAccess({
    transport: async () => upstream({ error: { message: KEY } }, 403),
  }));
  assert.equal(response.status, 502);
  const body = await serialized(response);
  assert.equal(body.includes(KEY), false);
  assert.equal(body.includes('403'), false);
});

test('timeouts return a gateway timeout without leaking transport details', async () => {
  const response = await handleITJobsSearch(makeRequest({ query: 'test' }), ENV, withAccess({
    timeoutMs: 5,
    transport: (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error(`${KEY} timed out`)), { once: true });
    }),
  }));
  assert.equal(response.status, 504);
  assert.equal((await serialized(response)).includes(KEY), false);
});

test('invalid upstream JSON is sanitized', async () => {
  const response = await handleITJobsSearch(makeRequest({ query: 'test' }), ENV, withAccess({
    transport: async () => ({ ok: true, status: 200, json: async () => { throw new Error(KEY); } }),
  }));
  assert.equal(response.status, 502);
  const body = await serialized(response);
  assert.equal(body.includes(KEY), false);
  assert.equal(body.includes('invalid_response'), true);
});

test('CORS allows only the exact configured origin and supports preflight', async () => {
  const preflight = new Request('https://worker.example/api/itjobs/search', {
    method: 'OPTIONS', headers: { origin: ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
  });
  const allowed = await handleITJobsSearch(preflight, ENV);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(allowed.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  assert.equal(allowed.headers.get('access-control-allow-credentials'), null);

  const deniedHeader = new Request('https://worker.example/api/itjobs/search', {
    method: 'OPTIONS', headers: { origin: ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization' },
  });
  assert.equal((await handleITJobsSearch(deniedHeader, ENV)).status, 403);

  const denied = await handleITJobsSearch(makeRequest({ query: 'test' }, { origin: 'https://attacker.example' }), ENV);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  assert.equal((await serialized(denied)).includes(KEY), false);
  const missingOrigin = await handleITJobsSearch(makeRequest({ query: 'test' }, { origin: null }), ENV);
  assert.equal(missingOrigin.status, 403);
});

test('unsupported methods do not start an upstream request', async () => {
  const response = await handleITJobsSearch(makeRequest(undefined, { method: 'GET' }), ENV);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), null);
});

test('missing or malformed Access credentials are rejected before rate limiting or ITJobs', async () => {
  let rateCalls = 0;
  const protectedEnv = { ...ENV, SEARCH_LIMITER: { limit: async () => { rateCalls += 1; return { success: true }; } } };
  const missing = await handleITJobsSearch(makeRequest({ query: 'test' }), protectedEnv);
  assert.equal(missing.status, 401);
  assert.equal((await serialized(missing)).includes(KEY), false);

  const malformedRequest = makeRequest({ query: 'test' });
  const headers = new Headers(malformedRequest.headers);
  headers.set('cf-access-jwt-assertion', 'not-a-jwt');
  const malformed = await handleITJobsSearch(new Request(malformedRequest, { headers }), protectedEnv);
  assert.equal(malformed.status, 401);
  assert.equal(rateCalls, 0);
});

test('per-identity rate limit rejects excess usage and hashes identity keys', async () => {
  let receivedKey = '';
  const limited = await handleITJobsSearch(makeRequest({ query: 'test' }), ENV, withAccess({
    transport: async () => upstream(sampleResponse),
  }));
  assert.equal(limited.status, 200);

  const response = await handleITJobsSearch(makeRequest({ query: 'test' }), {
    ...ENV,
    SEARCH_LIMITER: { limit: async ({ key }) => { receivedKey = key; return { success: false }; } },
  }, withAccess());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.ok(receivedKey.startsWith('identity:'));
  assert.equal(receivedKey.includes('test-user-subject'), false);
  assert.equal(receivedKey.includes('test-user@example.invalid'), false);
});

test('missing or failing rate limiter fails closed', async () => {
  const noBinding = await handleITJobsSearch(makeRequest({ query: 'test' }), { ...ENV, SEARCH_LIMITER: undefined }, withAccess());
  assert.equal(noBinding.status, 503);
  const unavailable = await handleITJobsSearch(makeRequest({ query: 'test' }), {
    ...ENV,
    SEARCH_LIMITER: { limit: async () => { throw new Error(KEY); } },
  }, withAccess());
  assert.equal(unavailable.status, 503);
  assert.equal((await serialized(unavailable)).includes(KEY), false);
});
