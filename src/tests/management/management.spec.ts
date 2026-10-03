import { APIResponse } from '@playwright/test';
import { test, expect } from '../../fixtures/api.fixture';
import { ManagementClient, CreateManagementResourceInput, UpdateManagementResourceInput } from '../../client/management.client';
import { buildManagementResource } from '../../factories/management.factory';
import { managementDocSchema, managementListItemSchema } from '../../utils/validators/management.schema';
import { assertMatchesSchema } from '../../utils/schema-validator';
import { readError } from './support';
import { recordApiContext } from '../../utils/failure-context';
import { SEED } from '../../config/seed.constants';

test.describe.configure({ mode: 'parallel' });

/**
 * Preparations and Uploadings are structurally identical resources in the backend
 * (ManagementPreparation.controller.js / ManagementUploading.controller.js — read directly,
 * since swagger.json's schema for both is the generic `{type: object, example: {}}`).
 * Both are exercised through this one parameterized suite instead of duplicating ~15 tests.
 *
 * Several response messages below are copy-pasted from a third, unrelated resource name
 * ("ContentPreparation") or from the Preparations controller into the Uploadings controller —
 * confirmed in source, not a typo on our side. Asserting the actual current text so a fix
 * (or a further drift) shows up as a deliberate change, not a silent one.
 */
interface ResourceSuiteConfig {
  label: string;
  nameField: 'managementPreparationName' | 'managementUploadingName';
  create: (mgmt: ManagementClient, input: CreateManagementResourceInput) => Promise<APIResponse>;
  getAll: (mgmt: ManagementClient, companyId: string) => Promise<APIResponse>;
  getById: (mgmt: ManagementClient, id: string) => Promise<APIResponse>;
  update: (mgmt: ManagementClient, companyId: string, id: string, input: UpdateManagementResourceInput) => Promise<APIResponse>;
  del: (mgmt: ManagementClient, id: string) => Promise<APIResponse>;
  createSuccessMessage: string;
  createDuplicateMessage: string;
  updateDuplicateMessage: string;
  getAllEmptyMessage: string;
  getByIdNotFoundMessage: string;
  deleteNotFoundMessage: string;
  deleteSuccessMessage: string;
}

function defineManagementResourceSuite(config: ResourceSuiteConfig) {
  const docSchema = managementDocSchema(config.nameField);
  const listItemSchema = managementListItemSchema(config.nameField);

  test.describe(`Management — ${config.label}`, () => {
    // Resources created by a test but not explicitly deleted within it (e.g. because the
    // test is about a *different* resource that happens to require one to exist) are
    // tracked here and cleaned up afterward, per the isolation/cleanup rule in CLAUDE.md.
    const createdIds: string[] = [];

    test.afterEach(async ({ clientAs }) => {
      if (createdIds.length === 0) return;
      const mgmt = new ManagementClient(await clientAs('admin'));
      await Promise.all(createdIds.splice(0).map((id) => config.del(mgmt, id).catch(() => undefined)));
    });

    test('create rejects a missing/invalid companyId', async ({ clientAs }, testInfo) => {
      const mgmt = new ManagementClient(await clientAs('admin'));
      const response = await config.create(mgmt, { companyId: 'not-an-object-id', name: 'x' });
      recordApiContext(testInfo, { method: 'POST', endpoint: `management/${config.label}`, statusCode: response.status() });

      expect(response.status()).toBe(400);
      await expect(readError(response)).resolves.toMatch(/valid company id/i);
    });

    test('create rejects a missing name', async ({ clientAs }) => {
      const mgmt = new ManagementClient(await clientAs('admin'));
      const response = await config.create(mgmt, { companyId: SEED.COMPANY_ID, name: '' });

      expect(response.status()).toBe(400);
      await expect(readError(response)).resolves.toMatch(/valid management (preparation|uploading) name/i);
    });

    test('create rejects an anonymous request', async ({ anonClient }, testInfo) => {
      const mgmt = new ManagementClient(anonClient);
      const response = await config.create(mgmt, buildManagementResource(SEED.COMPANY_ID));
      recordApiContext(testInfo, { method: 'POST', endpoint: `management/${config.label}`, statusCode: response.status() });

      expect([401, 403]).toContain(response.status());
    });

    test('creates a resource, reads it back, updates it, then deletes it (full lifecycle)', async ({ clientAs }) => {
      const mgmt = new ManagementClient(await clientAs('admin'));
      const input = buildManagementResource(SEED.COMPANY_ID);

      const createResponse = await config.create(mgmt, input);
      expect(createResponse.status()).toBe(200);
      const createBody = await createResponse.json();
      expect(createBody.message).toBe(config.createSuccessMessage);
      const created = assertMatchesSchema(docSchema, createBody.data, `create ${config.label}`);
      expect(created[config.nameField]).toBe(input.name);
      expect(created.isRework).toBe(false);
      expect(created.active).toBe(true);

      const duplicateResponse = await config.create(mgmt, input);
      expect(duplicateResponse.status()).toBe(400);
      await expect(readError(duplicateResponse)).resolves.toBe(config.createDuplicateMessage);

      const getByIdResponse = await config.getById(mgmt, created._id);
      expect(getByIdResponse.status()).toBe(200);
      const fetched = assertMatchesSchema(listItemSchema, (await getByIdResponse.json()).data, `getById ${config.label}`);
      expect(fetched._id).toBe(created._id);
      expect(fetched.companyId._id).toBe(SEED.COMPANY_ID);

      const updatedName = `${input.name} (updated)`;
      const updateResponse = await config.update(mgmt, SEED.COMPANY_ID, created._id, { name: updatedName, isRework: true });
      expect(updateResponse.status()).toBe(200);
      const updated = assertMatchesSchema(docSchema, (await updateResponse.json()).data, `update ${config.label}`);
      expect(updated[config.nameField]).toBe(updatedName);
      expect(updated.isRework).toBe(true);

      const deleteResponse = await config.del(mgmt, created._id);
      expect(deleteResponse.status()).toBe(200);
      expect((await deleteResponse.json()).message).toBe(config.deleteSuccessMessage);

      // soft delete: active:false — must no longer appear via getById
      const afterDelete = await config.getById(mgmt, created._id);
      expect(afterDelete.status()).toBe(404);
    });

    test('update rejects a duplicate name within the same company', async ({ clientAs }) => {
      const mgmt = new ManagementClient(await clientAs('admin'));
      const first = await (await config.create(mgmt, buildManagementResource(SEED.COMPANY_ID))).json();
      const secondInput = buildManagementResource(SEED.COMPANY_ID);
      const second = await (await config.create(mgmt, secondInput)).json();
      createdIds.push(first.data._id, second.data._id);

      const response = await config.update(mgmt, SEED.COMPANY_ID, first.data._id, { name: secondInput.name });
      expect(response.status()).toBe(400);
      await expect(readError(response)).resolves.toBe(config.updateDuplicateMessage);
    });

    test('getById returns 404 for a well-formed but nonexistent id', async ({ clientAs }) => {
      const mgmt = new ManagementClient(await clientAs('admin'));
      const response = await config.getById(mgmt, '000000000000000000000000');

      expect(response.status()).toBe(404);
      await expect(readError(response)).resolves.toBe(config.getByIdNotFoundMessage);
    });

    test('getById rejects a malformed id', async ({ clientAs }) => {
      const mgmt = new ManagementClient(await clientAs('admin'));
      const response = await config.getById(mgmt, 'not-an-object-id');

      expect(response.status()).toBe(400);
      await expect(readError(response)).resolves.toMatch(/valid id/i);
    });

    test('getAll returns only resources for the requested company', async ({ clientAs }) => {
      const mgmt = new ManagementClient(await clientAs('admin'));
      const input = buildManagementResource(SEED.COMPANY_ID);
      const createBody = await (await config.create(mgmt, input)).json();
      createdIds.push(createBody.data._id);

      const response = await config.getAll(mgmt, SEED.COMPANY_ID);
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body.data)).toBe(true);
      for (const item of body.data) {
        assertMatchesSchema(listItemSchema, item, `getAll ${config.label} item`);
        expect(item.companyId._id).toBe(SEED.COMPANY_ID);
      }
      expect(body.data.some((item: { [k: string]: unknown }) => item[config.nameField] === input.name)).toBe(true);
    });

    test('getAll returns 404 for a company with no active resources', async ({ clientAs }, testInfo) => {
      const mgmt = new ManagementClient(await clientAs('admin'));
      const response = await config.getAll(mgmt, '000000000000000000000000');
      recordApiContext(testInfo, { method: 'GET', endpoint: `management/${config.label}`, statusCode: response.status() });

      // Confirmed live: an empty result set is modeled as 404, not 200+[] — asserting actual
      // behavior; a REST-style API would return 200 with an empty array here instead.
      expect(response.status()).toBe(404);
      await expect(readError(response)).resolves.toBe(config.getAllEmptyMessage);
    });

    test('delete without a valid admin session is rejected before the resource is touched', async ({ anonClient }) => {
      const mgmt = new ManagementClient(anonClient);
      const response = await config.del(mgmt, '000000000000000000000000');
      expect([401, 403]).toContain(response.status());
    });

    test('delete as admin returns 400 for a well-formed but nonexistent id', async ({ clientAs }) => {
      const mgmt = new ManagementClient(await clientAs('admin'));
      const response = await config.del(mgmt, '000000000000000000000000');
      expect(response.status()).toBe(400);
      await expect(readError(response)).resolves.toBe(config.deleteNotFoundMessage);
    });
  });
}

defineManagementResourceSuite({
  label: 'Preparations',
  nameField: 'managementPreparationName',
  create: (mgmt, input) => mgmt.createPreparation(input),
  getAll: (mgmt, companyId) => mgmt.getAllPreparations(companyId),
  getById: (mgmt, id) => mgmt.getPreparationById(id),
  update: (mgmt, companyId, id, input) => mgmt.updatePreparation(companyId, id, input),
  del: (mgmt, id) => mgmt.deletePreparation(id),
  createSuccessMessage: 'Management Preparation saved successfully',
  createDuplicateMessage: 'Management Preparation already exists',
  updateDuplicateMessage: 'Management Preparation already exists',
  getAllEmptyMessage: 'No Management Preparations found',
  getByIdNotFoundMessage: 'Management Preparation not found',
  deleteNotFoundMessage: 'Management Preparation not found!',
  deleteSuccessMessage: 'Management Preparation deleted successfully!',
});

defineManagementResourceSuite({
  label: 'Uploadings',
  nameField: 'managementUploadingName',
  create: (mgmt, input) => mgmt.createUploading(input),
  getAll: (mgmt, companyId) => mgmt.getAllUploadings(companyId),
  getById: (mgmt, id) => mgmt.getUploadingById(id),
  update: (mgmt, companyId, id, input) => mgmt.updateUploading(companyId, id, input),
  del: (mgmt, id) => mgmt.deleteUploading(id),
  // Confirmed in source: the Uploadings controller's success/not-found messages are
  // copy-pasted from Preparations — this is the API's real, current behavior.
  createSuccessMessage: 'Management Preparation saved successfully',
  createDuplicateMessage: 'Management Uploading Name already exists',
  updateDuplicateMessage: 'Management Uploading already exists',
  getAllEmptyMessage: 'No Management Preparations found',
  getByIdNotFoundMessage: 'Management Preparation not found',
  deleteNotFoundMessage: 'Management Uploading not found!',
  deleteSuccessMessage: 'Management Uploading deleted successfully!',
});
