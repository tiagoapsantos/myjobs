import { ITJobsClient, ITJobsClientError, type ITJobsTransport } from '../lib/sources/itjobs/itjobs-client';
import { verifyCloudflareAccessJwt, type AccessJwtEnvironment, type AccessJwtResult } from './cloudflare-access-auth';

const MAX_BODY_BYTES = 4_096;
const MAX_QUERY_LENGTH = 120;
const MAX_PAGE = 1_000;
const MAX_LIMIT = 50;
const ALLOWED_ORIGIN_HEADER = 'Access-Control-Allow-Origin';

export interface JobFinderWorkerEnv {
  /** Configure as a Cloudflare Worker secret. Never place this in [vars]. */
  ITJOBS_API_KEY?: string;
  /** Exact browser origin allowed to call this endpoint, e.g. https://app.example. */
  ALLOWED_ORIGIN?: string;
  /** Cloudflare Access team domain, e.g. team.cloudflareaccess.com. */
  ACCESS_TEAM_DOMAIN?: string;
  /** Access application audience tag. */
  ACCESS_AUD?: string;
  /** Cloudflare Workers Rate Limiting binding; required at runtime. */
  SEARCH_LIMITER?: SearchRateLimiter;
}

export interface SearchRateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface SearchPayload {
  query: string;
  page: number;
  limit: number;
}

function json(body: unknown, status: number, origin?: string): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    vary: 'Origin',
  });
  if (origin) {
    headers.set(ALLOWED_ORIGIN_HEADER, origin);
    headers.set('access-control-allow-methods', 'POST, OPTIONS');
    headers.set('access-control-allow-headers', 'Content-Type');
    headers.set('access-control-max-age', '600');
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function validAllowedOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.origin !== value || !['https:', 'http:'].includes(parsed.protocol)) return null;
    if (parsed.protocol === 'http:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') return null;
    return value;
  } catch {
    return null;
  }
}

async function readBoundedBody(request: Request): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    try { reader.releaseLock(); } catch { /* The stream may already be closed or cancelled. */ }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return null; }
}

function validatePayload(value: unknown): SearchPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !['query', 'page', 'limit'].includes(key))) return null;
  if (typeof record.query !== 'string') return null;
  const query = record.query.trim();
  if (!query || query.length > MAX_QUERY_LENGTH || /[\u0000-\u001f\u007f]/.test(query)) return null;
  if (query.split(',').some((part) => !part.trim())) return null;
  const page = record.page === undefined ? 1 : record.page;
  const limit = record.limit === undefined ? 20 : record.limit;
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 1 || page > MAX_PAGE) return null;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return null;
  return { query, page, limit };
}

const workerTransport: ITJobsTransport = (url, init) => fetch(url, init);

export interface ITJobsWorkerDependencies {
  transport?: ITJobsTransport;
  timeoutMs?: number;
  authenticate?: (token: string | null, env: AccessJwtEnvironment) => Promise<AccessJwtResult>;
}

/** Standalone handler exported for deterministic tests; the app does not import or call it. */
export async function handleITJobsSearch(
  request: Request,
  env: JobFinderWorkerEnv,
  dependencies: ITJobsWorkerDependencies = {},
): Promise<Response> {
  const allowedOrigin = validAllowedOrigin(env.ALLOWED_ORIGIN);
  const requestOrigin = request.headers.get('origin');
  const corsOrigin = allowedOrigin && requestOrigin === allowedOrigin ? allowedOrigin : undefined;

  if (!allowedOrigin || !requestOrigin || !corsOrigin) return json({ error: { code: 'origin_not_allowed', message: 'Origem não autorizada.' } }, 403);
  if (request.method === 'OPTIONS') {
    const requestedMethod = request.headers.get('access-control-request-method');
    const requestedHeaders = (request.headers.get('access-control-request-headers') ?? '')
      .split(',').map((header) => header.trim().toLowerCase()).filter(Boolean);
    if (requestedMethod !== 'POST' || requestedHeaders.some((header) => header !== 'content-type')) {
      return json({ error: { code: 'preflight_not_allowed', message: 'Pedido de origem cruzada não autorizado.' } }, 403, corsOrigin);
    }
    return new Response(null, { status: 204, headers: corsHeaders(corsOrigin) });
  }
  if (request.method !== 'POST') return json({ error: { code: 'method_not_allowed', message: 'Método não permitido.' } }, 405, corsOrigin);

  let authentication: AccessJwtResult;
  try {
    authentication = await (dependencies.authenticate ?? verifyCloudflareAccessJwt)(
      request.headers.get('cf-access-jwt-assertion'),
      env,
    );
  } catch {
    return json({ error: { code: 'authentication_unavailable', message: 'A autenticação não está disponível.' } }, 503, corsOrigin);
  }
  if (!authentication.authenticated) {
    if (authentication.reason === 'unavailable') {
      return json({ error: { code: 'authentication_unavailable', message: 'A autenticação não está disponível.' } }, 503, corsOrigin);
    }
    return json({ error: { code: 'unauthorized', message: 'É necessária uma sessão autenticada.' } }, 401, corsOrigin);
  }

  if (!env.SEARCH_LIMITER) {
    return json({ error: { code: 'service_unavailable', message: 'A pesquisa ITJobs não está disponível.' } }, 503, corsOrigin);
  }
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(authentication.identity.subject)));
    const identityKey = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const decision = await env.SEARCH_LIMITER.limit({ key: `identity:${identityKey}` });
    if (!decision.success) {
      const limited = json({ error: { code: 'rate_limited', message: 'Atingiu o limite temporário de pesquisas.' } }, 429, corsOrigin);
      limited.headers.set('retry-after', '60');
      return limited;
    }
  } catch {
    return json({ error: { code: 'rate_limit_unavailable', message: 'A pesquisa não está disponível temporariamente.' } }, 503, corsOrigin);
  }
  if (!env.ITJOBS_API_KEY?.trim()) return json({ error: { code: 'service_unavailable', message: 'A pesquisa ITJobs não está disponível.' } }, 503, corsOrigin);

  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') return json({ error: { code: 'invalid_request', message: 'Pedido inválido.' } }, 400, corsOrigin);
  const declaredLength = request.headers.get('content-length');
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)) {
    return json({ error: { code: 'invalid_request', message: 'Pedido inválido.' } }, 413, corsOrigin);
  }

  const text = await readBoundedBody(request);
  if (text === null) return json({ error: { code: 'invalid_request', message: 'Pedido inválido.' } }, 413, corsOrigin);
  let decoded: unknown;
  try { decoded = JSON.parse(text); }
  catch { return json({ error: { code: 'invalid_request', message: 'Pedido inválido.' } }, 400, corsOrigin); }
  const payload = validatePayload(decoded);
  if (!payload) return json({ error: { code: 'invalid_request', message: 'Parâmetros de pesquisa inválidos.' } }, 400, corsOrigin);

  try {
    const client = new ITJobsClient({ apiKey: env.ITJOBS_API_KEY, transport: dependencies.transport ?? workerTransport, timeoutMs: dependencies.timeoutMs ?? 8_000 });
    const result = await client.search(payload);
    return json({ source: result.sourceId, page: result.page, limit: result.limit, total: result.total, opportunities: result.opportunities }, 200, corsOrigin);
  } catch (error) {
    if (error instanceof ITJobsClientError && error.kind === 'timeout') {
      return json({ error: { code: 'upstream_timeout', message: 'A pesquisa demorou demasiado tempo.' } }, 504, corsOrigin);
    }
    if (error instanceof ITJobsClientError && error.kind === 'invalid-response') {
      return json({ error: { code: 'upstream_invalid_response', message: 'A fonte devolveu uma resposta inválida.' } }, 502, corsOrigin);
    }
    return json({ error: { code: 'upstream_unavailable', message: 'Não foi possível concluir a pesquisa.' } }, 502, corsOrigin);
  }
}

function corsHeaders(origin: string): Headers {
  return new Headers({
    [ALLOWED_ORIGIN_HEADER]: origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type',
    'access-control-max-age': '600',
    vary: 'Origin',
  });
}
