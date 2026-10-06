import { test, expect } from '../../fixtures/api.fixture';
import { InstitutionUserClient } from '../../client/institution-user.client';
import { SEED } from '../../config/seed.constants';

test.describe.configure({ mode: 'parallel' });

const PLACEHOLDER = '000000000000000000000000';

/**
 * InsitutionUser.controller.js (`InstitutionUserController`) — institution end-users.
 * Every test below uses the all-zeros placeholder for any company/user id a route might
 * use in an existence check or a state-mutating call — never `SEED.COMPANY_ID` or any other
 * shared real id — per the lesson in `ias-institution.spec.ts`'s top-of-file incident note:
 * this suite cannot safely assume a given shared id has no real, undiscovered
 * `InstitutionUser`/`IASInstitution` data behind it.
 *
 * BUG (confirmed live via Mongoose instance inspection, same class as IASInstitution):
 * `InstitutionUser.model.js`'s `pre('save')` hook has the identical `this.isUpdated(...)`
 * defect — any real registration or password reset that reaches `.save()` would 500. In
 * practice, registration 400s even earlier: it requires an active `IASInstitution` record
 * for the target company to already exist, which (per `ias-institution.client.ts`) can
 * essentially never be created through this API.
 *
 * `InstitutionUserLogin` is confirmed structurally SAFE to call (no undeclared-variable
 * crash, unlike `IASInstitutionController.institutionLogin` — see `ias-institution.client.ts`
 * and the fix in `auth.fixture.ts`) — it just can never succeed without a real
 * `InstitutionUser`, which cannot exist. It also has a confirmed real bug, documented but
 * not exploited: it never verifies the resolved user actually belongs to the submitted
 * `companyId` before consuming a seat from that company's `activatedKey` — a cross-company
 * seat-consumption issue that would need a real institution user to prove against, which
 * this environment cannot provide.
 */
test.describe('Institution — InstitutionUser', () => {
  test('register rejects a non-Admin caller', async ({ clientAs }) => {
    const client = await clientAs('contentUploader');
    const response = await new InstitutionUserClient(client).register({
      userName: 'qa-probe',
      email: 'qa-probe@example.com',
      password: 'Password@123',
      userTypeId: PLACEHOLDER,
      companyId: PLACEHOLDER,
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/admin/i);
  });

  test('register rejects a nonexistent company', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new InstitutionUserClient(client).register({
      userName: 'qa-probe',
      email: 'qa-probe@example.com',
      password: 'Password@123',
      userTypeId: PLACEHOLDER,
      companyId: PLACEHOLDER,
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('Company not found!');
  });

  test('register rejects an anonymous request', async ({ anonClient }) => {
    const response = await new InstitutionUserClient(anonClient).register({
      userName: 'qa-probe',
      email: 'qa-probe@example.com',
      password: 'Password@123',
      userTypeId: PLACEHOLDER,
      companyId: PLACEHOLDER,
    });
    expect([401, 403]).toContain(response.status());
  });

  test('login rejects missing required fields', async ({ anonClient }) => {
    const response = await new InstitutionUserClient(anonClient).login('', '', '');
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/required fields/i);
  });

  test('login rejects a nonexistent company', async ({ anonClient }) => {
    const response = await new InstitutionUserClient(anonClient).login('qa-probe', 'Password@123', PLACEHOLDER);
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('Company not found!');
  });

  test('login is public and requires no token', async ({ anonClient }) => {
    const response = await new InstitutionUserClient(anonClient).login('qa-probe', 'Password@123', PLACEHOLDER);
    expect([401, 403]).not.toContain(response.status());
  });

  test('profile (GetInstitutionUser) returns an empty/not-found result for an Admin token (no real InstitutionUser token can pass needsAuth)', async ({
    clientAs,
  }) => {
    const client = await clientAs('admin');
    const response = await new InstitutionUserClient(client).profile();
    expect(response.status()).toBe(400);
  });

  test('block rejects a nonexistent company/user', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new InstitutionUserClient(client).block(PLACEHOLDER, PLACEHOLDER);
    expect(response.status()).toBe(400);
  });

  test('unblock rejects a nonexistent company/user', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new InstitutionUserClient(client).unblock(PLACEHOLDER, PLACEHOLDER);
    expect(response.status()).toBe(400);
  });

  test('getAllByAdmin rejects a nonexistent company', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new InstitutionUserClient(client).getAllByAdmin(PLACEHOLDER);
    expect(response.status()).toBe(400);
  });

  test('getByAdmin rejects a nonexistent company/user', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new InstitutionUserClient(client).getByAdmin(PLACEHOLDER, PLACEHOLDER);
    expect(response.status()).toBe(400);
  });

  test('resetPassword rejects a nonexistent company/user', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new InstitutionUserClient(client).resetPassword(PLACEHOLDER, PLACEHOLDER, 'Password@123');
    expect(response.status()).toBe(400);
  });

  test('deleteByAdmin rejects a nonexistent company/user', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new InstitutionUserClient(client).deleteByAdmin(PLACEHOLDER, PLACEHOLDER);
    expect(response.status()).toBe(400);
  });

  test('getAllByAdmin rejects an anonymous request', async ({ anonClient }) => {
    const response = await new InstitutionUserClient(anonClient).getAllByAdmin(SEED.COMPANY_ID);
    expect([401, 403]).toContain(response.status());
  });
});
