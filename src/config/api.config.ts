import { env, Env } from './env';

const BASE_URL_BY_ENV: Record<Env['TEST_ENV'], string> = {
  dev: env.DEV_API_BASE_URL,
  staging: env.STAGING_API_BASE_URL || env.DEV_API_BASE_URL,
  prod: env.PROD_API_BASE_URL || env.DEV_API_BASE_URL,
};

export const apiConfig = {
  baseURL: BASE_URL_BY_ENV[env.TEST_ENV],
  timeout: env.API_TIMEOUT_MS,
  defaultHeaders: {
    'Content-Type': 'application/json',
  },
} as const;

export type ActorRole = 'admin' | 'institution' | 'user' | 'offline';

export const actorCredentials: Record<ActorRole, { username?: string; password?: string }> = {
  admin: { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD },
  institution: { username: env.INSTITUTION_USERNAME, password: env.INSTITUTION_PASSWORD },
  user: { username: env.USER_USERNAME, password: env.USER_PASSWORD },
  offline: { username: env.OFFLINE_USERNAME, password: env.OFFLINE_PASSWORD },
};

export function isActorConfigured(role: ActorRole): boolean {
  const creds = actorCredentials[role];
  return Boolean(creds.username && creds.password);
}
