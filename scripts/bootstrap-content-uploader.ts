/**
 * Idempotent one-off: creates the CONTENT_UPLOADER_USERNAME/CONTENT_UPLOADER_PASSWORD test
 * account (from .env) via `POST /admin/content/user/add` (needsAuth, as the admin actor) if
 * it doesn't already exist. This is a different flow from bootstrap-admin.ts: there is no
 * self-registration route for non-Admin internal staff — an existing Admin must create them,
 * and the resulting account logs in via POST /content/user/login (ContentUserLogin), not
 * POST /admin/login. Needed because PlanningUploadingController.createPlanningUploading
 * cannot be self-assigned by an Admin (see dairy-uploading.spec.ts's top-of-file note) — a
 * real Content Uploader is the only way to seed real PlanningUploading data.
 *
 * Run with: npx ts-node scripts/bootstrap-content-uploader.ts  (or `npm run bootstrap:content-uploader`)
 */
import { env } from '../src/config/env';
import { apiConfig } from '../src/config/api.config';
import { SEED } from '../src/config/seed.constants';

async function main() {
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
    console.error('ADMIN_USERNAME/ADMIN_PASSWORD are not set in .env — cannot authenticate to create the content uploader.');
    process.exit(1);
  }
  if (!env.CONTENT_UPLOADER_USERNAME || !env.CONTENT_UPLOADER_PASSWORD) {
    console.error('CONTENT_UPLOADER_USERNAME/CONTENT_UPLOADER_PASSWORD are not set in .env — nothing to bootstrap.');
    process.exit(1);
  }

  const loginResponse = await fetch(`${apiConfig.baseURL}/v1/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userName: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD }),
  });
  const loginBody = (await loginResponse.json().catch(() => ({}))) as { token?: string; user?: { _id?: string } };
  if (!loginResponse.ok || !loginBody.token || !loginBody.user?._id) {
    console.error(`Admin login failed (${loginResponse.status}) — cannot bootstrap the content uploader without it.`);
    process.exit(1);
  }
  const adminToken = loginBody.token.replace(/^Bearer\s+/i, '');
  const adminId = loginBody.user._id;

  const response = await fetch(`${apiConfig.baseURL}/v1/admin/content/user/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      userName: env.CONTENT_UPLOADER_USERNAME.split('@')[0] || env.CONTENT_UPLOADER_USERNAME,
      email: env.CONTENT_UPLOADER_USERNAME,
      password: env.CONTENT_UPLOADER_PASSWORD,
      userTypeId: SEED.CONTENT_UPLOADER_USER_TYPE_ID,
      companyId: SEED.COMPANY_ID,
      reportingTo: adminId,
      isThirdParty: false,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string };

  if (response.ok) {
    console.log(`Created content uploader account: ${env.CONTENT_UPLOADER_USERNAME}`);
    return;
  }
  if (typeof body.error === 'string' && /already exists/i.test(body.error)) {
    console.log(`Content uploader account already exists: ${env.CONTENT_UPLOADER_USERNAME}`);
    return;
  }
  console.error(`Bootstrap failed (${response.status}): ${body.error ?? 'unknown error'}`);
  process.exit(1);
}

main();
