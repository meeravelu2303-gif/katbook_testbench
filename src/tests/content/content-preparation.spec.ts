import { test, expect } from '../../fixtures/api.fixture';
import { ContentPreparationClient } from '../../client/content-preparation.client';
import { buildContentPreparationName } from '../../factories/content.factory';
import { readError } from '../management/support';
import { SEED } from '../../config/seed.constants';

test.describe.configure({ mode: 'parallel' });

/**
 * ContentPreparationController.js / ContentUploadingController.js — "activity name"
 * resources for content authoring (distinct from management.spec.ts's management
 * preparations/uploadings, and from these controllers' own variableId+developerId-scoped
 * name-by-year lookup endpoints, which need a real curriculum Variable +
 * PlanningPreparation/PlanningUploading record — deferred, same reason as
 * Highlighter/Hyperlink's create). Create/Update/Delete are admin-gated (usertype.code ===
 * 'MA@1'); the getAll/getById routes only need a valid session. All routes use needsAuth.
 */
interface VariantConfig {
  label: string;
  variant: 'preparation' | 'uploading';
  nameField: 'contentPreparationName' | 'contentUploadingName';
  /** getAllByCompany's list key differs per controller — confirmed in source, not a typo. */
  listField: 'data' | 'contentUploadingName';
  createSuccessMessage: string;
  notFoundMessage: string;
  deleteNotFoundMessage: string;
}

function defineSuite(config: VariantConfig) {
  async function findCreated(client: ContentPreparationClient, name: string) {
    const response = await client.getAllByCompany(SEED.COMPANY_ID);
    const body = await response.json();
    const list = body[config.listField] as Array<Record<string, unknown>>;
    return list.find((x) => x[config.nameField] === name);
  }

  test.describe(`Content — ${config.label} activity names`, () => {
    test('create rejects an anonymous request', async ({ anonClient }) => {
      const client = new ContentPreparationClient(anonClient, config.variant);
      const response = await client.create(buildContentPreparationName(SEED.COMPANY_ID));
      expect([401, 403]).toContain(response.status());
    });

    test('create rejects a missing companyId', async ({ clientAs }) => {
      const client = new ContentPreparationClient(await clientAs('admin'), config.variant);
      const response = await client.create({ companyId: '', name: 'x' });
      expect(response.status()).toBe(400);
      await expect(readError(response)).resolves.toBe('Please select the company!.');
    });

    test('create rejects a name shorter than 3 characters', async ({ clientAs }) => {
      const client = new ContentPreparationClient(await clientAs('admin'), config.variant);
      const response = await client.create({ companyId: SEED.COMPANY_ID, name: 'ab' });
      expect(response.status()).toBe(400);
      await expect(readError(response)).resolves.toMatch(/more then 5 character/i);
    });

    test('BUG: a 4-character name is accepted despite the error message claiming "more then 5 character" is required', async ({
      clientAs,
    }) => {
      // The actual check is `.length < 3`, not `< 5` — the message and the logic disagree.
      const client = new ContentPreparationClient(await clientAs('admin'), config.variant);
      const fourChars = `q${String(Date.now()).slice(-3)}`; // always exactly 4 chars
      const input = { companyId: SEED.COMPANY_ID, name: fourChars, isRework: false };
      const response = await client.create(input);
      expect(response.status()).toBe(200);

      const created = await findCreated(client, input.name);
      expect(created).toBeTruthy();
      await client.delete(SEED.COMPANY_ID, (created as { _id: string })._id);
    });

    test('full lifecycle: create, getAllByCompany, getById, update, delete', async ({ clientAs }) => {
      const client = new ContentPreparationClient(await clientAs('admin'), config.variant);
      const input = buildContentPreparationName(SEED.COMPANY_ID);

      const createResponse = await client.create(input);
      expect(createResponse.status()).toBe(200);
      expect((await createResponse.json()).message).toBe(config.createSuccessMessage);

      const created = (await findCreated(client, input.name)) as { _id: string } | undefined;
      expect(created).toBeTruthy();
      const createdId = created!._id;

      const getByIdResponse = await client.getById(SEED.COMPANY_ID, createdId);
      expect(getByIdResponse.status()).toBe(200);

      const updatedName = `${input.name} v2`;
      const updateResponse = await client.update(SEED.COMPANY_ID, createdId, { name: updatedName, isRework: true });
      expect(updateResponse.status()).toBe(200);

      const deleteResponse = await client.delete(SEED.COMPANY_ID, createdId);
      expect(deleteResponse.status()).toBe(200);

      const afterDelete = await client.getById(SEED.COMPANY_ID, createdId);
      expect(afterDelete.status()).toBe(400);
      await expect(readError(afterDelete)).resolves.toBe(config.notFoundMessage);
    });

    test('getById returns 400 for a well-formed but nonexistent id', async ({ clientAs }) => {
      const client = new ContentPreparationClient(await clientAs('admin'), config.variant);
      const response = await client.getById(SEED.COMPANY_ID, '000000000000000000000000');
      expect(response.status()).toBe(400);
      await expect(readError(response)).resolves.toBe(config.notFoundMessage);
    });

    test('delete returns 400 for a well-formed but nonexistent id', async ({ clientAs }) => {
      const client = new ContentPreparationClient(await clientAs('admin'), config.variant);
      const response = await client.delete(SEED.COMPANY_ID, '000000000000000000000000');
      expect(response.status()).toBe(400);
      await expect(readError(response)).resolves.toBe(config.deleteNotFoundMessage);
    });

    test('getAllByCompany requires an authenticated session', async ({ anonClient }) => {
      const client = new ContentPreparationClient(anonClient, config.variant);
      const response = await client.getAllByCompany(SEED.COMPANY_ID);
      expect([401, 403]).toContain(response.status());
    });
  });
}

defineSuite({
  label: 'Preparation',
  variant: 'preparation',
  nameField: 'contentPreparationName',
  listField: 'data',
  createSuccessMessage: 'Content Perparation activity was created!',
  notFoundMessage: 'Content Perparation activity not found!',
  deleteNotFoundMessage: 'Content Perparation Name not found!',
});

defineSuite({
  label: 'Uploading',
  variant: 'uploading',
  nameField: 'contentUploadingName',
  // Confirmed in source (ContentUploadingController.js): this one returns the list under
  // `contentUploadingName`, not `data` — inconsistent with its Preparation-side mirror.
  listField: 'contentUploadingName',
  createSuccessMessage: 'Content Uploading activity was created!',
  notFoundMessage: 'Content Uploading activity not found!',
  deleteNotFoundMessage: 'Content Uploading Name not found!',
});
