import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { createCloudflareAccessVerifier, type AccessKeyFetcher } from '../src/worker/cloudflare-access-auth';

const TEAM = 'jobfinder-team.cloudflareaccess.com';
const AUDIENCE = 'jobfinder-application-audience';
const NOW = 1_798_000_000_000;

function encode(value: string | Uint8Array): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function setup() {
  const pair = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const publicJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey) as JsonWebKey & { kid?: string };
  publicJwk.kid = 'test-key-1';
  const urls: string[] = [];
  const fetchKeys: AccessKeyFetcher = async (url, init) => {
    urls.push(url);
    assert.equal(init.headers.accept, 'application/json');
    return { ok: true, json: async () => ({ keys: [publicJwk] }) };
  };
  const verifier = createCloudflareAccessVerifier(fetchKeys, () => NOW);
  const makeToken = async (overrides: Record<string, unknown> = {}, corruptSignature = false) => {
    const header = encode(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test-key-1' }));
    const payload = encode(JSON.stringify({
      aud: [AUDIENCE],
      email: 'verified-user@example.invalid',
      exp: NOW / 1000 + 3_600,
      iat: NOW / 1000,
      nbf: NOW / 1000 - 5,
      iss: `https://${TEAM}`,
      type: 'app',
      sub: 'verified-user-subject',
      ...overrides,
    }));
    const input = `${header}.${payload}`;
    const signatureBuffer = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(input));
    const signature = new Uint8Array(signatureBuffer);
    if (corruptSignature) signature[signature.length - 1] ^= 1;
    return `${input}.${encode(signature)}`;
  };
  return { verifier, makeToken, urls };
}

test('validates Access RS256 signature, issuer, audience, expiry, and identity claims', async () => {
  const { verifier, makeToken, urls } = await setup();
  const result = await verifier(await makeToken(), { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUDIENCE });
  assert.equal(result.authenticated, true);
  if (result.authenticated) {
    assert.equal(result.identity.subject, 'verified-user-subject');
    assert.equal(result.identity.email, 'verified-user@example.invalid');
  }
  assert.deepEqual(urls, [`https://${TEAM}/cdn-cgi/access/certs`]);
  await verifier(await makeToken(), { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUDIENCE });
  assert.equal(urls.length, 1, 'public signing keys are cached for subsequent requests');
});

test('rejects forged, expired, wrong-audience, wrong-issuer, and service-token identities', async () => {
  const { verifier, makeToken } = await setup();
  const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUDIENCE };
  assert.deepEqual(await verifier(await makeToken({}, true), env), { authenticated: false, reason: 'invalid' });
  assert.deepEqual(await verifier(await makeToken({ exp: NOW / 1000 - 1 }), env), { authenticated: false, reason: 'invalid' });
  assert.deepEqual(await verifier(await makeToken({ aud: ['another-app'] }), env), { authenticated: false, reason: 'invalid' });
  assert.deepEqual(await verifier(await makeToken({ iss: 'https://attacker.cloudflareaccess.com' }), env), { authenticated: false, reason: 'invalid' });
  assert.deepEqual(await verifier(await makeToken({ sub: '' }), env), { authenticated: false, reason: 'invalid' });
});

test('missing credentials do not fetch keys; invalid configuration and JWKS failures fail closed', async () => {
  let fetchCount = 0;
  const verifier = createCloudflareAccessVerifier(async () => { fetchCount += 1; throw new Error('sensitive transport detail'); }, () => NOW);
  assert.deepEqual(await verifier(null, { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUDIENCE }), { authenticated: false, reason: 'missing' });
  assert.equal(fetchCount, 0);
  const { makeToken } = await setup();
  const validToken = await makeToken();
  assert.deepEqual(await verifier(validToken, { ACCESS_TEAM_DOMAIN: 'attacker.example', ACCESS_AUD: AUDIENCE }), { authenticated: false, reason: 'unavailable' });
  assert.deepEqual(await verifier(validToken, { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUDIENCE }), { authenticated: false, reason: 'unavailable' });
});
