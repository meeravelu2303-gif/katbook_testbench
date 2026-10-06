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

export type ActorRole = 'admin' | 'institution' | 'user' | 'offline' | 'contentUploader';

export const actorCredentials: Record<ActorRole, { username?: string; password?: string; companyId?: string }> = {
  admin: { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD },
  // InstitutionUserLogin (the real login for these two, see auth.fixture.ts) requires a
  // companyId in its body, unlike every other actor's login here — INSTITUTION_COMPANY_ID
  // backs both, since they share the one real end-user-login endpoint that exists.
  institution: { username: env.INSTITUTION_USERNAME, password: env.INSTITUTION_PASSWORD, companyId: env.INSTITUTION_COMPANY_ID },
  user: { username: env.USER_USERNAME, password: env.USER_PASSWORD, companyId: env.INSTITUTION_COMPANY_ID },
  offline: { username: env.OFFLINE_USERNAME, password: env.OFFLINE_PASSWORD },
  // Internal staff account (SEED.CONTENT_UPLOADER_USER_TYPE_ID), not an end-user/institution
  // login — created via `npm run bootstrap:content-uploader` (POST /admin/content/user/add,
  // as the admin actor), logged in via POST /content/user/login (ContentUserLogin), a
  // different route from every other actor here. Needed because
  // PlanningUploadingController.createPlanningUploading cannot be self-assigned by an Admin
  // (see dairy-uploading.spec.ts's top-of-file note) — only a real Content Uploader can
  // seed real PlanningUploading data for the `diary` domain's uploading-side reports.
  contentUploader: { username: env.CONTENT_UPLOADER_USERNAME, password: env.CONTENT_UPLOADER_PASSWORD },
};

export function isActorConfigured(role: ActorRole): boolean {
  const creds = actorCredentials[role];
  if (role === 'institution' || role === 'user') {
    return Boolean(creds.username && creds.password && creds.companyId);
  }
  return Boolean(creds.username && creds.password);
}
