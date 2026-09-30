/**
 * Well-known MongoDB ObjectIds that exist in the dev database's seed data, discovered
 * by reading the backend source (D:\KATBOOK\KatbookInitiation_API) rather than guessing:
 *
 * - COMPANY_ID: hardcoded at config/config.js `CONFIG.Company[0]` in the backend, and
 *   independently confirmed live via GET /v1/store/attribute/filter, whose returned
 *   institution records embed this exact companyId.
 * - ADMIN_USER_TYPE_ID / CONTENT_DEVELOPER_USER_TYPE_ID / CONTENT_UPLOADER_USER_TYPE_ID:
 *   hardcoded in middleware/passport.js's `userTypeMap` (the backend's RBAC role map).
 *   Confirmed live: registering via POST /v1/admin/register with ADMIN_USER_TYPE_ID +
 *   COMPANY_ID succeeds, and the resulting user's userTypeId.code is "MA@1" — the exact
 *   value POST /v1/admin/login's MasterAdminLogin requires.
 *
 * There is no public API to discover these — POST /v1/usertype/add never returns the
 * created document's _id, and every listing endpoint requires auth. These are the only
 * way to bootstrap a first admin account in a fresh environment; treat them as fixed
 * reference data for the "dev" environment, not something the test bench creates itself.
 */
export const SEED = {
  COMPANY_ID: '6007cfc79052d71fec82fef2',
  ADMIN_USER_TYPE_ID: '603f80e52e47b525cc91a3b5',
  CONTENT_DEVELOPER_USER_TYPE_ID: '603f81252e47b525cc91a3b6',
  CONTENT_UPLOADER_USER_TYPE_ID: '60408011661a362a8078f040',
} as const;
