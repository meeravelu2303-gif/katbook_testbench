import { test, expect } from '../../fixtures/api.fixture';
import { BaseApiClient } from '../../client/base-client';
import { DairyPreparationClient } from '../../client/dairy-preparation.client';
import { PlanningPreparationClient } from '../../client/planning-preparation.client';
import { ContentPreparationClient } from '../../client/content-preparation.client';
import { SEED, CURRICULUM } from '../../config/seed.constants';
import { baseFactory } from '../../factories/base.factory';

test.describe.configure({ mode: 'parallel' });

/**
 * dairyPreparation.controller.js — 29 routes, all `needsAuth` (confirmed from routes/v1.js,
 * no mixed-middleware JWT-bypass risk in this domain). This is a read-mostly reporting
 * layer over `PlanningPreparation` (seeded via `PlanningPreparationClient`, part of the
 * not-yet-built `planning` domain — distinct from `ManagementPlanningPreparation`, which
 * `management-planning.client.ts` covers). The "Self" family below (21 of 29 routes) only
 * depends on `PlanningPreparation` + the caller's own user doc, so gets full real-data
 * coverage; the "ByTeam"/"Consolidated"/"ByTeam4-6" family (8 routes) additionally requires
 * `StaffAllocationContentPreparation` records with no seeding infra in this test bench, and
 * gets lean validation/auth-boundary coverage only, same treatment as core
 * ContentController's unreachable-happy-path routes (see content-core-auth-matrix.spec.ts).
 *
 * BUG (confirmed live via raw curl, independent of Playwright — a NEW hang, not previously
 * documented): `createPlanningPreparation` (`POST /planning/content/preparation/create`,
 * the only way to seed real `PlanningPreparation` data) has the same array-vs-object
 * validation mismatch found in handbook/videoscript controllers for its early existence
 * checks (`tierDetails.tierId`/`variableDetails.variableId`, singular, always undefined for
 * a real array payload — silently bypassed via the mongodb driver's `new
 * ObjectId(undefined)` -> random-id quirk, so those checks never actually fire). Its real,
 * undocumented prerequisite is enforced later: `variableDetails[length-1]`/`[length-2]`
 * must form a genuine parent-child pair (the last entry's Variable's `parentVaribaleId`
 * must equal the second-to-last entry's id). A single-element `variableDetails` array
 * passes every early check but then throws (`variableDetails[-1]` is undefined) inside an
 * un-awaited `.map(async ...)` callback with no catch — the exception is swallowed, no
 * response is ever sent, and the request hangs until client timeout. Confirmed fixed by
 * using a real 2-element chain (`CURRICULUM.TOP_VARIABLE_ID` -> `CURRICULUM.UNIT_ID`).
 *
 * BUG (confirmed live, naming/copy-paste): the success response message from the
 * Preparation-side status-update route (`updatePlanningPreparationTaskStatus_V2`) reads
 * "Planning Uploading content activity status was updated!" — copy-pasted from the
 * Uploading-side sibling, same class of finding as management-planning's copy-pasted
 * messages (section 9).
 */
const ATTR_PARAMS = {
  companyId: SEED.COMPANY_ID,
  typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
  countryId: CURRICULUM.COUNTRY_ID,
  institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
  attributeId: CURRICULUM.ATTRIBUTE_ID,
};

const TODAY = new Date().toISOString().slice(0, 10);

async function getSelfId(client: BaseApiClient): Promise<string> {
  const response = await client.get('/v1/user/profile');
  const body = await response.json();
  return body.user._id;
}

/** Seeds one real ContentPreparation activity + PlanningPreparation record for today, self-assigned. Returns ids for cleanup. */
async function seedPlanningPreparation(rawClient: BaseApiClient): Promise<{ selfId: string; activityId: string; planningId: string }> {
  const contentPrep = new ContentPreparationClient(rawClient, 'preparation');
  const planningPrep = new PlanningPreparationClient(rawClient, 'preparation');
  const selfId = await getSelfId(rawClient);
  const tag = baseFactory.testTag();

  const createActivity = await contentPrep.create({ companyId: SEED.COMPANY_ID, name: `${tag}-activity`, isRework: false });
  expect(createActivity.status()).toBe(200);
  const allActivities = await (await contentPrep.getAllByCompany(SEED.COMPANY_ID)).json();
  const activity = (allActivities.data as Array<{ _id: string; contentPreparationName: string }>).find(
    (a) => a.contentPreparationName === `${tag}-activity`,
  );
  if (!activity) throw new Error('seeded ContentPreparation activity not found in getAllByCompany');

  const createPlanning = await planningPrep.create([
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

  const allForDate = await (await new DairyPreparationClient(rawClient).getAllForDate(TODAY)).json();
  const found = (allForDate.selectedActivities as Array<{ _id: string; selectedActivities: { _id: string } }>).find(
    (p) => p.selectedActivities._id === activity._id,
  );
  if (!found) throw new Error('seeded PlanningPreparation record not found via getAllForDate');

  return { selfId, activityId: activity._id, planningId: found._id };
}

async function cleanup(rawClient: BaseApiClient, ids: { activityId: string; planningId: string }) {
  await new PlanningPreparationClient(rawClient, 'preparation').delete(ids.planningId).catch(() => undefined);
  await new ContentPreparationClient(rawClient, 'preparation').delete(SEED.COMPANY_ID, ids.activityId).catch(() => undefined);
}

test.describe('Diary — DairyPreparation (self-scoped reports)', () => {
  test('BUG: createPlanningPreparation hangs indefinitely on a single-element variableDetails array', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const selfId = await getSelfId(client);
    const planningPrep = new PlanningPreparationClient(client, 'preparation');

    await expect(
      Promise.race([
        planningPrep.create([
          {
            companyId: SEED.COMPANY_ID,
            typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
            countryId: CURRICULUM.COUNTRY_ID,
            institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
            attributeId: CURRICULUM.ATTRIBUTE_ID,
            tierDetails: [{ tierId: CURRICULUM.TIER_1_ID }],
            variableDetails: [{ variableId: CURRICULUM.TOP_VARIABLE_ID }],
            assigneeId: selfId,
            selectedActivities: ['000000000000000000000000'],
            duration: 5,
            delay: 0,
            esd: TODAY,
            efd: TODAY,
            lsd: TODAY,
            lfd: TODAY,
            sequenceNo: 1,
          },
        ]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout waiting for response')), 8000)),
      ]),
    ).rejects.toThrow(/timeout/i);
  });

  test('real lifecycle: seed a PlanningPreparation record, find it via getAllForDate, update its status, clean up', async ({
    clientAs,
  }) => {
    const client = await clientAs('admin');
    const ids = await seedPlanningPreparation(client);
    try {
      const dairy = new DairyPreparationClient(client);

      const updateResponse = await dairy.updateTaskStatus([
        { planningPreparationId: ids.planningId, companyId: SEED.COMPANY_ID, status: 'InProgress', remark: 'qa-diary-lifecycle' },
      ]);
      expect(updateResponse.status()).toBe(200);
      // BUG: this message is copy-pasted from the Uploading sibling — see top-of-file note.
      expect((await updateResponse.json()).message).toContain('Planning Uploading content activity status was updated!');

      const afterUpdate = await (await dairy.getAllForDate(TODAY)).json();
      const record = (afterUpdate.selectedActivities as Array<{ _id: string; status: string }>).find((p) => p._id === ids.planningId);
      expect(record?.status).toBe('InProgress');
    } finally {
      await cleanup(client, ids);
    }
  });

  test('a seeded record does not leak the password hash via createdBy/updatedBy (write-time anti-pattern present but not exploitable here)', async ({
    clientAs,
  }) => {
    // createPlanningPreparation assigns `createdBy: user, updatedBy: user` (the full
    // Mongoose doc, not `user._id`) — the same anti-pattern confirmed exploitable
    // elsewhere in this codebase (ContentLink, HandBook, management-planning, core
    // ContentController). Here it does NOT leak: the read path consistently populates
    // createdBy/updatedBy with a restrictive `select` (confirmed across every DairyPreparation
    // and PlanningPreparation read function read this session), and `create`'s own response
    // never echoes the document. Regression-tested so a future change to either read path's
    // `select` or the create response shape gets caught.
    const client = await clientAs('admin');
    const ids = await seedPlanningPreparation(client);
    try {
      const afterCreate = await (await new DairyPreparationClient(client).getAllForDate(TODAY)).json();
      const record = (afterCreate.selectedActivities as Array<{ _id: string; createdBy: object; updatedBy: object }>).find(
        (p: any) => p._id === ids.planningId,
      );
      expect(record?.createdBy).not.toHaveProperty('password');
      expect(record?.updatedBy).not.toHaveProperty('password');
    } finally {
      await cleanup(client, ids);
    }
  });

  test('BUG: getDetailed (POST /self/detailed) hangs indefinitely for a fully valid payload', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const dairy = new DairyPreparationClient(client);
    await expect(
      dairy.getDetailed(
        {
          companyId: SEED.COMPANY_ID,
          typeOfBookId: CURRICULUM.TYPE_OF_BOOK_ID,
          countryId: CURRICULUM.COUNTRY_ID,
          institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
          attributeId: CURRICULUM.ATTRIBUTE_ID,
          tierId: CURRICULUM.TIER_1_ID,
          variableId: CURRICULUM.TOP_VARIABLE_ID,
        },
        8000,
      ),
    ).rejects.toThrow(/timeout/i);
  });

  test('getAllForDate rejects an anonymous request', async ({ anonClient }) => {
    const response = await new DairyPreparationClient(anonClient).getAllForDate(TODAY);
    expect([401, 403]).toContain(response.status());
  });

  test('getAllForDate rejects an invalid date format', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new DairyPreparationClient(client).getAllForDate('not-a-date');
    expect(response.status()).toBe(400);
  });

  test('getAllForDateByAttribute validates each required param before querying', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new DairyPreparationClient(client).getAllForDateByAttribute(
      { ...ATTR_PARAMS, attributeId: '000000000000000000000000' },
      TODAY,
    );
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/attribute/i);
  });

  test('updateTaskStatus rejects a missing data array', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new DairyPreparationClient(client).updateTaskStatus([]);
    expect(response.status()).toBe(400);
  });

  test('updateTaskStatus rejects an invalid status value', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new DairyPreparationClient(client).updateTaskStatus([
      { planningPreparationId: '000000000000000000000000', companyId: SEED.COMPANY_ID, status: 'Bogus' as never },
    ]);
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/valid status/i);
  });

  test('getAllCompletedBySelf returns 400 (empty) when no record matches today for this attribute', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new DairyPreparationClient(client).getAllCompletedBySelf(ATTR_PARAMS);
    expect(response.status()).toBe(400);
  });

  test('getDetailedStatusReportBySelf rejects a missing variableId', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new DairyPreparationClient(client).getDetailedStatusReportBySelf({
      ...ATTR_PARAMS,
      variableId: '',
      statusAll: true,
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/variable/i);
  });

  test('BUG: getConsolidatedStatusReportBySelf can never return data — PlanningPreparation.StaffAllocationContentPreparationId is a dead field', async ({
    clientAs,
  }) => {
    // Confirmed live, not just from source: this function's join requires a real
    // PlanningPreparation record whose `StaffAllocationContentPreparationId` matches a real
    // StaffAllocationContentPreparation._id. Verified by creating BOTH a real
    // StaffAllocationContentPreparation (POST /staff/content/prepation/create) AND a real
    // matching PlanningPreparation record, then calling this endpoint — it still returned
    // "Planning activities was empty!" (400). Root cause, confirmed by grepping every
    // controller: createPlanningPreparation (the only way to create a PlanningPreparation
    // record) never sets `StaffAllocationContentPreparationId` anywhere in the document it
    // saves — the field is only ever read, never written, codebase-wide. This endpoint is
    // therefore structurally unreachable with real data regardless of how much
    // StaffAllocation data is seeded; this is not a test-bench seeding gap. Contrast with
    // the Uploading-side equivalent (dairy-uploading.spec.ts), whose `createPlanningUploading`
    // DOES accept and write a `staffAllocationContentId` — a real asymmetry, not just a
    // naming one.
    const client = await clientAs('admin');
    const response = await new DairyPreparationClient(client).getConsolidatedStatusReportBySelf(ATTR_PARAMS);
    expect(response.status()).toBe(400);
  });
});

/**
 * Lean, broad auth/validation-boundary coverage for the remaining Self-date-variant and
 * every Team/Consolidated route — all confirmed `needsAuth` from source, so every case
 * expects 401/403 anonymously; bodies/params are well-formed-but-empty placeholders, since
 * we only care whether the auth gate is reached, not business-logic depth (which the real
 * lifecycle test above already proves for the shared `PlanningPreparation` read path).
 */
const PLACEHOLDER = '000000000000000000000000';

interface RouteCase {
  method: 'get' | 'post' | 'put';
  path: string;
  body?: unknown;
}

const LEAN_ROUTES: RouteCase[] = [
  { method: 'get', path: `/v1/dairy/content/preparation/completed/task/get/self/mothly/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${TODAY}` },
  { method: 'get', path: `/v1/dairy/content/preparation/completed/task/get/self/monthly/${PLACEHOLDER}/${TODAY}/${TODAY}` },
  { method: 'post', path: '/v1/dairy/content/preparation/completed/task/get/team/monthly', body: {} },
  { method: 'get', path: `/v1/dairy/content/preparation/completed/task/get/self/weekly/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${TODAY}/${TODAY}` },
  { method: 'get', path: `/v1/dairy/content/preparation/completed/task/get/self/weekly/${PLACEHOLDER}/${TODAY}/${TODAY}` },
  { method: 'post', path: '/v1/dairy/content/preparation/completed/task/get/team/weekly', body: {} },
  { method: 'post', path: '/v1/dairy/content/preparation/completed/task/get/team/today', body: {} },
  { method: 'get', path: `/v1/dairy/content/preparation/completed/task/get/self/today/${PLACEHOLDER}/${TODAY}/${TODAY}` },
  { method: 'get', path: `/v1/dairy/content/preparation/appraisal/task/get/self/mothly/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${TODAY}` },
  { method: 'get', path: `/v1/dairy/content/preparation/appraisal/task/get/self/mothly/${PLACEHOLDER}/${TODAY}/${TODAY}` },
  { method: 'post', path: '/v1/dairy/content/preparation/appraisal/task/get/team/monthly', body: {} },
  { method: 'get', path: `/v1/dairy/content/preparation/appraisal/task/get/self/weekly/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${TODAY}/${TODAY}` },
  { method: 'get', path: `/v1/dairy/content/preparation/appraisal/task/get/self/weekly/${PLACEHOLDER}/${TODAY}/${TODAY}` },
  { method: 'post', path: '/v1/dairy/content/preparation/appraisal/task/get/team/weekly', body: {} },
  { method: 'get', path: `/v1/dairy/content/preparation/appraisal/task/get/self/today/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}` },
  { method: 'post', path: '/v1/dairy/content/preparation/appraisal/task/get/team/today', body: {} },
  { method: 'get', path: `/v1/dairy/content/preparation/appraisal/task/get/self/today/${PLACEHOLDER}/${TODAY}/${TODAY}` },
  { method: 'post', path: '/v1/dairy/content/preparation/status/task/get/team/detailed', body: {} },
  { method: 'post', path: '/v1/dairy/content/preparation/status/task/team/consolidated', body: {} },
  { method: 'post', path: '/v1/dairy/content/preparation/status/task/team/consolidated2', body: {} },
  { method: 'post', path: '/v1/dairy/content/preparation/status/task/team/consolidated3', body: {} },
];

test.describe('Diary — DairyPreparation lean auth-boundary matrix (team/consolidated/date variants)', () => {
  for (const route of LEAN_ROUTES) {
    const label = `${route.method.toUpperCase()} ${route.path}`;
    test(`${label} — requires authentication`, async ({ anonClient }) => {
      const response = await anonClient[route.method](route.path, route.body !== undefined ? { data: route.body } : {});
      expect([401, 403]).toContain(response.status());
    });
  }
});
