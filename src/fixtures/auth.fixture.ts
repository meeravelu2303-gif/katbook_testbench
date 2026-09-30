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
  institution: '/v1/institution/login',
  // no dedicated /v1/user/login exists in the spec — end-user tokens come from the
  // institution login flow, so the "user" role reuses that endpoint.
  user: '/v1/institution/login',
  offline: '/v1/offline/user/login',
};

function buildLoginPayload(role: ActorRole, identifier: string, password: string): Record<string, string> {
  if (role === 'admin') {
    return { userName: identifier, password };
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
  const { username, password } = actorCredentials[role];
  const response = await request.post(`${apiConfig.baseURL}${LOGIN_ENDPOINT[role]}`, {
    headers: { 'Content-Type': 'application/json' },
    data: buildLoginPayload(role, username!, password!),
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
