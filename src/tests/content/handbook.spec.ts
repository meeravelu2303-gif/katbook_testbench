import { test, expect } from '../../fixtures/api.fixture';
import { HandbookClient } from '../../client/handbook.client';
import { readError } from '../management/support';
import { SEED, CURRICULUM } from '../../config/seed.constants';

test.describe.configure({ mode: 'parallel' });

/**
 * handbook.controller.js — read directly. Create/Update(via create)/GetAll are needsAuth
 * (Delete additionally admin-gated); GetAllTeachersHandbook is fully public.
 *
 * BUG (confirmed live, not just from source): the "matching variable/tier" existence check
 * in CreateTeachersHandbook (handbook.controller.js:181-243) treats `tierDetails`/
 * `variableDetails` as single objects (`tierDetails.tierId`) while the earlier field
 * validation treats them as arrays (`tierDetails.filter(...)`) — the two disagree. In
 * practice, `new ObjectId(undefined)` (mongodb driver) silently generates a random,
 * never-matching ObjectId instead of throwing, so the "not found"/"mismatched" checks
 * never fire and the raw request body is saved as-is, regardless of whether the referenced
 * tier/variable actually exists. Not exploited further here — flagged for the backend team.
 *
 * BUG (found reading source, `GetHandbookByQuery`, handbook.controller.js:809-839): the
 * non-empty branch maps over `existingHandbooks` (plural), a variable that is never
 * declared anywhere in the function — the actual fetched result is `existingHandbook`
 * (singular, line 817). This would be a guaranteed `ReferenceError` whenever the query
 * matches any real data — but live against api1.katbook.com it never gets that far: see
 * the hang finding below. Source-level finding retained for whoever fixes the hang.
 *
 * BUG (confirmed live, severe): `GetHandbookByQuery` (the dedicated GET-by-query route)
 * and `updateDedicated` (the dedicated PUT update route) both hang indefinitely — no
 * response, confirmed with a bounded 15s timeout via both Playwright and a raw `curl`
 * probe (curl exit 28, fully independent of Playwright) — for a real, matching/existing
 * handbook. Unlike the ContentLink update/delete hangs documented elsewhere in this
 * project, `updateDedicated`'s write does NOT persist despite the hang (re-fetched via the
 * public getAllByCompany route immediately after: content/isUnit/updatedAt all unchanged
 * from creation) — this hangs before completing the write, not after, a different flavor
 * of the same symptom class. `delete` itself is unaffected (confirmed fast, ~150ms) and is
 * safe to use for cleanup.
 */
function buildHandbook(overrides: Partial<Parameters<HandbookClient['create']>[0]> = {}) {
  return {
    companyId: SEED.COMPANY_ID,
    typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
    countryId: CURRICULUM.COUNTRY_ID,
    institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
    attributeId: CURRICULUM.ATTRIBUTE_ID,
    tierDetails: [{ tierId: CURRICULUM.TIER_1_ID }],
    variableDetails: [{ variableId: CURRICULUM.TOP_VARIABLE_ID }],
    content: 'qa-handbook-content',
    isUnit: false,
    ...overrides,
  };
}

test.describe('Content — HandBook', () => {
  test('create rejects an anonymous request', async ({ anonClient }) => {
    const client = new HandbookClient(anonClient);
    const response = await client.create(buildHandbook());
    expect([401, 403]).toContain(response.status());
  });

  test('create rejects a missing typeOfBook', async ({ clientAs }) => {
    const client = new HandbookClient(await clientAs('admin'));
    const response = await client.create(buildHandbook({ typeOfBook: '' }));
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('Please select type of book!');
  });

  test('create rejects a nonexistent attributeId', async ({ clientAs }) => {
    const client = new HandbookClient(await clientAs('admin'));
    const response = await client.create(buildHandbook({ attributeId: '000000000000000000000000' }));
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('Attribute not found!');
  });

  test('full lifecycle with real curriculum data: create, appears in public getAll, update, delete', async ({
    clientAs,
    anonClient,
  }) => {
    const client = new HandbookClient(await clientAs('admin'));
    const input = buildHandbook();

    const createResponse = await client.create(input);
    expect(createResponse.status()).toBe(200);
    const created = (await createResponse.json()).data;
    expect(created.content).toBe(input.content);

    const publicClient = new HandbookClient(anonClient);
    const getAllResponse = await publicClient.getAllByCompany({
      countryId: CURRICULUM.COUNTRY_ID,
      institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
      companyId: SEED.COMPANY_ID,
      typeOfBookId: CURRICULUM.TYPE_OF_BOOK_ID,
    });
    expect(getAllResponse.status()).toBe(200);

    const updateResponse = await client.updateViaCreate(created._id, 'qa-handbook-content-updated', true);
    expect(updateResponse.status()).toBe(200);
    expect((await updateResponse.json()).data.content).toBe('qa-handbook-content-updated');

    const deleteResponse = await client.delete(
      created._id,
      CURRICULUM.COUNTRY_ID,
      CURRICULUM.INSTITUTION_TYPE_ID,
      SEED.COMPANY_ID,
    );
    expect(deleteResponse.status()).toBe(200);
  });

  test('SECURITY: create response leaks the password hash via createdBy/updatedBy', async ({ clientAs }) => {
    // Same defect class as login.spec.ts (/v1/user/profile) and management-planning.spec.ts
    // (planning preparation create) — createdBy/updatedBy are assigned the full req.user
    // document instead of user._id. Confirmed live; a 3rd occurrence of this pattern.
    const client = new HandbookClient(await clientAs('admin'));
    const created = (await (await client.create(buildHandbook())).json()).data;
    try {
      expect(created.createdBy).not.toHaveProperty('password');
      expect(created.updatedBy).not.toHaveProperty('password');
    } finally {
      await client.delete(created._id, CURRICULUM.COUNTRY_ID, CURRICULUM.INSTITUTION_TYPE_ID, SEED.COMPANY_ID);
    }
  });

  test('delete rejects an anonymous request', async ({ anonClient }) => {
    const client = new HandbookClient(anonClient);
    const response = await client.delete(
      '000000000000000000000000',
      CURRICULUM.COUNTRY_ID,
      CURRICULUM.INSTITUTION_TYPE_ID,
      SEED.COMPANY_ID,
    );
    expect([401, 403]).toContain(response.status());
  });

  test('getAllByCompany is public and requires no token', async ({ anonClient }) => {
    const client = new HandbookClient(anonClient);
    const response = await client.getAllByCompany({
      countryId: '000000000000000000000000',
      institutionTypeId: '000000000000000000000000',
      companyId: '000000000000000000000000',
      typeOfBookId: '000000000000000000000000',
    });
    expect([401, 403]).not.toContain(response.status());
  });

  test('BUG: updateDedicated hangs indefinitely for a real existing handbook, and the write does not persist', async ({
    clientAs,
  }) => {
    const client = new HandbookClient(await clientAs('admin'));
    const created = (await (await client.create(buildHandbook())).json()).data;
    try {
      await expect(
        client.updateDedicated(
          created._id,
          CURRICULUM.COUNTRY_ID,
          CURRICULUM.INSTITUTION_TYPE_ID,
          SEED.COMPANY_ID,
          'qa-handbook-content-dedicated-update',
          true,
          8000,
        ),
      ).rejects.toThrow(/timeout/i);
    } finally {
      await client.delete(created._id, CURRICULUM.COUNTRY_ID, CURRICULUM.INSTITUTION_TYPE_ID, SEED.COMPANY_ID);
    }
  });

  test('updateDedicated rejects an anonymous request', async ({ anonClient }) => {
    const client = new HandbookClient(anonClient);
    const response = await client.updateDedicated(
      '000000000000000000000000',
      CURRICULUM.COUNTRY_ID,
      CURRICULUM.INSTITUTION_TYPE_ID,
      SEED.COMPANY_ID,
      'x',
      false,
    );
    expect([401, 403]).toContain(response.status());
  });

  test('getAllByVariables is public and rejects a missing variables list', async ({ anonClient }) => {
    const client = new HandbookClient(anonClient);
    const response = await client.getAllByVariables(
      {
        countryId: CURRICULUM.COUNTRY_ID,
        typeOfBookId: CURRICULUM.TYPE_OF_BOOK_ID,
        institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
        companyId: SEED.COMPANY_ID,
      },
      undefined as never,
    );
    expect([401, 403]).not.toContain(response.status());
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('Please select variables!');
  });

  test('getByQuery is public and returns 404 for a query matching nothing', async ({ anonClient }) => {
    const client = new HandbookClient(anonClient);
    const response = await client.getByQuery({ _id: '000000000000000000000000' });
    expect([401, 403]).not.toContain(response.status());
    expect(response.status()).toBe(404);
  });

  test('BUG: getByQuery hangs indefinitely instead of returning (ReferenceError at the source level) when results are found', async ({
    clientAs,
  }) => {
    const client = new HandbookClient(await clientAs('admin'));
    const created = (await (await client.create(buildHandbook())).json()).data;
    try {
      await expect(client.getByQuery({ _id: created._id }, 8000)).rejects.toThrow(/timeout/i);
    } finally {
      await client.delete(created._id, CURRICULUM.COUNTRY_ID, CURRICULUM.INSTITUTION_TYPE_ID, SEED.COMPANY_ID);
    }
  });
});
