/**
 * Idempotent one-off: registers the ADMIN_USERNAME/ADMIN_PASSWORD test account
 * (from .env) against the dev API if it doesn't already exist, using the known-good
 * seed IDs in src/config/seed.constants.ts. Safe to re-run — "User Name already
 * exists!." is treated as success, not failure.
 *
 * Run with: npx ts-node scripts/bootstrap-admin.ts  (or `npm run bootstrap:admin`)
 */
import { env } from '../src/config/env';
import { apiConfig } from '../src/config/api.config';
import { SEED } from '../src/config/seed.constants';

async function main() {
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
    console.error('ADMIN_USERNAME/ADMIN_PASSWORD are not set in .env — nothing to bootstrap.');
    process.exit(1);
  }

  const response = await fetch(`${apiConfig.baseURL}/v1/admin/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userName: env.ADMIN_USERNAME.split('@')[0] || env.ADMIN_USERNAME,
      email: env.ADMIN_USERNAME,
      password: env.ADMIN_PASSWORD,
      userTypeId: SEED.ADMIN_USER_TYPE_ID,
      companyId: SEED.COMPANY_ID,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string };

  if (response.ok) {
    console.log(`Created admin account: ${env.ADMIN_USERNAME}`);
    return;
  }
  if (typeof body.error === 'string' && /already exists/i.test(body.error)) {
    console.log(`Admin account already exists: ${env.ADMIN_USERNAME}`);
    return;
  }
  console.error(`Bootstrap failed (${response.status}): ${body.error ?? 'unknown error'}`);
  process.exit(1);
}

main();
