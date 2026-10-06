import { test, expect } from '../../fixtures/api.fixture';
import { BaseApiClient } from '../../client/base-client';
import { PlanningPreparationClient, PlanningActivityItem } from '../../client/planning-preparation.client';
import { ContentPreparationClient } from '../../client/content-preparation.client';
import { SEED, CURRICULUM } from '../../config/seed.constants';
import { baseFactory } from '../../factories/base.factory';
import { isActorConfigured } from '../../config/api.config';

test.describe.configure({ mode: 'parallel' });

/**
 * PlanningUploading.controller.js — 8 routes, all `needsAuth`. The structural mirror of
 * `planning-preparation.spec.ts`'s controller, with real differences (not just naming):
 *
 * 1. No `getAllSelectedContentUploadingActivities` equivalent exists at all — Preparation's
 *    9th route (`getAllSelectedContentPreparationActivities`) has no Uploading sibling,
 *    confirmed by diffing both controllers' exports, not just their routes.
 * 2. `createPlanningUploading` uses a real sequential `for` loop (fully awaited), unlike
 *    Preparation's buggy `.map(async ...)` — but it STILL hangs on the same inputs,
 *    confirmed live, just via a different mechanism: a single-element `variableDetails`
 *    array makes `variableDetails[length-2].variableId` throw synchronously inside the
 *    `for` loop body (not inside an unawaited callback this time), and an empty `data` array
 *    makes the loop run zero iterations — either way, the only `ReS`/`ReE` calls in this
 *    function live inside the loop body, so neither case ever sends a response. Same
 *    ultimate symptom (hang) as Preparation's 16th/19th codebase-wide hangs, via two
 *    different proximate causes (an unhandled synchronous throw vs. an unawaited async-map
 *    exception) — a useful correction to an initial assumption that the `for` loop made this
 *    side immune; it doesn't, because nothing here wraps the loop in try/catch either.
 * 3. `createPlanningUploading`'s save() does NOT set `lsd`/`lfd` at all (neither to the
 *    submitted values NOR to null — the fields are simply absent from the schema write),
 *    whereas Preparation's save() hardcodes them to `null` despite requiring them in the
 *    request body. Either way `lfd` starts unset; `reschedule()` is the only way to set it.
 * 4. `getSelfPlanningUploadingByDate` computes its "today" window with `convertedIOSDate`/
 *    `convertedIOSToDate` (`services/util.service.js:295-308`), NOT the broken
 *    `toUTCStart`/`toUTCEnd` pair Preparation's equivalent uses — these two actually compute
 *    real start-of-day/end-of-day boundaries. Confirmed live below: after a `reschedule()`
 *    sets `lfd` to today, this endpoint DOES find the record — the Preparation-side
 *    equivalent can never do this (see planning-preparation.spec.ts's dedicated BUG test).
 * 5. `reSechuldingUploading` has the identical `$nin`-excludes-self bug as Preparation's
 *    `reSechuldingPreparation` (confirmed live) — worked around the same way, via the
 *    `contentUploader` actor instead of Admin self-assignment.
 * 6. `createPlanningUploading` accepts and writes a `staffAllocationContentId` field that
 *    Preparation's create has no equivalent for at all (see dairy-uploading.spec.ts section
 *    16 for why this matters for the consolidated-report asymmetry).
 * 7. The `ContentUploading` "name" activities this suite seeds via `ContentPreparationClient`
 *    ('uploading' variant) are Admin-gated on create/delete — confirmed live, a
 *    `contentUploader` actor gets "Admin can only allow to access create ContentUploading!."
 *    — so every seed/cleanup call below uses the `admin` client regardless of which actor
 *    the resulting `PlanningUploading` record is assigned to.
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
    assigneeId: SEED.COMPANY_ID, // caller must override
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

/** Always called with the `admin` client — see top-of-file note 7. */
async function seedActivity(admin: BaseApiClient, tag: string): Promise<string> {
  const contentUp = new ContentPreparationClient(admin, 'uploading');
  const create = await contentUp.create({ companyId: SEED.COMPANY_ID, name: `${tag}-activity`, isRework: false });
  expect(create.status()).toBe(200);
  const all = await (await contentUp.getAllByCompany(SEED.COMPANY_ID)).json();
  const activity = (all.contentUploadingName as Array<{ _id: string; contentUploadingName: string }>).find(
    (a) => a.contentUploadingName === `${tag}-activity`,
  );
  if (!activity) throw new Error('seeded ContentUploading activity not found');
  return activity._id;
}

async function deleteActivity(admin: BaseApiClient, activityId: string): Promise<void> {
  await new ContentPreparationClient(admin, 'uploading').delete(SEED.COMPANY_ID, activityId).catch(() => undefined);
}

test.describe('Planning — PlanningUploading', () => {
  test('create rejects an invalid companyId', async ({ clientAs }) => {
    test.skip(!isActorConfigured('contentUploader'), 'CONTENT_UPLOADER_USERNAME/PASSWORD not set — run `npm run bootstrap:content-uploader`.');
    const client = await clientAs('contentUploader');
    const selfId = await getSelfId(client);
    const response = await new PlanningPreparationClient(client, 'uploading').create([
      buildItem({ companyId: '000000000000000000000000', assigneeId: selfId, selectedActivities: ['000000000000000000000000'] }),
    ]);
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/company/i);
  });

  test('BUG: create cannot be self-assigned by an Admin even with a fully valid payload (same $nin-excludes-self class as reschedule)', async ({
    clientAs,
  }) => {
    const client = await clientAs('admin');
    const selfId = await getSelfId(client);
    const response = await new PlanningPreparationClient(client, 'uploading').create([
      buildItem({ assigneeId: selfId, selectedActivities: ['000000000000000000000000'] }),
    ]);
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('User was not found!.');
  });

  test('BUG: create hangs indefinitely on an empty data array (same class as Preparation sibling, different mechanism)', async ({
    clientAs,
  }) => {
    const client = await clientAs('admin');
    await expect(
      Promise.race([
        new PlanningPreparationClient(client, 'uploading').create([]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout waiting for response')), 8000)),
      ]),
    ).rejects.toThrow(/timeout/i);
  });

  test('BUG: create hangs indefinitely on a single-element variableDetails array (an unhandled synchronous throw inside the for loop, not just Preparation\'s async-map variant)', async ({
    clientAs,
  }) => {
    test.skip(!isActorConfigured('contentUploader'), 'CONTENT_UPLOADER_USERNAME/PASSWORD not set — run `npm run bootstrap:content-uploader`.');
    const client = await clientAs('contentUploader');
    const selfId = await getSelfId(client);
    await expect(
      Promise.race([
        new PlanningPreparationClient(client, 'uploading').create([
          buildItem({ variableDetails: [{ variableId: CURRICULUM.TOP_VARIABLE_ID }], assigneeId: selfId, selectedActivities: ['000000000000000000000000'] }),
        ]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout waiting for response')), 8000)),
      ]),
    ).rejects.toThrow(/timeout/i);
  });

  test('real lifecycle: create as contentUploader (self-assigned), find via getByUser, clean up', async ({ clientAs }) => {
    test.skip(!isActorConfigured('contentUploader'), 'CONTENT_UPLOADER_USERNAME/PASSWORD not set — run `npm run bootstrap:content-uploader`.');
    const admin = await clientAs('admin');
    const uploader = await clientAs('contentUploader');
    const selfId = await getSelfId(uploader);
    const tag = baseFactory.testTag();
    const activityId = await seedActivity(admin, tag);
    const planningClient = new PlanningPreparationClient(uploader, 'uploading');

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

    expect(found.lfd).toBeFalsy(); // confirmed: lsd/lfd are never set at creation on this side either

    await planningClient.delete(found._id).catch(() => undefined);
    await deleteActivity(admin, activityId);
  });

  test('delete rejects a malformed id', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new PlanningPreparationClient(client, 'uploading').delete('not-an-object-id');
    expect(response.status()).toBe(400);
  });

  test('delete rejects a well-formed but nonexistent id', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new PlanningPreparationClient(client, 'uploading').delete('000000000000000000000000');
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/not found/i);
  });

  test('delete rejects an anonymous request', async ({ anonClient }) => {
    const response = await new PlanningPreparationClient(anonClient, 'uploading').delete('000000000000000000000000');
    expect([401, 403]).toContain(response.status());
  });

  test('BUG: reschedule cannot be self-assigned by an Admin even with a fully valid payload', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const selfId = await getSelfId(client);
    const response = await new PlanningPreparationClient(client, 'uploading').reschedule({
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

  test('real lifecycle: reschedule sets lfd, and getSelfByDateToday (unlike its Preparation sibling) correctly finds it', async ({
    clientAs,
  }) => {
    // The payoff of top-of-file finding #4: this is the one self-report this test bench can
    // prove genuinely works end-to-end for "today" data, because this side's date-window
    // helper (convertedIOSDate/convertedIOSToDate) actually computes real day boundaries.
    test.skip(!isActorConfigured('contentUploader'), 'CONTENT_UPLOADER_USERNAME/PASSWORD not set — run `npm run bootstrap:content-uploader`.');
    const admin = await clientAs('admin');
    const uploader = await clientAs('contentUploader');
    const selfId = await getSelfId(uploader);
    const tag = baseFactory.testTag();
    const activityId = await seedActivity(admin, tag);
    const planningClient = new PlanningPreparationClient(uploader, 'uploading');

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
      const today = new Date().toISOString().slice(0, 10);
      const reschedule = await planningClient.reschedule({
        planningId: found._id,
        assigneeId: selfId,
        companyId: SEED.COMPANY_ID,
        typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
        countryId: CURRICULUM.COUNTRY_ID,
        institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
        duration: 9,
        delay: 1,
        esd: today,
        efd: today,
        lsd: today,
        lfd: today,
      });
      expect(reschedule.status()).toBe(200);

      const response = await planningClient.getSelfByDateToday(params);
      expect(response.status()).toBe(200);
      const body = await response.json();
      const foundToday = (body.selectedActivities as Array<{ _id: string }>).find((p) => p._id === found._id);
      expect(foundToday).toBeTruthy();
    } finally {
      await planningClient.delete(found._id).catch(() => undefined);
      await deleteActivity(admin, activityId);
    }
  });

  test('getAllUnselectedContentUploadingActivities returns real pre-existing activity data for a real session-level variable', async ({
    clientAs,
  }) => {
    test.skip(!isActorConfigured('contentUploader'), 'CONTENT_UPLOADER_USERNAME/PASSWORD not set — run `npm run bootstrap:content-uploader`.');
    const client = await clientAs('contentUploader');
    const selfId = await getSelfId(client);
    const response = await new PlanningPreparationClient(client, 'uploading').getAllUnselectedActivities(selfId, CURRICULUM.LEAF_SESSION_ID);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.contentUploading)).toBe(true);
  });

  test('getAllUnselectedContentUploadingActivities rejects a variable with no sessionCode', async ({ clientAs }) => {
    test.skip(!isActorConfigured('contentUploader'), 'CONTENT_UPLOADER_USERNAME/PASSWORD not set — run `npm run bootstrap:content-uploader`.');
    const client = await clientAs('contentUploader');
    const selfId = await getSelfId(client);
    const response = await new PlanningPreparationClient(client, 'uploading').getAllUnselectedActivities(selfId, CURRICULUM.SESSION_ID);
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('Variable was not found!.');
  });

  test('real lifecycle: getByActivities finds a just-created record by its real selectedActivities id', async ({ clientAs }) => {
    test.skip(!isActorConfigured('contentUploader'), 'CONTENT_UPLOADER_USERNAME/PASSWORD not set — run `npm run bootstrap:content-uploader`.');
    const admin = await clientAs('admin');
    const uploader = await clientAs('contentUploader');
    const selfId = await getSelfId(uploader);
    const tag = baseFactory.testTag();
    const activityId = await seedActivity(admin, tag);
    const planningClient = new PlanningPreparationClient(uploader, 'uploading');

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
      await deleteActivity(admin, activityId);
    }
  });

  test('BUG: getByActivities hangs indefinitely for a well-formed but non-matching activity id (same class as Preparation sibling)', async ({
    clientAs,
  }) => {
    test.skip(!isActorConfigured('contentUploader'), 'CONTENT_UPLOADER_USERNAME/PASSWORD not set — run `npm run bootstrap:content-uploader`.');
    const client = await clientAs('contentUploader');
    const selfId = await getSelfId(client);
    const planningClient = new PlanningPreparationClient(client, 'uploading');
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
    test.skip(!isActorConfigured('contentUploader'), 'CONTENT_UPLOADER_USERNAME/PASSWORD not set — run `npm run bootstrap:content-uploader`.');
    const admin = await clientAs('admin');
    const uploader = await clientAs('contentUploader');
    const selfId = await getSelfId(uploader);
    const tag = baseFactory.testTag();
    const activityId = await seedActivity(admin, tag);
    const planningClient = new PlanningPreparationClient(uploader, 'uploading');

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
      await deleteActivity(admin, activityId);
    }
  });

  test('getBySessionId rejects a malformed session id', async ({ clientAs }) => {
    test.skip(!isActorConfigured('contentUploader'), 'CONTENT_UPLOADER_USERNAME/PASSWORD not set — run `npm run bootstrap:content-uploader`.');
    const client = await clientAs('contentUploader');
    const selfId = await getSelfId(client);
    const response = await new PlanningPreparationClient(client, 'uploading').getBySessionId(selfId, 'not-an-object-id');
    expect(response.status()).toBe(400);
  });
});
