import assert from 'node:assert/strict';
import test from 'node:test';
import { findDuplicateOpportunities } from '../src/lib/opportunity-search';
import { ITJobsClient, ITJobsClientError, type ITJobsTransport } from '../src/lib/sources/itjobs/itjobs-client';
import { mapITJobsOpportunity } from '../src/lib/sources/itjobs/itjobs-mapper';
import type { JobOpportunity } from '../src/types/opportunity';

const sample = {
  id: 8421,
  title: 'Frontend Engineer',
  body: '<p>Build fictional product interfaces.</p>',
  company: { name: 'Example Studio' },
  locations: [{ name: 'Lisboa' }],
  country: 'PT',
  workModel: 2,
  salaryMin: 32000,
  salaryMax: 42000,
  types: [{ id: '1', name: 'Full Time' }],
  contracts: [{ id: '2', name: 'Contrato sem termo' }],
  publishedAt: '2026-10-20 10:00:00',
};

function response(payload: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function clientWith(transport: ITJobsTransport, extras: Partial<ConstructorParameters<typeof ITJobsClient>[0]> = {}) {
  return new ITJobsClient({ apiKey: 'secret-test-key', transport, now: () => '2026-10-26T12:00:00.000Z', ...extras });
}

test('valid search response maps documented fields and preserves page metadata', async () => {
  let target = '';
  let requestBody = '';
  const client = clientWith(async (url, init) => { target = url; requestBody = init.body.toString(); return response({ total: 1, page: 2, limit: 5, query: 'frontend', results: [sample] }); });
  const page = await client.search({ query: 'frontend', page: 2, limit: 5 });
  assert.equal(target, 'https://api.itjobs.pt/job/search.json');
  assert.equal(new URLSearchParams(requestBody).get('q'), 'frontend');
  assert.equal(new URLSearchParams(requestBody).get('page'), '2');
  assert.equal(new URLSearchParams(requestBody).get('limit'), '5');
  assert.equal(new URLSearchParams(requestBody).get('api_key'), 'secret-test-key');
  assert.equal(page.total, 1);
  assert.equal(page.opportunities[0]?.workMode, 'hybrid');
  assert.equal(page.opportunities[0]?.contractType, 'permanent');
  assert.equal(page.opportunities[0]?.salary?.currency, 'EUR');
});

test('empty valid response returns an empty page', async () => {
  const page = await clientWith(async () => response({ total: 0, page: 1, limit: 20, results: [] })).search({ query: 'nothing' });
  assert.deepEqual(page.opportunities, []);
  assert.equal(page.total, 0);
});

test('missing optional fields remain unknown instead of being inferred', () => {
  const mapped = mapITJobsOpportunity({ id: 9, title: 'Support Specialist' }, '2026-10-26T12:00:00.000Z');
  assert.ok(mapped);
  assert.equal(mapped.company, 'Empresa não indicada');
  assert.equal(mapped.location, null);
  assert.equal(mapped.workMode, null);
  assert.equal(mapped.contractType, null);
  assert.equal(mapped.salary, null);
  assert.equal(mapped.originalUrl, null);
  assert.deepEqual(mapped.skills, []);
});

test('invalid JSON, invalid response shape, and incomplete ads are handled safely', async () => {
  const invalidJson = clientWith(async () => ({ ok: true, status: 200, json: async () => { throw new Error('secret-test-key leaked'); } }));
  await assert.rejects(invalidJson.search({ query: 'test' }), (error: unknown) => error instanceof ITJobsClientError && error.kind === 'invalid-response' && !error.message.includes('secret-test-key'));
  await assert.rejects(clientWith(async () => response({ results: 'invalid' })).search({ query: 'test' }), (error: unknown) => error instanceof ITJobsClientError && error.kind === 'invalid-response');
  const missingListing = await clientWith(async () => response({ total: 1, page: 1, limit: 20, results: [{ title: 'No id' }] })).search({ query: 'test' });
  assert.deepEqual(missingListing.opportunities, []);
});

test('HTTP errors and transport failures never disclose request secrets', async () => {
  await assert.rejects(clientWith(async () => response({ error: { message: 'secret-test-key' } }, 403)).search({ query: 'test' }), (error: unknown) => error instanceof ITJobsClientError && error.kind === 'http' && !error.message.includes('secret-test-key'));
  await assert.rejects(clientWith(async () => { throw new Error('secret-test-key in transport'); }).search({ query: 'test' }), (error: unknown) => error instanceof ITJobsClientError && error.kind === 'network' && !error.message.includes('secret-test-key'));
});

test('timeout aborts the injected transport and returns a safe timeout error', async () => {
  const client = clientWith((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('secret-test-key timeout')), { once: true });
  }), { timeoutMs: 5 });
  await assert.rejects(client.search({ query: 'test' }), (error: unknown) => error instanceof ITJobsClientError && error.kind === 'timeout' && !error.message.includes('secret-test-key'));
});

test('duplicate detection reports candidates without deleting distinct records', () => {
  const base = mapITJobsOpportunity(sample, '2026-10-26T12:00:00.000Z');
  assert.ok(base);
  const sameExternal = { ...base, id: 'itjobs:8421-copy' };
  const differentPosting: JobOpportunity = { ...base, id: 'itjobs:9999', externalId: '9999', title: 'Different role' };
  assert.deepEqual(findDuplicateOpportunities([base, sameExternal, differentPosting]), [['itjobs:8421', 'itjobs:8421-copy']]);
  assert.equal([base, sameExternal, differentPosting].length, 3);
});

test('the client requires an explicit key and injected transport and never logs it', async () => {
  assert.throws(() => new ITJobsClient({ apiKey: '  ', transport: async () => response({}) }), (error: unknown) => error instanceof ITJobsClientError && error.kind === 'configuration');
  let transportCalls = 0;
  const client = clientWith(async () => { transportCalls += 1; return response({ total: 0, page: 1, limit: 20, results: [] }); });
  assert.equal(transportCalls, 0);
  assert.ok(client);
});
