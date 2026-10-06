import { test, expect } from '../../fixtures/api.fixture';
import { BaseApiClient } from '../../client/base-client';
import { StaffAllocationClient } from '../../client/staff-allocation.client';
import { SEED, CURRICULUM } from '../../config/seed.constants';
import { isActorConfigured } from '../../config/api.config';

/**
 * StaffAllocationController.js — 12 routes, all `needsAuth`, no dead code (confirmed by
 * diffing exports against routes/v1.js — every export is wired). Tagged `Staff` in swagger
 * (the `hr-staff` domain, section 2) except `GetAllContentPreparationNameByYear`, tagged
 * `Content` — first touched in sections 15/16 purely as a `dairy`/`planning` test-data
 * probe for the `StaffAllocationContentPreparationId`/`StaffAllocationContentUploadingId`
 * join fields `createPlanningPreparation` never writes (confirmed dead there) but
 * `createPlanningUploading` does. This is the domain's own dedicated pass.
 *
 * Unlike every other domain's spec files, this whole file runs serially (see the
 * `test.describe.configure` below), not in parallel: every real-data test shares the same
 * two ingredients (the `contentUploader` actor and the one real, linear curriculum chain
 * this bench has verified) because StaffAllocation's own read endpoints are intentionally
 * coarse — `getAll`/`getAllForSelf` return every allocation for an assignee regardless of
 * which variable it's under, and the "already allocated" duplicate check is a `$elemMatch`
 * against the WHOLE `variableDetails` array, not just its trailing element. Confirmed live:
 * running this file's tests in parallel (this project's default) caused real cross-test
 * interference — one test's indiscriminate `getAll`-then-delete-everything cleanup raced
 * with and deleted another's still-in-use record, and `getByVariable`/`getAll` queries
 * sometimes picked up a concurrently-live record from a different test. Serial execution
 * was simpler and more reliable than trying to carve out disjoint data for every test from
 * a single real, sibling-free chain.
 *
 * BUG ($nin-excludes-self, confirmed live — same class as sections 15-17's other 7
 * instances, now 9 total across the codebase): both `deleteStaffAllocationContentPreparation`
 * and `deleteStaffAllocationContentUploading`'s existence check excludes the CALLER's own
 * usertype (`User.findOne({ userTypeId: { $nin: user.userTypeId }, _id: contentDeveloperId
 * })`), so an Admin can never delete their own self-allocated StaffAllocation record — and
 * since both routes are ALSO admin-gated (confirmed live), there is NO way for anyone to
 * delete a self-admin-assigned StaffAllocation record via this API. A real stray record
 * from this exact scenario, created while probing section 16's dairy/planning work (`_id:
 * 6ac0b01990d62220747078b7`, contentDeveloperId = the admin account), remains permanently
 * undeletable in the dev DB — confirmed again live this session. Tests below use a
 * placeholder id for this bug (the $nin check runs before the record-existence check, so no
 * new stray data needs to be created to prove it).
 *
 * NOT a bug (confirmed live, correcting an initial suspicion from static reading):
 * `getAllStaffAllocationContentPreparationByVariable`'s `variableDetails[findVariableIndex +
 * 1].variableId` access looked like it could throw (array out-of-bounds) when queried by
 * the LAST/leaf element of a short `variableDetails` chain — but unlike the hang-class bugs
 * documented in sections 11/14-17, this function's `ReS(...)` call is OUTSIDE and
 * unconditional after the `.map(async ...)` loop, not inside it gated on reaching the last
 * iteration. An exception inside the callback becomes an unhandled rejection that nobody
 * awaits, but the surrounding function keeps running and still responds — confirmed live:
 * querying by the leaf variable just returns `variable: []}`, no hang. The Uploading-side
 * sibling additionally guards this specific access with `?.` (optional chaining) — a real,
 * harmless defensive difference, not a functional one given the above.
 *
 * Minor: both `*ByFirstVariable`/`*ByVariable` getters build `code:
 * \`${req.params.code}${data.code}\`` — `:code` is not a route param on either controller,
 * so this is always `"undefined" + data.code` (e.g. `"undefinedA"`), confirmed live — a
 * cosmetic bug, not a functional one.
 *
 * `getAllStaffAllocatedContentUploading` (the Uploading-only self report, no Preparation
 * equivalent) silently drops every real row unless `variableDetails` has >= 3 levels: its
 * "unique by bookId" dedup only ever sets `bookId` at loop index `variableDetails.length -
 * 3`, so with this suite's usual 2-element chain that index is negative, `bookId` stays
 * `undefined` for every record, and `item[prop] && acc.set(...)` silently filters
 * everything out — `allocatedContent` comes back `[]` regardless of how much real data
 * exists. Confirmed live; fixed in the dedicated test below by using the real 4-level chain
 * discovered in section 17 (`CURRICULUM.LEAF_SESSION_ID`).
 */
test.describe.configure({ mode: 'serial' });

async function getSelfId(client: BaseApiClient): Promise<string> {
  const body = await (await client.get('/v1/user/profile')).json();
  return body.user._id;
}

function buildAllocation(contentDeveloperId: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    companyId: SEED.COMPANY_ID,
    typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
    countryId: CURRICULUM.COUNTRY_ID,
    institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
    attributeId: CURRICULUM.ATTRIBUTE_ID,
    tierDetails: [{ tierId: CURRICULUM.TIER_2_ID }],
    variableDetails: [{ variableId: CURRICULUM.TOP_VARIABLE_ID }, { variableId: CURRICULUM.UNIT_ID }],
    contentDeveloperId,
    ...overrides,
  };
}

for (const variant of ['preparation', 'uploading'] as const) {
  test.describe(`Hr-staff — StaffAllocation (${variant})`, () => {
    test('create rejects an invalid companyId', async ({ clientAs }) => {
      const client = await clientAs('admin');
      const selfId = await getSelfId(client);
      const response = await new StaffAllocationClient(client, variant).create(
        buildAllocation(selfId, { companyId: '000000000000000000000000' }),
      );
      expect(response.status()).toBe(400);
      expect((await response.json()).error).toMatch(/company/i);
    });

    test('create rejects a missing variableDetails', async ({ clientAs }) => {
      const client = await clientAs('admin');
      const selfId = await getSelfId(client);
      const response = await new StaffAllocationClient(client, variant).create(
        buildAllocation(selfId, { variableDetails: undefined }),
      );
      expect(response.status()).toBe(400);
      expect((await response.json()).error).toMatch(/variable/i);
    });

    test('create rejects an anonymous request', async ({ anonClient }) => {
      const response = await new StaffAllocationClient(anonClient, variant).create(
        buildAllocation('000000000000000000000000'),
      );
      expect([401, 403]).toContain(response.status());
    });

    test('real lifecycle: create assigned to the contentUploader actor, found via getAll/getByFirstVariable/getByVariable, admin cleans up', async ({
      clientAs,
    }) => {
      test.skip(!isActorConfigured('contentUploader'), 'CONTENT_UPLOADER_USERNAME/PASSWORD not set — run `npm run bootstrap:content-uploader`.');
      const admin = await clientAs('admin');
      const uploader = await clientAs('contentUploader');
      const assigneeId = await getSelfId(uploader);
      const client = new StaffAllocationClient(admin, variant);

      const create = await client.create(buildAllocation(assigneeId));
      expect(create.status()).toBe(200);

      const params = {
        companyId: SEED.COMPANY_ID,
        typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
        countryId: CURRICULUM.COUNTRY_ID,
        institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
        attributeId: CURRICULUM.ATTRIBUTE_ID,
        contentDeveloperId: assigneeId,
      };

      try {
        const getAll = await client.getAll(params);
        expect(getAll.status()).toBe(200);
        const allBody = await getAll.json();
        const allocation = (allBody.staffAllocationsContents as Array<{ _id: string }>)[0];
        expect(allocation).toBeTruthy();

        const byFirstVariable = await client.getByFirstVariable(params);
        expect(byFirstVariable.status()).toBe(200);
        const firstBody = await byFirstVariable.json();
        expect((firstBody.variable as unknown[]).length).toBeGreaterThan(0);

        const byVariable = await client.getByVariable(params, CURRICULUM.TOP_VARIABLE_ID);
        expect(byVariable.status()).toBe(200);
        const byVarBody = await byVariable.json();
        // Confirmed live: the leaf-element case returns an empty array cleanly, not a hang —
        // see top-of-file note. Querying by the first element finds the real next level.
        expect((byVarBody.variable as unknown[]).length).toBeGreaterThan(0);

        const byVariableLeaf = await client.getByVariable(params, CURRICULUM.UNIT_ID);
        expect(byVariableLeaf.status()).toBe(200);
        expect((await byVariableLeaf.json()).variable).toEqual([]);

        await client.delete(assigneeId, allocation._id); // admin deleting a different-usertype assignee — not blocked by the $nin bug
      } finally {
        // best-effort: if the test failed before the explicit delete above, still try to clean up
        const allBody = await (await client.getAll(params)).json().catch(() => ({ staffAllocationsContents: [] }));
        const remaining = (allBody.staffAllocationsContents as Array<{ _id: string }> | undefined) ?? [];
        for (const a of remaining) await client.delete(assigneeId, a._id).catch(() => undefined);
      }
    });

    test('create rejects a duplicate allocation for the same assignee/variable', async ({ clientAs }) => {
      test.skip(!isActorConfigured('contentUploader'), 'CONTENT_UPLOADER_USERNAME/PASSWORD not set — run `npm run bootstrap:content-uploader`.');
      const admin = await clientAs('admin');
      const uploader = await clientAs('contentUploader');
      const assigneeId = await getSelfId(uploader);
      const client = new StaffAllocationClient(admin, variant);

      const create = await client.create(buildAllocation(assigneeId));
      expect(create.status()).toBe(200);

      try {
        const duplicate = await client.create(buildAllocation(assigneeId));
        expect(duplicate.status()).toBe(400);
        expect((await duplicate.json()).error).toMatch(/already allocated/i);
      } finally {
        const params = {
          companyId: SEED.COMPANY_ID,
          typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
          countryId: CURRICULUM.COUNTRY_ID,
          institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
          attributeId: CURRICULUM.ATTRIBUTE_ID,
          contentDeveloperId: assigneeId,
        };
        const allBody = await (await client.getAll(params)).json().catch(() => ({ staffAllocationsContents: [] }));
        const remaining = (allBody.staffAllocationsContents as Array<{ _id: string }> | undefined) ?? [];
        for (const a of remaining) await client.delete(assigneeId, a._id).catch(() => undefined);
      }
    });

    test('BUG: delete cannot be used by an Admin to remove their own self-allocated record', async ({ clientAs }) => {
      const client = await clientAs('admin');
      const selfId = await getSelfId(client);
      const response = await new StaffAllocationClient(client, variant).delete(selfId, '000000000000000000000000');
      expect(response.status()).toBe(400);
      expect((await response.json()).error).toBe('User was not found!.');
    });

    test('delete rejects a non-Admin caller', async ({ clientAs }) => {
      test.skip(!isActorConfigured('contentUploader'), 'CONTENT_UPLOADER_USERNAME/PASSWORD not set — run `npm run bootstrap:content-uploader`.');
      const client = await clientAs('contentUploader');
      const response = await new StaffAllocationClient(client, variant).delete('000000000000000000000000', '000000000000000000000000');
      expect(response.status()).toBe(400);
      expect((await response.json()).error).toMatch(/admin/i);
    });

    test('getByVariable rejects a malformed variableId', async ({ clientAs }) => {
      const client = await clientAs('admin');
      const selfId = await getSelfId(client);
      const response = await new StaffAllocationClient(client, variant).getByVariable(
        {
          companyId: SEED.COMPANY_ID,
          typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
          countryId: CURRICULUM.COUNTRY_ID,
          institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
          attributeId: CURRICULUM.ATTRIBUTE_ID,
          contentDeveloperId: selfId,
        },
        'not-an-object-id',
      );
      expect(response.status()).toBe(400);
    });
  });
}

test.describe('Hr-staff — StaffAllocation (uploading-only self report)', () => {
  test('getAllForSelf (no Preparation-side equivalent exists) returns real data for the contentUploader actor', async ({ clientAs }) => {
    // Needs a >=3-level variableDetails chain: `getAllStaffAllocatedContentUploading`'s own
    // "unique by bookId" dedup step only ever sets `bookId` at loop index `length - 3`
    // (dairyuploading-style 3-levels-from-the-end indexing, confirmed live) — with our usual
    // 2-element chain that index is negative and `bookId` stays undefined for every record,
    // so `uniqByProp_map("bookId")`'s `item[prop] && acc.set(...)` guard silently drops every
    // row and the response is always `allocatedContent: []` regardless of real data. Not a
    // hang or a dead feature like section 16/17's findings — just needs the real 4-level
    // chain discovered in section 17 (`CURRICULUM.LEAF_SESSION_ID`).
    test.skip(!isActorConfigured('contentUploader'), 'CONTENT_UPLOADER_USERNAME/PASSWORD not set — run `npm run bootstrap:content-uploader`.');
    const admin = await clientAs('admin');
    const uploader = await clientAs('contentUploader');
    const assigneeId = await getSelfId(uploader);
    const client = new StaffAllocationClient(admin, 'uploading');

    const create = await client.create(
      buildAllocation(assigneeId, {
        variableDetails: [
          { variableId: CURRICULUM.TOP_VARIABLE_ID },
          { variableId: CURRICULUM.UNIT_ID },
          { variableId: CURRICULUM.SESSION_ID },
          { variableId: CURRICULUM.LEAF_SESSION_ID },
        ],
      }),
    );
    expect(create.status()).toBe(200);

    const params = {
      companyId: SEED.COMPANY_ID,
      typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
      countryId: CURRICULUM.COUNTRY_ID,
      institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
      attributeId: CURRICULUM.ATTRIBUTE_ID,
      contentDeveloperId: assigneeId,
    };

    try {
      const response = await new StaffAllocationClient(uploader, 'uploading').getAllForSelf(SEED.COMPANY_ID);
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect((body.allocatedContent as unknown[]).length).toBeGreaterThan(0);
    } finally {
      const allBody = await (await client.getAll(params)).json().catch(() => ({ staffAllocationsContents: [] }));
      const remaining = (allBody.staffAllocationsContents as Array<{ _id: string }> | undefined) ?? [];
      for (const a of remaining) await client.delete(assigneeId, a._id).catch(() => undefined);
    }
  });

  test('BUG: getAllForSelf explicitly rejects an Admin caller even with a well-formed companyId', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new StaffAllocationClient(client, 'uploading').getAllForSelf(SEED.COMPANY_ID);
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/admin/i);
  });

  test('getAllForSelf rejects an anonymous request', async ({ anonClient }) => {
    const response = await new StaffAllocationClient(anonClient, 'uploading').getAllForSelf(SEED.COMPANY_ID);
    expect([401, 403]).toContain(response.status());
  });
});

test.describe('Hr-staff — GetAllContentPreparationNameByYear', () => {
  test('returns real pre-existing PlanningPreparation activity data for a real variable', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await StaffAllocationClient.getContentPreparationNameByYear(client, CURRICULUM.LEAF_SESSION_ID);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.contentPreparationName)).toBe(true);
    expect(body.contentPreparationName.length).toBeGreaterThan(0);
  });

  test('returns 400 for a well-formed but nonexistent variableId', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await StaffAllocationClient.getContentPreparationNameByYear(client, '000000000000000000000000');
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/variable/i);
  });

  test('rejects an anonymous request', async ({ anonClient }) => {
    const response = await StaffAllocationClient.getContentPreparationNameByYear(anonClient, CURRICULUM.LEAF_SESSION_ID);
    expect([401, 403]).toContain(response.status());
  });
});
