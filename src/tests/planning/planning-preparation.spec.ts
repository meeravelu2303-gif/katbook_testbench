import { test, expect } from '../../fixtures/api.fixture';
import { BaseApiClient } from '../../client/base-client';
import { PlanningPreparationClient, PlanningActivityItem } from '../../client/planning-preparation.client';
import { ContentPreparationClient } from '../../client/content-preparation.client';
import { SEED, CURRICULUM } from '../../config/seed.constants';
import { baseFactory } from '../../factories/base.factory';
import { isActorConfigured } from '../../config/api.config';

test.describe.configure({ mode: 'parallel' });

/**
 * PlanningPreparation.controller.js — 9 routes, all `needsAuth`, backing the
 * `PlanningPreparation` collection `dairy`'s self-scoped reports already read from
 * (sections 15-16). This is the domain's own dedicated pass, now that `dairy` is complete
 * and this controller's shape is already well understood from seeding its test data.
 *
 * BUG (confirmed live via raw curl, independent of Playwright — 16th codebase-wide hang,
 * documented first in dairy-preparation.spec.ts, authoritative home here): `createPlanningPreparation`'s
 * early existence checks read `tierDetails.tierId`/`variableDetails.variableId` (singular,
 * always undefined for a real array payload, silently bypassed via the `new
 * ObjectId(undefined)` -> random-id mongodb-driver quirk). Its real prerequisite —
 * `variableDetails[length-1]`/`[length-2]` must form a genuine parent-child Variable pair —
 * only surfaces later. A single-element `variableDetails` array passes every early check,
 * then throws (`variableDetails[-1]` is undefined) inside an un-awaited `.map(async ...)`
 * callback with no catch — the exception is swallowed, no response is ever sent, and the
 * request hangs until client timeout.
 *
 * BUG (confirmed live, new — 18th codebase-wide hang): `getAllPlanningPreparationByActivities`
 * (`PUT /planning/content/preparation/get/activity/...`) has no response path at all when
 * `req.body.activityId` is well-formed but matches zero real records — the function just
 * ends after its `for` loop, and `if (planningUploadingDatas.length > 0)` is the only return
 * statement. Hangs until client timeout for any non-matching (but validly-shaped) activity list.
 *
 * BUG (confirmed live, new — 19th codebase-wide hang): `createPlanningPreparation` with an
 * EMPTY `data` array (`{"data": []}`) also hangs — `isNull([])` is false, so the early guard
 * never fires, and `.map(async ...)` on an empty array runs zero iterations, so none of the
 * loop body's `ReS`/`ReE` calls (the only place this function ever responds) ever execute.
 *
 * BUG (confirmed live, data-model/structural, same class as dairy's confirmed-dead
 * `StaffAllocationContentPreparationId` finding — sections 15/16): `getSelfPlanningPreparationByDate`
 * can never return real data for ANY record. Two independent, compounding causes: (1)
 * `createPlanningPreparation`'s `save()` hardcodes `lsd: null, lfd: null` regardless of the
 * submitted (required, validated!) `lsd`/`lfd` fields — confirmed live via `getByUser`
 * immediately after creation. (2) Even if `lfd` were populated, the function's own "today"
 * window is degenerate: `toUTCStart`/`toUTCEnd` (`services/util.service.js:109-117`) do NOT
 * compute start/end-of-day despite their names — they're identity conversions to UTC. Called
 * on two separate back-to-back `moment()` calls, `formDate` and `toDate` end up practically
 * equal to "right now", and `'lfd': {$gte: formDate, $lt: toDate}` can never contain any real
 * timestamp. This is the same root-cause pattern (`toUTCStart`/`toUTCEnd` applied to
 * `moment().format()` twice) used by several of `dairy`'s "Today"/"Monthly"/"Weekly" Self
 * report functions (section 15) — those were only ever regression-tested against their
 * trivial empty-result case, never a real positive match, so this likely affects them too;
 * flagged here as a correction to revisit, not re-verified against every one individually.
 *
 * BUG ($nin-excludes-self, confirmed live — same class as section 15/16's `createPlanningUploading`
 * and `deleteStaffAllocationContentPreparation` bugs, now 5 total instances across the
 * codebase): `reSechuldingPreparation`'s existence check, when the caller is an Admin, is
 * `User.findOne({ userTypeId: { $nin: user.userTypeId }, _id: contentDeveloperId, ... })` —
 * excludes the Admin's OWN usertype, so an Admin can never reschedule their own self-assigned
 * PlanningPreparation record (confirmed: "User was not found!." for an otherwise valid
 * payload). Unlike `createPlanningPreparation` (no such exclusion, self-assign works fine),
 * this is an inconsistency WITHIN the same controller, not just between Preparation/Uploading.
 * Worked around below by rescheduling a record assigned to the `contentUploader` actor
 * instead (a different usertype than Admin, so the `$nin` doesn't exclude it).
 *
 * Minor: `deletePlanningPreparationByadmin` has its admin-code gate commented out — ANY
 * authenticated user can delete ANY company's PlanningPreparation record, not just their own
 * (matches this test bench's own reliance on it for unrestricted cleanup throughout this
 * project) — and has a leftover `console.log` debug statement, same minor-finding class as
 * management-planning's (section 9).
 *
 * Asymmetry: Preparation has 9 live routes (`getAllSelectedContentPreparationActivities` has
 * no Uploading equivalent — confirmed, Uploading's controller has no matching function at
 * all, not just an unwired route) vs. Uploading's 8 — see `planning-uploading.spec.ts`.
 */
function buildItem(overrides: Partial<PlanningActivityItem> = {}): PlanningActivityItem {
  const today = new Date().toISOString().slice(0, 10);
  return {
    companyId: SEED.COMPANY_ID,
    typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
    countryId: CURRICULUM.COUNTRY_ID,
    institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
    attributeId: CURRICULUM.ATTRIBUTE_ID,
    tierDetails: [{ tierId: CURRICULUM.TIER_2_ID }],
    variableDetails: [{ variableId: CURRICULUM.TOP_VARIABLE_ID }, { variableId: CURRICULUM.UNIT_ID }],
    assigneeId: SEED.COMPANY_ID, // caller must override — no sane default for a required real user id
    selectedActivities: [],
    duration: 5,
    delay: 0,
    esd: today,
    efd: today,
    lsd: today,
    lfd: today,
    sequenceNo: 1,
    ...overrides,
  };
}

async function getSelfId(client: BaseApiClient): Promise<string> {
  const body = await (await client.get('/v1/user/profile')).json();
  return body.user._id;
}

async function seedActivity(client: BaseApiClient, tag: string): Promise<string> {
  const contentPrep = new ContentPreparationClient(client, 'preparation');
  const create = await contentPrep.create({ companyId: SEED.COMPANY_ID, name: `${tag}-activity`, isRework: false });
  expect(create.status()).toBe(200);
  const all = await (await contentPrep.getAllByCompany(SEED.COMPANY_ID)).json();
  const activity = (all.data as Array<{ _id: string; contentPreparationName: string }>).find(
    (a) => a.contentPreparationName === `${tag}-activity`,
  );
  if (!activity) throw new Error('seeded ContentPreparation activity not found');
  return activity._id;
}

async function deleteActivity(client: BaseApiClient, activityId: string): Promise<void> {
  await new ContentPreparationClient(client, 'preparation').delete(SEED.COMPANY_ID, activityId).catch(() => undefined);
}

test.describe('Planning — PlanningPreparation', () => {
  test('BUG: create hangs indefinitely on an empty data array (confirmed live via raw curl, independent of Playwright)', async ({
    clientAs,
  }) => {
    // isNull([]) is false (an empty array is "defined"), so the early guard never fires;
    // `data.map(async ...)` on an empty array runs zero iterations, so none of the ReS/ReE
    // calls inside the loop body ever execute — no response is ever sent. Same root cause
    // (the loop body is the only place that calls res.json()) as the single-element hang
    // below, triggered a different way. 19th confirmed hang codebase-wide.
    const client = await clientAs('admin');
    await expect(
      Promise.race([
        new PlanningPreparationClient(client, 'preparation').create([]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout waiting for response')), 8000)),
      ]),
    ).rejects.toThrow(/timeout/i);
  });

  test('create rejects an invalid companyId', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const selfId = await getSelfId(client);
    const response = await new PlanningPreparationClient(client, 'preparation').create([
      buildItem({ companyId: '000000000000000000000000', assigneeId: selfId, selectedActivities: ['000000000000000000000000'] }),
    ]);
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/company/i);
  });

  test('BUG: create hangs indefinitely on a single-element variableDetails array', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const selfId = await getSelfId(client);
    await expect(
      Promise.race([
        new PlanningPreparationClient(client, 'preparation').create([
          buildItem({
            variableDetails: [{ variableId: CURRICULUM.TOP_VARIABLE_ID }],
            assigneeId: selfId,
            selectedActivities: ['000000000000000000000000'],
          }),
        ]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout waiting for response')), 8000)),
      ]),
    ).rejects.toThrow(/timeout/i);
  });

  test('real lifecycle: create self-assigned, find via getByUser, clean up', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const selfId = await getSelfId(client);
    const tag = baseFactory.testTag();
    const activityId = await seedActivity(client, tag);
    const planningClient = new PlanningPreparationClient(client, 'preparation');

    const create = await planningClient.create([buildItem({ assigneeId: selfId, selectedActivities: [activityId] })]);
    expect(create.status()).toBe(200);

    const params = {
      companyId: SEED.COMPANY_ID,
      typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
      countryId: CURRICULUM.COUNTRY_ID,
      institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
      attributeId: CURRICULUM.ATTRIBUTE_ID,
      assigneeId: selfId,
      variableId: CURRICULUM.UNIT_ID,
    };

    const byUser = await (await planningClient.getByUser(params)).json();
    const found = (byUser.selectedActivities as Array<{ _id: string; selectedActivities: { _id: string }; lfd: string | null }>).find(
      (p) => p.selectedActivities._id === activityId,
    );
    if (!found) throw new Error('seeded record not found via getByUser');

    // Confirmed live: createPlanningPreparation's own save() hardcodes `lsd: null, lfd: null`
    // regardless of the (required, validated) lsd/lfd request fields — they're silently
    // discarded at creation. See the dedicated BUG test below for the consequence.
    expect(found.lfd).toBeFalsy();

    await planningClient.delete(found._id).catch(() => undefined);
    await deleteActivity(client, activityId);
  });

  test('BUG: getSelfPlanningPreparationByDate can never return real "today" data — its date window is degenerate', async ({
    clientAs,
  }) => {
    // Confirmed live (via getByUser immediately above and a separate raw-curl check): a
    // freshly created record's `lfd` is always null (createPlanningPreparation hardcodes
    // `lsd: null, lfd: null` on save, ignoring the submitted values). Independent of that,
    // `getSelfPlanningPreparationByDate`'s own window is structurally broken: `toUTCStart`/
    // `toUTCEnd` (util.service.js:109-117) do NOT compute start/end-of-day despite the
    // names — they just convert the given moment to UTC, unchanged. Called here on two
    // separate `moment()` calls a few microseconds apart, `formDate` and `toDate` end up
    // effectively equal to "right now", and the query is `'lfd': {$gte: formDate, $lt:
    // toDate}` — a `$gte`/$lt` range on two near-identical timestamps can never contain any
    // real value. Even if `lfd` were populated (e.g. via `reschedule`), this endpoint could
    // still only ever return empty. Regression-tested here rather than asserting success.
    const client = await clientAs('admin');
    const selfId = await getSelfId(client);
    const tag = baseFactory.testTag();
    const activityId = await seedActivity(client, tag);
    const planningClient = new PlanningPreparationClient(client, 'preparation');

    const create = await planningClient.create([buildItem({ assigneeId: selfId, selectedActivities: [activityId] })]);
    expect(create.status()).toBe(200);

    const params = {
      companyId: SEED.COMPANY_ID,
      typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
      countryId: CURRICULUM.COUNTRY_ID,
      institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
      attributeId: CURRICULUM.ATTRIBUTE_ID,
      assigneeId: selfId,
      variableId: CURRICULUM.UNIT_ID,
    };
    const byUser = await (await planningClient.getByUser(params)).json();
    const found = (byUser.selectedActivities as Array<{ _id: string; selectedActivities: { _id: string } }>).find(
      (p) => p.selectedActivities._id === activityId,
    );
    if (!found) throw new Error('seeded record not found via getByUser');

    try {
      const response = await planningClient.getSelfByDateToday(params);
      expect(response.status()).toBe(400);
      expect((await response.json()).error).toMatch(/empty/i);
    } finally {
      await planningClient.delete(found._id).catch(() => undefined);
      await deleteActivity(client, activityId);
    }
  });

  test('delete rejects a malformed id', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new PlanningPreparationClient(client, 'preparation').delete('not-an-object-id');
    expect(response.status()).toBe(400);
  });

  test('delete rejects a well-formed but nonexistent id', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new PlanningPreparationClient(client, 'preparation').delete('000000000000000000000000');
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/not found/i);
  });

  test('delete rejects an anonymous request', async ({ anonClient }) => {
    const response = await new PlanningPreparationClient(anonClient, 'preparation').delete('000000000000000000000000');
    expect([401, 403]).toContain(response.status());
  });

  test('BUG: reschedule cannot be self-assigned by an Admin even with a fully valid payload', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const selfId = await getSelfId(client);
    const response = await new PlanningPreparationClient(client, 'preparation').reschedule({
      planningId: '000000000000000000000000',
      assigneeId: selfId,
      companyId: SEED.COMPANY_ID,
      typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
      countryId: CURRICULUM.COUNTRY_ID,
      institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
      duration: 5,
      delay: 0,
      esd: '2026-10-05',
      efd: '2026-10-05',
      lsd: '2026-10-05',
      lfd: '2026-10-05',
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('User was not found!.');
  });

  test('real reschedule lifecycle (assigned to the contentUploader actor, sidestepping the Admin self-exclusion bug)', async ({
    clientAs,
  }) => {
    test.skip(!isActorConfigured('contentUploader'), 'CONTENT_UPLOADER_USERNAME/PASSWORD not set — run `npm run bootstrap:content-uploader`.');
    const admin = await clientAs('admin');
    const uploader = await clientAs('contentUploader');
    const assigneeId = await getSelfId(uploader);
    const tag = baseFactory.testTag();
    const activityId = await seedActivity(admin, tag);
    const planningClient = new PlanningPreparationClient(admin, 'preparation');

    const create = await planningClient.create([buildItem({ assigneeId, selectedActivities: [activityId] })]);
    expect(create.status()).toBe(200);

    const params = {
      companyId: SEED.COMPANY_ID,
      typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
      countryId: CURRICULUM.COUNTRY_ID,
      institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
      attributeId: CURRICULUM.ATTRIBUTE_ID,
      assigneeId,
      variableId: CURRICULUM.UNIT_ID,
    };
    const byUser = await (await planningClient.getByUser(params)).json();
    const found = (byUser.selectedActivities as Array<{ _id: string; selectedActivities: { _id: string } }>).find(
      (p) => p.selectedActivities._id === activityId,
    );
    if (!found) throw new Error('seeded record not found via getByUser');

    try {
      const reschedule = await planningClient.reschedule({
        planningId: found._id,
        assigneeId,
        companyId: SEED.COMPANY_ID,
        typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
        countryId: CURRICULUM.COUNTRY_ID,
        institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
        duration: 9,
        delay: 1,
        esd: '2026-11-01',
        efd: '2026-11-01',
        lsd: '2026-11-01',
        lfd: '2026-11-01',
      });
      expect(reschedule.status()).toBe(200);
      expect((await reschedule.json()).message).toBe('Plannning content selected activities was re-sechulded!.');

      const afterReschedule = await (await planningClient.getByUser(params)).json();
      const updated = (afterReschedule.selectedActivities as Array<{ _id: string; duration: number }>).find((p) => p._id === found._id);
      expect(updated?.duration).toBe(9);
    } finally {
      await planningClient.delete(found._id).catch(() => undefined);
      await deleteActivity(admin, activityId);
    }
  });

  test('getAllUnselectedContentPreparationActivities returns real pre-existing activity data for a real session-level variable', async ({
    clientAs,
  }) => {
    // CURRICULUM.SESSION_ID ("Introduction") itself lacks `sessionCode` and 400s here —
    // confirmed live. CURRICULUM.LEAF_SESSION_ID (its real child, "Rediscovering India") is
    // the only node in the chain confirmed to have it set, and this company already has real
    // pre-existing ContentPreparation activity data against it from before this test bench
    // existed — a good real-data smoke check independent of anything this suite seeds.
    const client = await clientAs('admin');
    const selfId = await getSelfId(client);
    const response = await new PlanningPreparationClient(client, 'preparation').getAllUnselectedActivities(selfId, CURRICULUM.LEAF_SESSION_ID);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.contentPreparation)).toBe(true);
    expect(body.contentPreparation.length).toBeGreaterThan(0);
  });

  test('getAllUnselectedContentPreparationActivities rejects a variable with no sessionCode', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const selfId = await getSelfId(client);
    const response = await new PlanningPreparationClient(client, 'preparation').getAllUnselectedActivities(selfId, CURRICULUM.SESSION_ID);
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('Variable was not found!.');
  });

  test('real lifecycle: getAllSelectedContentPreparationActivities finds a just-created activity at the 4-level leaf variable', async ({
    clientAs,
  }) => {
    const client = await clientAs('admin');
    const selfId = await getSelfId(client);
    const tag = baseFactory.testTag();
    const activityId = await seedActivity(client, tag);
    const planningClient = new PlanningPreparationClient(client, 'preparation');

    const create = await planningClient.create([
      buildItem({
        variableDetails: [
          { variableId: CURRICULUM.TOP_VARIABLE_ID },
          { variableId: CURRICULUM.UNIT_ID },
          { variableId: CURRICULUM.SESSION_ID },
          { variableId: CURRICULUM.LEAF_SESSION_ID },
        ],
        assigneeId: selfId,
        selectedActivities: [activityId],
      }),
    ]);
    expect(create.status()).toBe(200);

    const byUser = await (
      await planningClient.getByUser({
        companyId: SEED.COMPANY_ID,
        typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
        countryId: CURRICULUM.COUNTRY_ID,
        institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
        attributeId: CURRICULUM.ATTRIBUTE_ID,
        assigneeId: selfId,
        variableId: CURRICULUM.LEAF_SESSION_ID,
      })
    ).json();
    const found = (byUser.selectedActivities as Array<{ _id: string; selectedActivities: { _id: string } }>).find(
      (p) => p.selectedActivities._id === activityId,
    );
    if (!found) throw new Error('seeded 4-level record not found via getByUser');

    try {
      const selected = await (
        await planningClient.getAllSelectedActivities(selfId, CURRICULUM.LEAF_SESSION_ID, found._id)
      ).json();
      expect(Array.isArray(selected.selectedActivities)).toBe(true);
      const match = (selected.selectedActivities as Array<{ _id: string }>).find((a) => a._id === activityId);
      expect(match).toBeTruthy();
    } finally {
      await planningClient.delete(found._id).catch(() => undefined);
      await deleteActivity(client, activityId);
    }
  });

  test('real lifecycle: getByActivities finds a just-created record by its real selectedActivities id', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const selfId = await getSelfId(client);
    const tag = baseFactory.testTag();
    const activityId = await seedActivity(client, tag);
    const planningClient = new PlanningPreparationClient(client, 'preparation');

    const create = await planningClient.create([buildItem({ assigneeId: selfId, selectedActivities: [activityId] })]);
    expect(create.status()).toBe(200);

    const params = {
      companyId: SEED.COMPANY_ID,
      typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
      countryId: CURRICULUM.COUNTRY_ID,
      institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
      attributeId: CURRICULUM.ATTRIBUTE_ID,
      assigneeId: selfId,
      variableId: CURRICULUM.UNIT_ID,
    };
    const byUser = await (await planningClient.getByUser(params)).json();
    const found = (byUser.selectedActivities as Array<{ _id: string; selectedActivities: { _id: string } }>).find(
      (p) => p.selectedActivities._id === activityId,
    );
    if (!found) throw new Error('seeded record not found via getByUser');

    try {
      const response = await planningClient.getByActivities(params, [activityId]);
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect((body.selectedActivities as Array<{ _id: string }>).some((p) => p._id === found._id)).toBe(true);
    } finally {
      await planningClient.delete(found._id).catch(() => undefined);
      await deleteActivity(client, activityId);
    }
  });

  test('BUG: getByActivities hangs indefinitely for a well-formed but non-matching activity id', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const selfId = await getSelfId(client);
    const planningClient = new PlanningPreparationClient(client, 'preparation');
    await expect(
      Promise.race([
        planningClient.getByActivities(
          {
            companyId: SEED.COMPANY_ID,
            typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
            countryId: CURRICULUM.COUNTRY_ID,
            institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
            attributeId: CURRICULUM.ATTRIBUTE_ID,
            assigneeId: selfId,
            variableId: CURRICULUM.UNIT_ID,
          },
          ['000000000000000000000000'],
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout waiting for response')), 8000)),
      ]),
    ).rejects.toThrow(/timeout/i);
  });

  test('real lifecycle: getBySessionId finds a just-created record', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const selfId = await getSelfId(client);
    const tag = baseFactory.testTag();
    const activityId = await seedActivity(client, tag);
    const planningClient = new PlanningPreparationClient(client, 'preparation');

    const create = await planningClient.create([buildItem({ assigneeId: selfId, selectedActivities: [activityId] })]);
    expect(create.status()).toBe(200);

    try {
      const response = await planningClient.getBySessionId(selfId, CURRICULUM.UNIT_ID);
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
    } finally {
      const byUser = await (
        await planningClient.getByUser({
          companyId: SEED.COMPANY_ID,
          typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
          countryId: CURRICULUM.COUNTRY_ID,
          institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
          attributeId: CURRICULUM.ATTRIBUTE_ID,
          assigneeId: selfId,
          variableId: CURRICULUM.UNIT_ID,
        })
      ).json();
      const found = (byUser.selectedActivities as Array<{ _id: string; selectedActivities: { _id: string } }>).find(
        (p) => p.selectedActivities._id === activityId,
      );
      if (found) await planningClient.delete(found._id).catch(() => undefined);
      await deleteActivity(client, activityId);
    }
  });

  test('getBySessionId rejects a malformed session id', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const selfId = await getSelfId(client);
    const response = await new PlanningPreparationClient(client, 'preparation').getBySessionId(selfId, 'not-an-object-id');
    expect(response.status()).toBe(400);
  });
});
