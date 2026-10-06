import { test, expect } from '../../fixtures/api.fixture';
import { InstitutionCodeClient } from '../../client/institution-code.client';
import { SEED, CURRICULUM } from '../../config/seed.constants';

// Same reasoning as hr-staff/staff-allocation.spec.ts: every test here shares the ONE real
// InstitutionCode record for the standard SEED/CURRICULUM quad (no delete route exists for
// this resource, so there is no way to give each test its own isolated record). Several
// tests temporarily flip that record's (or one of its keys') `block` state and restore it —
// confirmed live that running them in parallel (this project's default) causes genuine
// cross-test interference: `blockInstitionActiveKey`/`unBlockInstitionActiveKey`/
// `updateInstitutionActive`'s own existence check requires `block: false`, so a
// concurrently-running "block the whole institution" test spuriously fails them with "This
// institution not exists!."
test.describe.configure({ mode: 'serial' });

/**
 * institutionCode.controller.js (`InstitutionCodeController`) — activation keys, keyed by
 * company+typeOfBook+country+institutionType. All 8 routes are admin-gated in the handler
 * and `needsAuth`-protected at the route level.
 *
 * No delete route exists for this resource at all (confirmed from source and from
 * routes/v1.js — not a bug to route around, the API simply has none). A real record for the
 * standard SEED/CURRICULUM quad was created once, directly, before this spec file existed
 * (confirmed live: `createInstitutionActiveKey` has no shared-model defect, unlike
 * IASInstitution/InstitutionUser, and succeeded cleanly) — it is now permanent real test
 * data this suite reuses for every positive-case test below, the same pattern already used
 * for `CURRICULUM.LEAF_SESSION_ID`'s real pre-existing ContentPreparation data. This file
 * deliberately never attempts to create a SECOND record for the same quad (the controller's
 * own duplicate check would reject it with "This institution already have activation
 * keys!."); `block`/`unblock` are reversible and used instead for lifecycle coverage,
 * always restored to their original (unblocked) state.
 */
const QUAD = {
  companyId: SEED.COMPANY_ID,
  typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
  countryId: CURRICULUM.COUNTRY_ID,
  institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
};

test.describe('Institution — InstitutionCode', () => {
  test('create rejects a missing keyCount', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new InstitutionCodeClient(client).create(QUAD, undefined as never);
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/key count/i);
  });

  test('create rejects a nonexistent company', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new InstitutionCodeClient(client).create({ ...QUAD, companyId: '000000000000000000000000' }, 2);
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('Company not found!');
  });

  test('create rejects an anonymous request', async ({ anonClient }) => {
    const response = await new InstitutionCodeClient(anonClient).create(QUAD, 2);
    expect([401, 403]).toContain(response.status());
  });

  test('BUG: create rejects a real, already-activated quad — confirms the real record this suite reuses is still there', async ({
    clientAs,
  }) => {
    const client = await clientAs('admin');
    const response = await new InstitutionCodeClient(client).create(QUAD, 2);
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('This institution already have activation keys!.');
  });

  test('real data: get finds the real pre-existing activation keys for the standard quad', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new InstitutionCodeClient(client).get(QUAD);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.institution.activeKey.length).toBeGreaterThan(0);
  });

  test('real data: getAll finds the real pre-existing record for the standard quad', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new InstitutionCodeClient(client).getAll(QUAD);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.institution)).toBe(true);
    expect(body.institution.length).toBeGreaterThan(0);
  });

  test('get rejects a well-formed but nonexistent quad', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new InstitutionCodeClient(client).get({ ...QUAD, institutionTypeId: SEED.CONTENT_UPLOADER_USER_TYPE_ID });
    expect(response.status()).toBe(400);
  });

  test('real lifecycle: block then unblock the whole institution (record-level, not key-level), restored to its original state', async ({
    clientAs,
  }) => {
    // `getInstitionActiveyKey`'s own query never filters on `block` (confirmed from
    // source), so it keeps finding the record either way — the state change is only
    // observable via the `block` field in the returned document itself.
    const client = await clientAs('admin');
    const institutionCode = new InstitutionCodeClient(client);

    const block = await institutionCode.block(QUAD);
    expect(block.status()).toBe(200);
    try {
      const afterBlock = await (await institutionCode.get(QUAD)).json();
      expect(afterBlock.institution.block).toBe(true);
    } finally {
      const unblock = await institutionCode.unblock(QUAD);
      expect(unblock.status()).toBe(200);
    }

    const afterUnblock = await (await institutionCode.get(QUAD)).json();
    expect(afterUnblock.institution.block).toBe(false);
  });

  test('real lifecycle: block then unblock a specific real activation key, restored to its original state', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const institutionCode = new InstitutionCodeClient(client);

    const before = await (await institutionCode.get(QUAD)).json();
    const realKey = before.institution.activeKey[0].key as string;

    const block = await institutionCode.blockKey(QUAD, realKey);
    expect(block.status()).toBe(200);
    try {
      const afterBlock = await (await institutionCode.get(QUAD)).json();
      const blockedEntry = (afterBlock.institution.activeKey as Array<{ key: string; block: boolean }>).find((k) => k.key === realKey);
      expect(blockedEntry?.block).toBe(true);
    } finally {
      const unblock = await institutionCode.unblockKey(QUAD, realKey);
      expect(unblock.status()).toBe(200);
    }

    const after = await (await institutionCode.get(QUAD)).json();
    const restoredEntry = (after.institution.activeKey as Array<{ key: string; block: boolean }>).find((k) => k.key === realKey);
    expect(restoredEntry?.block).toBe(false);
  });

  test('blockKey rejects a key that does not belong to this quad', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new InstitutionCodeClient(client).blockKey(QUAD, 'NOT-A-REAL-KEY-AT-ALL');
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('Select vaild active key!.');
  });

  test('updateKeys rejects a missing keyCount', async ({ clientAs }) => {
    // NaN itself is caught by the earlier `isNull(keyCount)` check (confirmed live: this
    // codebase's `isNull` helper treats NaN as null-like), so the "Enter vaild key count!."
    // isNaN-specific message is actually unreachable for this input — testing the real
    // observed behavior instead of the one a naive source read would predict.
    const client = await clientAs('admin');
    const response = await new InstitutionCodeClient(client).updateKeys(QUAD, undefined as never);
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/key count/i);
  });
});
