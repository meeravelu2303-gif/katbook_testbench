import { test, expect } from '../../fixtures/api.fixture';
import { ManagementClient } from '../../client/management.client';
import { ManagementPlanningClient, PlanningCreateItem } from '../../client/management-planning.client';
import { buildManagementResource, buildPlanningCreateItem } from '../../factories/management.factory';
import { managementPlanningDocSchema, managementPlanningListItemSchema } from '../../utils/validators/management-planning.schema';
import { assertMatchesSchema } from '../../utils/schema-validator';
import { readError, getSelfUserId } from './support';
import { SEED } from '../../config/seed.constants';

test.describe.configure({ mode: 'parallel' });

/**
 * Covers the 14 "planning" endpoints deferred from management.spec.ts — the bulk
 * task-assignment workflow layered on top of the plain Preparations/Uploadings resources
 * (ManagementPlanningPreparationController / ManagementUploadingPreparationController, read
 * directly since swagger's schema here is also generic). Developer-side and uploader-side
 * are structural mirrors, exercised through one parameterized suite as in management.spec.ts.
 *
 * Every test that needs a real `selectedActivities` creates its own fresh Preparation/
 * Uploading activity first (via ManagementClient from management.client.ts) — this also
 * sidesteps the "already exists for this period" duplicate rule, which is keyed on
 * (company, assignee, activity, esd, efd): a fresh activity id makes the tuple unique
 * without needing to vary dates test-to-test.
 */
interface PlanningVariantConfig {
  label: string;
  assigneeField: 'contentDeveloperId' | 'contentUploaderId';
  activityNameField: 'managementPreparationName' | 'managementUploadingName';
  createActivity: (mgmt: ManagementClient, companyId: string) => ReturnType<ManagementClient['createPreparation']>;
  deleteActivity: (mgmt: ManagementClient, id: string) => ReturnType<ManagementClient['deletePreparation']>;
  createSuccessMessage: string;
  updateBulkSuccessMessage: string;
  updateByIdSuccessMessage: string;
  activityNotFoundMessage: string;
  duplicatePeriodMessage: string;
  recordNotFoundMessage: string; // shared by update-bulk/update-by-id/delete "not found" paths
  getAllEmptyMessage: string;
  deleteSuccessMessage: string;
}

function definePlanningSuite(config: PlanningVariantConfig) {
  const docSchema = managementPlanningDocSchema(config.assigneeField);
  const listItemSchema = managementPlanningListItemSchema(config.assigneeField, config.activityNameField);

  test.describe(`Management — ${config.label} planning`, () => {
    async function createActivityId(mgmt: ManagementClient, companyId: string): Promise<string> {
      const response = await config.createActivity(mgmt, companyId);
      const body = await response.json();
      return body.data._id as string;
    }

    const validationCases: Array<{ title: string; override: Partial<PlanningCreateItem>; expected: RegExp }> = [
      { title: 'invalid companyId', override: { companyId: 'not-an-object-id' }, expected: /valid company/i },
      { title: 'missing sequenceNo', override: { sequenceNo: undefined as unknown as number }, expected: /valid sequence number/i },
      { title: 'invalid assignee id', override: { assigneeId: 'not-an-object-id' }, expected: /valid content (developer|uploader)/i },
      { title: 'missing selectedActivities', override: { selectedActivities: '' }, expected: /valid selected activities/i },
      { title: 'missing duration', override: { duration: undefined as unknown as number }, expected: /valid duration/i },
      { title: 'missing delay', override: { delay: undefined as unknown as number }, expected: /valid delay/i },
      { title: 'invalid esd format', override: { esd: '01-01-2026' }, expected: /valid esd/i },
      { title: 'invalid efd format', override: { efd: '2026/01/10' }, expected: /valid efd/i },
    ];

    for (const testCase of validationCases) {
      test(`create rejects ${testCase.title}`, async ({ clientAs }) => {
        const mgmt = new ManagementPlanningClient(await clientAs('admin'), config.label === 'Developer' ? 'developer' : 'uploader');
        const base: PlanningCreateItem = {
          companyId: SEED.COMPANY_ID,
          sequenceNo: 1,
          assigneeId: '000000000000000000000000',
          selectedActivities: '000000000000000000000000',
          duration: 1,
          delay: 0,
          esd: '2026-01-01',
          efd: '2026-01-10',
        };
        const response = await mgmt.create([{ ...base, ...testCase.override }]);
        expect(response.status()).toBe(400);
        await expect(readError(response)).resolves.toMatch(testCase.expected);
      });
    }

    test('create rejects an anonymous request', async ({ anonClient }) => {
      const mgmt = new ManagementPlanningClient(anonClient, config.label === 'Developer' ? 'developer' : 'uploader');
      const response = await mgmt.create([
        buildPlanningCreateItem(SEED.COMPANY_ID, '000000000000000000000000', '000000000000000000000000'),
      ]);
      expect([401, 403]).toContain(response.status());
    });

    test('create rejects a selectedActivities id that does not reference a real activity', async ({ clientAs }) => {
      const client = await clientAs('admin');
      const mgmt = new ManagementPlanningClient(client, config.label === 'Developer' ? 'developer' : 'uploader');
      const selfId = await getSelfUserId(client);

      const response = await mgmt.create([buildPlanningCreateItem(SEED.COMPANY_ID, selfId, '000000000000000000000000')]);
      expect(response.status()).toBe(400);
      await expect(readError(response)).resolves.toBe(config.activityNotFoundMessage);
    });

    test('full lifecycle: create (self-assigned), progress through status, list, then delete', async ({ clientAs }) => {
      const client = await clientAs('admin');
      const resourceClient = new ManagementClient(client);
      const mgmt = new ManagementPlanningClient(client, config.label === 'Developer' ? 'developer' : 'uploader');
      const selfId = await getSelfUserId(client);
      const activityId = await createActivityId(resourceClient, SEED.COMPANY_ID);

      try {
        const item = buildPlanningCreateItem(SEED.COMPANY_ID, selfId, activityId);
        const createResponse = await mgmt.create([item]);
        expect(createResponse.status()).toBe(200);
        const createBody = await createResponse.json();
        expect(createBody.message).toBe(config.createSuccessMessage);
        expect(createBody.data).toHaveLength(1);
        const created = assertMatchesSchema(docSchema, createBody.data[0], `create ${config.label} planning`);
        expect(created.status).toBe('Pending');
        expect(created.lsd).toBeNull();
        expect(created.lfd).toBeNull();
        expect(created.selectedActivities).toBe(activityId);

        // duplicate period (same company/assignee/activity/esd/efd, status not yet Completed)
        const dupResponse = await mgmt.create([item]);
        expect(dupResponse.status()).toBe(400);
        await expect(readError(dupResponse)).resolves.toBe(config.duplicatePeriodMessage);

        const updateByIdResponse = await mgmt.updateById(created._id, {
          lsd: '2026-01-02',
          lfd: '2026-01-03',
          status: 'InProgress',
          remarks: 'started',
        });
        expect(updateByIdResponse.status()).toBe(200);
        const updatedById = assertMatchesSchema(docSchema, (await updateByIdResponse.json()).data, `updateById ${config.label} planning`);
        expect(updatedById.status).toBe('InProgress');
        expect(updatedById.remarks).toBe('started');

        const updateBulkResponse = await mgmt.updateBulk([
          { id: created._id, lsd: '2026-01-02', lfd: '2026-01-05', status: 'Completed', remarks: 'done' },
        ]);
        expect(updateBulkResponse.status()).toBe(200);
        const bulkBody = await updateBulkResponse.json();
        expect(bulkBody.message).toBe(config.updateBulkSuccessMessage);
        expect(assertMatchesSchema(docSchema, bulkBody.data[0], `updateBulk ${config.label} planning`).status).toBe('Completed');

        const getByIdResponse = await mgmt.getById(created._id);
        expect(getByIdResponse.status()).toBe(200);
        const fetched = assertMatchesSchema(listItemSchema, (await getByIdResponse.json()).data, `getById ${config.label} planning`);
        expect(fetched._id).toBe(created._id);
        expect(fetched.companyId._id).toBe(SEED.COMPANY_ID);
        expect(fetched.selectedActivities._id).toBe(activityId);

        const getAllResponse = await mgmt.getAll({ companyId: SEED.COMPANY_ID, assigneeId: selfId });
        expect(getAllResponse.status()).toBe(200);
        const allBody = await getAllResponse.json();
        expect(allBody.data.some((x: { _id: string }) => x._id === created._id)).toBe(true);

        const getForSelfResponse = await mgmt.getForSelf();
        expect(getForSelfResponse.status()).toBe(200);
        const selfBody = await getForSelfResponse.json();
        expect(selfBody.data.some((x: { _id: string }) => x._id === created._id)).toBe(true);

        const deleteResponse = await mgmt.delete(created._id);
        expect(deleteResponse.status()).toBe(200);
        expect((await deleteResponse.json()).message).toBe(config.deleteSuccessMessage);

        const afterDelete = await mgmt.getById(created._id);
        expect(afterDelete.status()).toBe(404);
      } finally {
        await config.deleteActivity(resourceClient, activityId);
      }
    });

    test('SECURITY: create response must not leak the password hash via createdBy', async ({ clientAs }) => {
      const client = await clientAs('admin');
      const resourceClient = new ManagementClient(client);
      const mgmt = new ManagementPlanningClient(client, config.label === 'Developer' ? 'developer' : 'uploader');
      const selfId = await getSelfUserId(client);
      const activityId = await createActivityId(resourceClient, SEED.COMPANY_ID);
      let createdId: string | undefined;

      try {
        const createResponse = await mgmt.create([buildPlanningCreateItem(SEED.COMPANY_ID, selfId, activityId)]);
        const created = (await createResponse.json()).data[0];
        createdId = created._id;

        // Confirmed live: the controller assigns the full req.user document (not user._id)
        // to createdBy/updatedBy — same defect class as GET /v1/user/profile in login.spec.ts,
        // here on the write path of every planning create/update call instead of a read.
        // This assertion is expected to keep failing until the backend fixes it — cleanup
        // below must run regardless, or every red run leaks a record into the dev DB.
        expect(created.createdBy).not.toHaveProperty('password');
        expect(created.updatedBy).not.toHaveProperty('password');
      } finally {
        if (createdId) await mgmt.delete(createdId).catch(() => undefined);
        await config.deleteActivity(resourceClient, activityId);
      }
    });

    test('updateById rejects a status other than InProgress/Completed', async ({ clientAs }) => {
      const client = await clientAs('admin');
      const mgmt = new ManagementPlanningClient(client, config.label === 'Developer' ? 'developer' : 'uploader');

      const response = await mgmt.updateById('000000000000000000000000', {
        lsd: '2026-01-02',
        lfd: '2026-01-03',
        status: 'Pending' as never,
      });
      expect(response.status()).toBe(400);
      await expect(readError(response)).resolves.toMatch(/valid status/i);
    });

    test('updateById returns 400 for a well-formed but nonexistent id', async ({ clientAs }) => {
      const client = await clientAs('admin');
      const mgmt = new ManagementPlanningClient(client, config.label === 'Developer' ? 'developer' : 'uploader');

      const response = await mgmt.updateById('000000000000000000000000', {
        lsd: '2026-01-02',
        lfd: '2026-01-03',
        status: 'InProgress',
      });
      expect(response.status()).toBe(400);
      await expect(readError(response)).resolves.toBe(config.recordNotFoundMessage);
    });

    test('getById returns 404 for a well-formed but nonexistent id', async ({ clientAs }) => {
      const mgmt = new ManagementPlanningClient(await clientAs('admin'), config.label === 'Developer' ? 'developer' : 'uploader');
      const response = await mgmt.getById('000000000000000000000000');
      expect(response.status()).toBe(404);
      await expect(readError(response)).resolves.toBe(config.recordNotFoundMessage);
    });

    test('getAll returns 404 for filters matching nothing', async ({ clientAs }) => {
      const mgmt = new ManagementPlanningClient(await clientAs('admin'), config.label === 'Developer' ? 'developer' : 'uploader');
      const response = await mgmt.getAll({ companyId: '000000000000000000000000' });
      expect(response.status()).toBe(404);
      await expect(readError(response)).resolves.toBe(config.getAllEmptyMessage);
    });

    test('delete without a valid admin session is rejected', async ({ anonClient }) => {
      const mgmt = new ManagementPlanningClient(anonClient, config.label === 'Developer' ? 'developer' : 'uploader');
      const response = await mgmt.delete('000000000000000000000000');
      expect([401, 403]).toContain(response.status());
    });
  });
}

definePlanningSuite({
  label: 'Developer',
  assigneeField: 'contentDeveloperId',
  activityNameField: 'managementPreparationName',
  createActivity: (mgmt, companyId) => mgmt.createPreparation(buildManagementResource(companyId)),
  deleteActivity: (mgmt, id) => mgmt.deletePreparation(id),
  createSuccessMessage: 'Management planning preparation created successfully',
  updateBulkSuccessMessage: 'Management planning preparation updated successfully',
  updateByIdSuccessMessage: 'Management planning preparation updated successfully',
  activityNotFoundMessage: 'Selected management preparation activity not found!',
  duplicatePeriodMessage: 'Management planning preparation already exists for this period!',
  recordNotFoundMessage: 'Management planning preparation not found!',
  getAllEmptyMessage: 'No Management planning preparation found!',
  deleteSuccessMessage: 'Management planning preparation deleted successfully!',
});

definePlanningSuite({
  label: 'Uploader',
  assigneeField: 'contentUploaderId',
  activityNameField: 'managementUploadingName',
  createActivity: (mgmt, companyId) => mgmt.createUploading(buildManagementResource(companyId)),
  deleteActivity: (mgmt, id) => mgmt.deleteUploading(id),
  createSuccessMessage: 'Management uploading preparation created successfully',
  updateBulkSuccessMessage: 'Management uploading preparation updated successfully',
  updateByIdSuccessMessage: 'Management uploading preparation updated successfully',
  activityNotFoundMessage: 'Selected management uploading activity not found!',
  duplicatePeriodMessage: 'Management uploading preparation already exists for this period!',
  recordNotFoundMessage: 'Management uploading preparation not found!',
  getAllEmptyMessage: 'No Management uploading preparation found!',
  deleteSuccessMessage: 'Management uploading preparation deleted successfully!',
});
