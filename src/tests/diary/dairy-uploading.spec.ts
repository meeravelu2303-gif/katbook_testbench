import { test, expect } from '../../fixtures/api.fixture';
import { BaseApiClient } from '../../client/base-client';
import { DairyUploadingClient } from '../../client/dairy-uploading.client';
import { PlanningPreparationClient } from '../../client/planning-preparation.client';
import { ContentPreparationClient } from '../../client/content-preparation.client';
import { SEED, CURRICULUM } from '../../config/seed.constants';
import { baseFactory } from '../../factories/base.factory';
import { isActorConfigured } from '../../config/api.config';

test.describe.configure({ mode: 'parallel' });

/**
 * dairyUploading.controller.js — the Uploading-side mirror of dairyPreparation.controller.js,
 * but with 2 real asymmetries from its Preparation sibling (not just naming):
 *
 * 1. Only 20 of its 27 exported functions are wired to a route in routes/v1.js —
 *    `updatePlanningUploadingTaskStatusV2`, `getAllPlanningUploadingInCompletedByInstitution_v2`,
 *    `GetConsolidatedStatusReportPlanningUploadingByTeamv3`, and the non-"v2" monthly/appraisal
 *    self variants are genuine dead code (confirmed by diffing the export list against every
 *    `DairyUploadingController.` registration — not a routing-order shadowing bug like
 *    section 10's `/content/attribute`, just unreachable code).
 * 2. `PlanningUploadingController.createPlanningUploading` (the only way to seed real
 *    `PlanningUploading` data) cannot be self-assigned by an Admin: when the caller's
 *    usertype code is the Admin code, its existence check is `User.findOne({ userTypeId: {
 *    $nin: user.userTypeId}, _id: contentUploaderId, ... })` — the `$nin` explicitly
 *    excludes the ADMIN'S OWN usertype, so self-assigning (`contentUploaderId = user._id`)
 *    can never match. Confirmed live: returns "User was not found!." for an otherwise fully
 *    valid payload. `createPlanningPreparation`'s equivalent check has no such exclusion and
 *    self-assigns fine there (see dairy-preparation.spec.ts's real lifecycle test) — this
 *    asymmetry is itself a finding, documented below. Resolved for real-data coverage by
 *    adding a genuine `contentUploader` actor (`src/config/api.config.ts`,
 *    `SEED.CONTENT_UPLOADER_USER_TYPE_ID`, bootstrapped via `npm run
 *    bootstrap:content-uploader`) — logging in as that actor and self-assigning works fine
 *    (the non-Admin branch has no such exclusion), unblocking the real lifecycle test below.
 */
const PLACEHOLDER = '000000000000000000000000';
const TODAY = new Date().toISOString().slice(0, 10);

async function getSelfId(client: BaseApiClient): Promise<string> {
  const body = await (await client.get('/v1/user/profile')).json();
  return body.user._id;
}

test.describe('Diary — DairyUploading (self-scoped reports, real data via the contentUploader actor)', () => {
  test('BUG: createPlanningUploading cannot be self-assigned by an Admin even with a fully valid payload', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const profile = await (await client.get('/v1/user/profile')).json();
    const planningUp = new PlanningPreparationClient(client, 'uploading');

    const response = await planningUp.create([
      {
        companyId: SEED.COMPANY_ID,
        typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
        countryId: CURRICULUM.COUNTRY_ID,
        institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
        attributeId: CURRICULUM.ATTRIBUTE_ID,
        tierDetails: [{ tierId: CURRICULUM.TIER_2_ID }],
        variableDetails: [{ variableId: CURRICULUM.TOP_VARIABLE_ID }, { variableId: CURRICULUM.UNIT_ID }],
        assigneeId: profile.user._id,
        selectedActivities: [PLACEHOLDER],
        duration: 5,
        delay: 0,
        esd: TODAY,
        efd: TODAY,
        lsd: TODAY,
        lfd: TODAY,
        sequenceNo: 1,
      },
    ]);
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('User was not found!.');
  });

  test('real lifecycle as a genuine Content Uploader actor: seed a PlanningUploading record, find it, update its status, clean up', async ({
    clientAs,
  }) => {
    test.skip(!isActorConfigured('contentUploader'), 'CONTENT_UPLOADER_USERNAME/PASSWORD not set — run `npm run bootstrap:content-uploader`.');
    const admin = await clientAs('admin');
    const uploader = await clientAs('contentUploader');
    const selfId = await getSelfId(uploader);
    const tag = baseFactory.testTag();

    const contentUp = new ContentPreparationClient(admin, 'uploading');
    const createActivity = await contentUp.create({ companyId: SEED.COMPANY_ID, name: `${tag}-activity`, isRework: false });
    expect(createActivity.status()).toBe(200);
    const allActivities = await (await contentUp.getAllByCompany(SEED.COMPANY_ID)).json();
    const activity = (allActivities.contentUploadingName as Array<{ _id: string; contentUploadingName: string }>).find(
      (a) => a.contentUploadingName === `${tag}-activity`,
    );
    if (!activity) throw new Error('seeded ContentUploading activity not found in getAllByCompany');

    const planningUp = new PlanningPreparationClient(uploader, 'uploading');
    const createPlanning = await planningUp.create([
      {
        companyId: SEED.COMPANY_ID,
        typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
        countryId: CURRICULUM.COUNTRY_ID,
        institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
        attributeId: CURRICULUM.ATTRIBUTE_ID,
        tierDetails: [{ tierId: CURRICULUM.TIER_2_ID }],
        variableDetails: [{ variableId: CURRICULUM.TOP_VARIABLE_ID }, { variableId: CURRICULUM.UNIT_ID }],
        assigneeId: selfId,
        selectedActivities: [activity._id],
        duration: 5,
        delay: 0,
        esd: TODAY,
        efd: TODAY,
        lsd: TODAY,
        lfd: TODAY,
        sequenceNo: 1,
      },
    ]);
    expect(createPlanning.status()).toBe(200);

    const dairyUp = new DairyUploadingClient(uploader);
    const byInstitution = await (
      await dairyUp.getAllForDateByAttribute(
        {
          companyId: SEED.COMPANY_ID,
          typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
          countryId: CURRICULUM.COUNTRY_ID,
          institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
          attributeId: CURRICULUM.ATTRIBUTE_ID,
        },
        TODAY,
      )
    ).json();
    const found = (byInstitution.selectedActivities as Array<{ _id: string; selectedActivities: { _id: string } }>).find(
      (p) => p.selectedActivities._id === activity._id,
    );
    if (!found) throw new Error('seeded PlanningUploading record not found via getAllForDateByAttribute');

    try {
      const updateResponse = await dairyUp.updateTaskStatus([
        { planningUploadingId: found._id, companyId: SEED.COMPANY_ID, status: 'InProgress', remark: 'qa-diary-uploading-lifecycle' },
      ]);
      expect(updateResponse.status()).toBe(200);
      expect((await updateResponse.json()).message).toBe('Planning Uploading content activity status was updated!');

      const afterUpdate = await (
        await dairyUp.getAllForDateByAttribute(
          {
            companyId: SEED.COMPANY_ID,
            typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
            countryId: CURRICULUM.COUNTRY_ID,
            institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
            attributeId: CURRICULUM.ATTRIBUTE_ID,
          },
          TODAY,
        )
      ).json();
      const record = (afterUpdate.selectedActivities as Array<{ _id: string; status: string; createdBy: object; updatedBy: object }>).find(
        (p) => p._id === found._id,
      );
      expect(record?.status).toBe('InProgress');
      // Same write-time anti-pattern as createPlanningPreparation (createdBy/updatedBy
      // assigned the full req.user doc) — confirmed not exploitable here either, same
      // reasoning as dairy-preparation.spec.ts's equivalent test.
      expect(record?.createdBy).not.toHaveProperty('password');
      expect(record?.updatedBy).not.toHaveProperty('password');
    } finally {
      await planningUp.delete(found._id).catch(() => undefined);
      await contentUp.delete(SEED.COMPANY_ID, activity._id).catch(() => undefined);
    }
  });

  test('createPlanningUploading (route typo "uploadig", confirmed real) rejects an anonymous request', async ({ anonClient }) => {
    const response = await new PlanningPreparationClient(anonClient, 'uploading').create([]);
    expect([401, 403]).toContain(response.status());
  });

  test('updateTaskStatus rejects a missing data array', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new DairyUploadingClient(client).updateTaskStatus([]);
    expect(response.status()).toBe(400);
  });

  test('updateTaskStatus rejects an invalid status value', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new DairyUploadingClient(client).updateTaskStatus([
      { planningUploadingId: PLACEHOLDER, companyId: SEED.COMPANY_ID, status: 'Bogus' as never },
    ]);
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/valid status/i);
  });

  test('getAllForDateByAttribute returns 400 (empty) for a well-formed request with no matching data', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new DairyUploadingClient(client).getAllForDateByAttribute(
      {
        companyId: SEED.COMPANY_ID,
        typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
        countryId: CURRICULUM.COUNTRY_ID,
        institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
        attributeId: CURRICULUM.ATTRIBUTE_ID,
      },
      TODAY,
    );
    expect(response.status()).toBe(400);
  });

  test('getDetailedStatusReportBySelf (unlike its Preparation sibling, no variableId param at all) returns 400 (empty) with no matching data', async ({
    clientAs,
  }) => {
    // Confirmed from source: dairyUploading.controller.js's version of this function never
    // reads/validates a variableId, unlike dairyPreparation's — a real structural difference
    // between the two "mirror" controllers, not a copy-paste gap. With statusAll it goes
    // straight to a PlanningUploading.find with no variable filter.
    const client = await clientAs('admin');
    const response = await new DairyUploadingClient(client).getDetailedStatusReportBySelf({
      companyId: SEED.COMPANY_ID,
      typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
      countryId: CURRICULUM.COUNTRY_ID,
      institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
      attributeId: CURRICULUM.ATTRIBUTE_ID,
      statusAll: true,
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('Planning activities was empty!.');
  });

  test('getConsolidatedStatusReportBySelf — unlike its Preparation sibling, NOT structurally dead, but gated behind a deeper curriculum chain than this bench has verified', async ({
    clientAs,
  }) => {
    // Asymmetry finding, confirmed by reading both controllers side by side:
    // createPlanningUploading accepts `staffAllocationContentId` in its body and writes it
    // to the saved document's `StaffAllocationContentUploadingId` (PlanningUploading.
    // controller.js:359/407) — unlike createPlanningPreparation, which never writes the
    // equivalent field at all (confirmed dead, see dairy-preparation.spec.ts). So this
    // report's join CAN be satisfied with real data in principle. What blocks a real
    // happy-path test here instead is depth: the report's grouping logic indexes
    // `variableDetails[length-4]` (dairyUploading.controller.js:3908) — it needs a real
    // variableDetails chain of >= 4 parent-child levels. This test bench's verified real
    // chain (CURRICULUM.TOP_VARIABLE_ID -> UNIT_ID -> SESSION_ID) is only 3 levels deep; a
    // 4th real level has not been discovered. Deferred for the same reason core
    // ContentController's deepest routes were deferred in section 13 — needs richer seed
    // data, not more test-bench engineering.
    const client = await clientAs('admin');
    const response = await new DairyUploadingClient(client).getConsolidatedStatusReportBySelf({
      companyId: SEED.COMPANY_ID,
      typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
      countryId: CURRICULUM.COUNTRY_ID,
      institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
      attributeId: CURRICULUM.ATTRIBUTE_ID,
    });
    expect(response.status()).toBe(400);
  });
});

/**
 * Lean, broad auth-boundary coverage for every remaining live DairyUploading route — all
 * confirmed `needsAuth` from source, so every case expects 401/403 anonymously.
 */
interface RouteCase {
  method: 'get' | 'post' | 'put';
  path: string;
  body?: unknown;
}

const LEAN_ROUTES: RouteCase[] = [
  { method: 'put', path: '/v1/dairy/content/uploading/activity/status/update', body: { data: [] } },
  { method: 'get', path: `/v1/dairy/content/uploading/completed/task/get/all/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}` },
  { method: 'get', path: `/v1/dairy/content/uploading/completed/task/get/self/monthly/${PLACEHOLDER}/${TODAY}/${TODAY}` },
  { method: 'post', path: '/v1/dairy/content/uploading/completed/task/get/team/monthly', body: {} },
  { method: 'get', path: `/v1/dairy/content/uploading/completed/task/get/self/weekly/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${TODAY}/${TODAY}` },
  { method: 'get', path: `/v1/dairy/content/uploading/completed/task/get/self/weekly/${PLACEHOLDER}/${TODAY}/${TODAY}` },
  { method: 'post', path: '/v1/dairy/content/uploading/completed/task/get/team/weekly', body: {} },
  { method: 'get', path: `/v1/dairy/content/uploading/completed/task/get/self/today/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${TODAY}` },
  { method: 'get', path: `/v1/dairy/content/uploading/completed/task/get/self/today/${PLACEHOLDER}/${TODAY}/${TODAY}` },
  { method: 'post', path: '/v1/dairy/content/uploading/completed/task/get/team/today', body: {} },
  { method: 'get', path: `/v1/dairy/content/uploading/appraisal/task/get/self/mothly/${PLACEHOLDER}/${TODAY}/${TODAY}` },
  { method: 'post', path: '/v1/dairy/content/uploading/appraisal/task/get/team/monthly', body: {} },
  { method: 'get', path: `/v1/dairy/content/uploading/appraisal/task/get/self/weekly/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${TODAY}/${TODAY}` },
  { method: 'get', path: `/v1/dairy/content/uploading/appraisal/task/get/self/weekly/${PLACEHOLDER}/${TODAY}/${TODAY}` },
  { method: 'post', path: '/v1/dairy/content/uploading/appraisal/task/get/team/weekly', body: {} },
  { method: 'get', path: `/v1/dairy/content/uploading/appraisal/task/get/self/today/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${TODAY}` },
  { method: 'get', path: `/v1/dairy/content/uploading/appraisal/task/get/self/today/${PLACEHOLDER}/${TODAY}/${TODAY}` },
  { method: 'post', path: '/v1/dairy/content/uploading/appraisal/task/get/team/today', body: {} },
  { method: 'post', path: '/v1/dairy/content/uploading/status/task/get/team/detailed', body: {} },
  { method: 'post', path: '/v1/dairy/content/uploading/status/task/get/self/consolidated', body: {} },
  { method: 'post', path: '/v1/dairy/content/uploading/status/task/get/team/consolidated', body: {} },
  { method: 'post', path: '/v1/dairy/uploading/workreport', body: {} },
];

test.describe('Diary — DairyUploading lean auth-boundary matrix', () => {
  for (const route of LEAN_ROUTES) {
    const label = `${route.method.toUpperCase()} ${route.path}`;
    test(`${label} — requires authentication`, async ({ anonClient }) => {
      const response = await anonClient[route.method](route.path, route.body !== undefined ? { data: route.body } : {});
      expect([401, 403]).toContain(response.status());
    });
  }
});
