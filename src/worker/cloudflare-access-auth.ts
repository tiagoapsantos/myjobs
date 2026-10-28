export interface CloudflareAccessIdentity {
  subject: string;
  email: string | null;
}

export interface AccessJwtEnvironment {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

export type AccessJwtResult =
  | { authenticated: true; identity: CloudflareAccessIdentity }
  | { authenticated: false; reason: 'missing' | 'invalid' | 'unavailable' };

export type AccessKeyFetcher = (url: string, init: { signal: AbortSignal; headers: { accept: 'application/json' } }) => Promise<Pick<Response, 'ok' | 'json'>>;

interface AccessJwk extends JsonWebKey { kid: string; }
interface JwkSet { keys: AccessJwk[]; expiresAt: number; }
interface JwtHeader { alg?: unknown; kid?: unknown; typ?: unknown; }
interface JwtClaims {
  aud?: unknown;
  iss?: unknown;
  exp?: unknown;
  iat?: unknown;
  nbf?: unknown;
  sub?: unknown;
  email?: unknown;
  type?: unknown;
}

const JWKS_CACHE_MS = 5 * 60_000;
const JWKS_TIMEOUT_MS = 3_000;
const CLOCK_SKEW_SECONDS = 60;
const MAX_JWT_LENGTH = 8_192;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function base64UrlBytes(segment: string): Uint8Array {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJsonSegment<T>(segment: string): T {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(base64UrlBytes(segment));
  return JSON.parse(text) as T;
}

function validTeamDomain(value: string | undefined): value is string {
  return Boolean(value && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/i.test(value));
}

function audienceContains(audience: unknown, expected: string): boolean {
  return audience === expected || (Array.isArray(audience) && audience.includes(expected));
}

function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

/** Validates the edge-injected Cloudflare Access JWT in the Worker itself. */
export function createCloudflareAccessVerifier(
  fetchKeys: AccessKeyFetcher = (url, init) => fetch(url, init),
  now: () => number = Date.now,
): (token: string | null, env: AccessJwtEnvironment) => Promise<AccessJwtResult> {
  const keySets = new Map<string, JwkSet>();

  async function loadKeySet(domain: string, forceRefresh = false): Promise<JwkSet> {
    const cached = keySets.get(domain);
    if (!forceRefresh && cached && cached.expiresAt > now()) return cached;

    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(new Error('key-fetch-timeout'));
      }, JWKS_TIMEOUT_MS);
    });
    try {
      const response = await Promise.race([
        fetchKeys(`https://${domain}/cdn-cgi/access/certs`, { signal: controller.signal, headers: { accept: 'application/json' } }),
        timedOut,
      ]);
      if (!response.ok) throw new Error('key-fetch-failed');
      const payload: unknown = await response.json();
      if (!record(payload) || !Array.isArray(payload.keys)) throw new Error('invalid-key-set');
      const keys = payload.keys.flatMap((key): AccessJwk[] =>
        record(key) && key.kty === 'RSA' && typeof key.kid === 'string' && typeof key.n === 'string' && typeof key.e === 'string'
          ? [key as unknown as AccessJwk]
          : [],
      );
      if (!keys.length) throw new Error('empty-key-set');
      const keySet = { keys, expiresAt: now() + JWKS_CACHE_MS };
      keySets.set(domain, keySet);
      return keySet;
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  return async (token, env) => {
    if (!token) return { authenticated: false, reason: 'missing' };
    if (token.length > MAX_JWT_LENGTH) return { authenticated: false, reason: 'invalid' };
    if (!validTeamDomain(env.ACCESS_TEAM_DOMAIN) || !env.ACCESS_AUD?.trim()) return { authenticated: false, reason: 'unavailable' };

    let header: JwtHeader;
    let claims: JwtClaims;
    let signingInput: Uint8Array;
    let signature: Uint8Array;
    const segments = token.split('.');
    if (segments.length !== 3 || segments.some((segment) => !segment)) return { authenticated: false, reason: 'invalid' };
    try {
      header = decodeJsonSegment<JwtHeader>(segments[0]);
      claims = decodeJsonSegment<JwtClaims>(segments[1]);
      signature = base64UrlBytes(segments[2]);
      signingInput = new TextEncoder().encode(`${segments[0]}.${segments[1]}`);
    } catch {
      return { authenticated: false, reason: 'invalid' };
    }
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || (header.typ !== undefined && header.typ !== 'JWT')) {
      return { authenticated: false, reason: 'invalid' };
    }

    const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
    const currentSeconds = Math.floor(now() / 1000);
    if (claims.iss !== issuer || !audienceContains(claims.aud, env.ACCESS_AUD) || claims.type !== 'app'
      || typeof claims.exp !== 'number' || claims.exp <= currentSeconds
      || typeof claims.iat !== 'number' || claims.iat > currentSeconds + CLOCK_SKEW_SECONDS
      || (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > currentSeconds + CLOCK_SKEW_SECONDS))
      || typeof claims.sub !== 'string' || !claims.sub.trim() || claims.sub.length > 255) {
      return { authenticated: false, reason: 'invalid' };
    }

    try {
      let keySet = await loadKeySet(env.ACCESS_TEAM_DOMAIN);
      let jwk = keySet.keys.find((key) => key.kid === header.kid);
      if (!jwk) {
        keySet = await loadKeySet(env.ACCESS_TEAM_DOMAIN, true);
        jwk = keySet.keys.find((key) => key.kid === header.kid);
      }
      if (!jwk) return { authenticated: false, reason: 'invalid' };
      const publicKey = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      const verified = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, asArrayBuffer(signature), asArrayBuffer(signingInput));
      if (!verified) return { authenticated: false, reason: 'invalid' };
      return {
        authenticated: true,
        identity: {
          subject: claims.sub,
          email: typeof claims.email === 'string' && claims.email.length <= 320 ? claims.email : null,
        },
      };
    } catch {
      return { authenticated: false, reason: 'unavailable' };
    }
  };
}

export const verifyCloudflareAccessJwt = createCloudflareAccessVerifier();
