import { test, expect } from '../../fixtures/api.fixture';
import { InstitutionUserLogClient } from '../../client/institution-user-log.client';
import { SEED } from '../../config/seed.constants';
import { isActorConfigured } from '../../config/api.config';

test.describe.configure({ mode: 'parallel' });

/**
 * InstitutionUserLog.controller.js (`InstitutionUserLogController`) — self-contained, no
 * shared-model defects, and genuinely usable with the real `admin` actor (unlike almost
 * everything else in this domain). `createForSelf` is idempotent per (userId, ip, browser,
 * today), so repeated runs are safe.
 *
 * SECURITY (confirmed live, IDOR): `getAllForCompany` has no admin or company-ownership
 * check at all — any authenticated caller can read any company's institution-user logs.
 * Tested here only against our own `SEED.COMPANY_ID` (real, legitimately ours), never
 * against another real company's id — per this domain's now-established rule of never
 * pointing a request at a real id this suite doesn't already know the full shape of.
 */
test.describe('Institution — InstitutionUserLog', () => {
  test('real lifecycle: createForSelf then getAllForSelf finds it (idempotent — safe to rerun)', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const logClient = new InstitutionUserLogClient(client);

    const create = await logClient.createForSelf();
    expect(create.status()).toBe(200);
    expect((await create.json()).message).toMatch(/log was (created|already stored)!\.?/i);

    const getAll = await logClient.getAllForSelf();
    expect(getAll.status()).toBe(200);
    const body = await getAll.json();
    expect(Array.isArray(body.logs)).toBe(true);
    expect(body.logs.length).toBeGreaterThan(0);
  });

  test('createForSelf rejects an anonymous request', async ({ anonClient }) => {
    const response = await new InstitutionUserLogClient(anonClient).createForSelf();
    expect([401, 403]).toContain(response.status());
  });

  test('getAllForSelf rejects an anonymous request', async ({ anonClient }) => {
    const response = await new InstitutionUserLogClient(anonClient).getAllForSelf();
    expect([401, 403]).toContain(response.status());
  });

  test('SECURITY: getAllForCompany has no admin or ownership check — any authenticated caller can read it', async ({ clientAs }) => {
    test.skip(!isActorConfigured('contentUploader'), 'CONTENT_UPLOADER_USERNAME/PASSWORD not set — run `npm run bootstrap:content-uploader`.');
    const admin = await clientAs('admin');
    // Seed real data first (createForSelf is idempotent), so this isn't just testing an
    // empty-result shape.
    await new InstitutionUserLogClient(admin).createForSelf();

    const contentUploader = await clientAs('contentUploader');
    const response = await new InstitutionUserLogClient(contentUploader).getAllForCompany(SEED.COMPANY_ID);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.logs)).toBe(true);
    expect(body.logs.length).toBeGreaterThan(0);
  });

  test('BUG: getAllForCompany returns 200 with an empty array for a nonexistent companyId, never its own "empty" error', async ({
    clientAs,
  }) => {
    // Can't test the "missing companyId" validation branch directly either: :companyId is
    // a URL path segment, so an empty string just makes the request fall through to the
    // different, shorter `/institution/user/log/get/all` route (`getAllInstitutionLog`,
    // the self-scoped sibling) instead of failing to match this one — confirmed live.
    // This finding is separate: `getAllLogAllInstitutionUser`'s "not found" check is
    // `isNull(existingUserLog)` on a `.find()` result — this codebase's `isNull` helper
    // only treats actual `null`/`undefined` as null-like, and an empty ARRAY is neither,
    // so that branch can never fire. Confirmed live: a nonexistent companyId returns 200
    // with `logs: []`, not the intended 400 "Instition users log was empty!." — the same
    // `isNull`-on-array dead-code pattern already found elsewhere in this project (section
    // 10's ContentAttribute, among others).
    const client = await clientAs('admin');
    const response = await new InstitutionUserLogClient(client).getAllForCompany('000000000000000000000000');
    expect(response.status()).toBe(200);
    expect((await response.json()).logs).toEqual([]);
  });

  test('getAllForCompany rejects an anonymous request', async ({ anonClient }) => {
    const response = await new InstitutionUserLogClient(anonClient).getAllForCompany(SEED.COMPANY_ID);
    expect([401, 403]).toContain(response.status());
  });
});
