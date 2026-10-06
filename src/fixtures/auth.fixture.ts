import type { APIRequestContext } from '@playwright/test';
import { apiConfig, actorCredentials, isActorConfigured, ActorRole } from '../config/api.config';

/**
 * swagger.json declares every login request body as `{ type: object, example: {} }` — no
 * field names are documented. Confirmed live against POST /v1/admin/login by probing the
 * validation error messages ("Please enter phone Number or Email !." -> "Please enter vaild
 * password!." -> "User not register!."): the shape is { userName: <phone or email>, password }.
 * institution/offline are unconfirmed — sending a superset of plausible keys until verified.
 */
const LOGIN_ENDPOINT: Record<ActorRole, string> = {
  admin: '/v1/admin/login',
  /**
   * CRITICAL, fixed 2026-10-05 (institution domain pass) — this used to point at
   * `/v1/institution/login`. That is `IASInstitutionController.institutionLogin`, a
   * completely different, Admin-only, company-level endpoint (body: companyId +
   * institution password, requires the caller's OWN token to already be an Admin's) — not
   * an end-user personal login at all. Worse: confirmed from source, that handler
   * references `user.userTypeId` on its very first line, but `user` (`req.user`) is never
   * declared anywhere in the function and the route has no auth middleware — a plain
   * `ReferenceError` on every single call. This codebase has no `unhandledRejection`
   * handler anywhere, so on Node 24 that crashes the whole backend process (pm2 restarts
   * it per `ecosystem.config.js`, but the backend bounces for everyone using the shared
   * dev server in the meantime). Never confirmed by actually calling it — decided from
   * source-reading alone, consistent with this project's policy of documenting severe
   * findings without detonating them.
   * The real end-user personal login is `InstitutionUserController.InstitutionUserLogin`
   * at `/v1/insitution/user/login` (note the real route's spelling — not a typo in this
   * file) — body `{userName, password, companyId}`, no auth required, and confirmed
   * structurally safe (no undeclared-variable crash) by direct source reading. See
   * `src/client/ias-institution.client.ts` and `institution-user.client.ts` for the full
   * writeup of both endpoints.
   */
  institution: '/v1/insitution/user/login',
  user: '/v1/insitution/user/login',
  offline: '/v1/offline/user/login',
  // ContentUserLogin — the only login route that accepts a non-Admin internal-staff User
  // (Content Developer/Uploader); /v1/admin/login hard-rejects anything but the Admin
  // usertype code. See api.config.ts's actorCredentials comment for why this actor exists.
  contentUploader: '/v1/content/user/login',
};

function buildLoginPayload(role: ActorRole, identifier: string, password: string, companyId?: string): Record<string, string> {
  if (role === 'admin' || role === 'contentUploader') {
    return { userName: identifier, password };
  }
  if (role === 'institution' || role === 'user') {
    // InstitutionUserLogin's required fields, confirmed from source: userName, password, companyId.
    return { userName: identifier, password, ...(companyId ? { companyId } : {}) };
  }
  return {
    userName: identifier,
    email: identifier,
    phoneNumber: identifier,
    password,
  };
}

export class AuthenticationError extends Error {}

/**
 * Logs in as the given actor role and returns the bearer token from the response.
 * Throws AuthenticationError if the role has no credentials configured or the login call fails.
 * Callers (fixtures) should check isActorConfigured(role) first to skip instead of fail.
 */
export async function loginAs(request: APIRequestContext, role: ActorRole): Promise<string> {
  if (!isActorConfigured(role)) {
    throw new AuthenticationError(`No credentials configured for actor role "${role}"`);
  }
  const { username, password, companyId } = actorCredentials[role];
  const response = await request.post(`${apiConfig.baseURL}${LOGIN_ENDPOINT[role]}`, {
    headers: { 'Content-Type': 'application/json' },
    data: buildLoginPayload(role, username!, password!, companyId),
  });

  if (!response.ok()) {
    const body = await response.text().catch(() => '');
    throw new AuthenticationError(
      `Login failed for role "${role}": ${response.status()} ${response.statusText()} ${body}`,
    );
  }

  const body = await response.json().catch(() => null);
  const token = extractToken(body);
  if (!token) {
    throw new AuthenticationError(
      `Login for role "${role}" returned 2xx but no recognizable token field in the response body`,
    );
  }
  return token;
}

/**
 * Confirmed live against POST /v1/admin/login: the response's "token" field already
 * includes a "Bearer " prefix (`"token":"Bearer eyJ..."`). BaseApiClient adds its own
 * "Bearer " prefix when attaching Authorization headers, so we strip it here to keep the
 * returned value a bare JWT everywhere downstream.
 */
function extractToken(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as Record<string, unknown>;
  const candidates = [
    record.token,
    record.accessToken,
    record.access_token,
    record.jwt,
    (record.data as Record<string, unknown> | undefined)?.token,
  ];
  const raw = candidates.find((c): c is string => typeof c === 'string' && c.length > 0);
  return raw?.replace(/^Bearer\s+/i, '');
}
