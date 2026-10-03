import { test, expect } from '../../fixtures/api.fixture';
import { ContentClient } from '../../client/content.client';
import { readError } from '../management/support';
import { SEED, CURRICULUM } from '../../config/seed.constants';

test.describe.configure({ mode: 'parallel' });

/**
 * content.controller.js — the 6 core CRUD ops. This controller has ~50+ routes total (text
 * search, PDF/RAG pipelines, video uploads, publishing...); per direction, only these 6
 * get full validation/not-found/auth coverage now, the rest get lean auth-boundary coverage
 * in content-core-auth-matrix.spec.ts.
 *
 * createContent's real prerequisite — undocumented anywhere, discovered by inspecting a
 * real pre-existing KAudio log's populated Variable (see CURRICULUM.TIER_2_ID in
 * seed.constants.ts): the target `variableDetails[].variableId` must already have
 * `coverImage` and `language` set. CURRICULUM.UNIT_ID has both; CURRICULUM.TOP_VARIABLE_ID
 * does not — both are exercised below, deliberately, to cover the real happy path and lock
 * in the validation behavior for a variable that's missing the prerequisite.
 */
function buildContent(overrides: Partial<Parameters<ContentClient['create']>[0]> = {}) {
  return {
    companyId: SEED.COMPANY_ID,
    typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
    countryId: CURRICULUM.COUNTRY_ID,
    institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
    attributeId: CURRICULUM.ATTRIBUTE_ID,
    tierDetails: [{ tierId: CURRICULUM.TIER_2_ID }],
    variableDetails: [{ variableId: CURRICULUM.UNIT_ID }],
    contentType: 'text',
    content: 'qa-content-probe',
    ...overrides,
  };
}

test.describe('Content — core ContentController CRUD', () => {
  test('create rejects an anonymous request', async ({ anonClient }) => {
    const client = new ContentClient(anonClient);
    const response = await client.create(buildContent());
    expect([401, 403]).toContain(response.status());
  });

  test('create rejects a missing typeOfBook', async ({ clientAs }) => {
    const client = new ContentClient(await clientAs('admin'));
    const response = await client.create(buildContent({ typeOfBook: '' }));
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('Please select type of book!');
  });

  test('create rejects a nonexistent attributeId', async ({ clientAs }) => {
    const client = new ContentClient(await clientAs('admin'));
    const response = await client.create(buildContent({ attributeId: '000000000000000000000000' }));
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('Attribute not found!');
  });

  test('create rejects a variable lacking coverImage/language (TOP_VARIABLE_ID, documents the real prerequisite)', async ({
    clientAs,
  }) => {
    const client = new ContentClient(await clientAs('admin'));
    const response = await client.create(
      buildContent({ tierDetails: [{ tierId: CURRICULUM.TIER_1_ID }], variableDetails: [{ variableId: CURRICULUM.TOP_VARIABLE_ID }] }),
    );
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('Variable was mismatched!');
  });

  test('full lifecycle with a real content-capable variable: create, getById, getInfo, update, getAll, delete', async ({
    clientAs,
  }) => {
    const client = new ContentClient(await clientAs('admin'));
    const input = buildContent();

    const createResponse = await client.create(input);
    expect(createResponse.status()).toBe(200);
    const createBody = await createResponse.json();
    // Response field is `content` — yet another naming convention distinct from `data`
    // (management/ContentType/VideoScript/HandBook) and `linkContent` (ContentLink).
    const created = createBody.content;
    expect(created.content).toBe(input.content);
    expect(created.contentType).toBe(input.contentType);

    const getByIdResponse = await client.getById(created._id);
    expect(getByIdResponse.status()).toBe(200);

    const getInfoResponse = await client.getInfo(
      created._id,
      CURRICULUM.TYPE_OF_BOOK_ID,
      CURRICULUM.COUNTRY_ID,
      CURRICULUM.INSTITUTION_TYPE_ID,
      SEED.COMPANY_ID,
    );
    expect(getInfoResponse.status()).toBe(200);

    const updateResponse = await client.update(
      created._id,
      CURRICULUM.COUNTRY_ID,
      CURRICULUM.INSTITUTION_TYPE_ID,
      SEED.COMPANY_ID,
      {
        content: `${input.content}-updated`,
        audioUrl: '',
        processedTypeId: '',
        processedOccurrenceType: '',
        processedKeywords: '',
        updateModule: 'content',
      },
    );
    expect(updateResponse.status()).toBe(200);

    const getAllResponse = await client.getAll(
      CURRICULUM.COUNTRY_ID,
      CURRICULUM.TYPE_OF_BOOK_ID,
      CURRICULUM.INSTITUTION_TYPE_ID,
      SEED.COMPANY_ID,
      [{ variableId: CURRICULUM.UNIT_ID }],
    );
    expect(getAllResponse.status()).toBe(200);

    const deleteResponse = await client.delete(created._id, CURRICULUM.COUNTRY_ID, CURRICULUM.INSTITUTION_TYPE_ID, SEED.COMPANY_ID);
    expect(deleteResponse.status()).toBe(200);
    expect((await deleteResponse.json()).message).toBe('Text Book / Notes deleted!');

    const afterDelete = await client.getById(created._id);
    expect(afterDelete.status()).toBe(404);
  });

  test('SECURITY: create response leaks the password hash via createdBy/updatedBy', async ({ clientAs }) => {
    // 6th confirmed instance of this pattern — see sections 9/11/12 of TEST_STRATEGY.md.
    const client = new ContentClient(await clientAs('admin'));
    const createResponse = await client.create(buildContent());
    const created = (await createResponse.json()).content;
    try {
      expect(created.createdBy).not.toHaveProperty('password');
      expect(created.updatedBy).not.toHaveProperty('password');
    } finally {
      await client.delete(created._id, CURRICULUM.COUNTRY_ID, CURRICULUM.INSTITUTION_TYPE_ID, SEED.COMPANY_ID);
    }
  });

  test('getById rejects an anonymous request', async ({ anonClient }) => {
    const client = new ContentClient(anonClient);
    const response = await client.getById('000000000000000000000000');
    expect([401, 403]).toContain(response.status());
  });

  test('getById rejects a malformed id', async ({ clientAs }) => {
    const client = new ContentClient(await clientAs('admin'));
    const response = await client.getById('not-an-object-id');
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('enter a valid contentId');
  });

  test('getById returns 404 for a well-formed but nonexistent id', async ({ clientAs }) => {
    const client = new ContentClient(await clientAs('admin'));
    const response = await client.getById('000000000000000000000000');
    expect(response.status()).toBe(404);
    await expect(readError(response)).resolves.toBe('Requested content does not have variable details');
  });

  test('getInfo rejects an anonymous request', async ({ anonClient }) => {
    const client = new ContentClient(anonClient);
    const response = await client.getInfo(
      '000000000000000000000000',
      CURRICULUM.TYPE_OF_BOOK_ID,
      CURRICULUM.COUNTRY_ID,
      CURRICULUM.INSTITUTION_TYPE_ID,
      SEED.COMPANY_ID,
    );
    expect([401, 403]).toContain(response.status());
  });

  test('getInfo returns 400 for a well-formed but nonexistent contentId', async ({ clientAs }) => {
    const client = new ContentClient(await clientAs('admin'));
    const response = await client.getInfo(
      '000000000000000000000000',
      CURRICULUM.TYPE_OF_BOOK_ID,
      CURRICULUM.COUNTRY_ID,
      CURRICULUM.INSTITUTION_TYPE_ID,
      SEED.COMPANY_ID,
    );
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('No matches found!');
  });

  test('update rejects an anonymous request', async ({ anonClient }) => {
    const client = new ContentClient(anonClient);
    const response = await client.update(
      '000000000000000000000000',
      CURRICULUM.COUNTRY_ID,
      CURRICULUM.INSTITUTION_TYPE_ID,
      SEED.COMPANY_ID,
      { content: 'x' },
    );
    expect([401, 403]).toContain(response.status());
  });

  test('delete rejects an anonymous request', async ({ anonClient }) => {
    const client = new ContentClient(anonClient);
    const response = await client.delete(
      '000000000000000000000000',
      CURRICULUM.COUNTRY_ID,
      CURRICULUM.INSTITUTION_TYPE_ID,
      SEED.COMPANY_ID,
    );
    expect([401, 403]).toContain(response.status());
  });

  test('delete returns 400 for a well-formed but nonexistent id', async ({ clientAs }) => {
    const client = new ContentClient(await clientAs('admin'));
    const response = await client.delete(
      '000000000000000000000000',
      CURRICULUM.COUNTRY_ID,
      CURRICULUM.INSTITUTION_TYPE_ID,
      SEED.COMPANY_ID,
    );
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('No matches found!');
  });

  test('getAll rejects an anonymous request', async ({ anonClient }) => {
    const client = new ContentClient(anonClient);
    const response = await client.getAll(
      CURRICULUM.COUNTRY_ID,
      CURRICULUM.TYPE_OF_BOOK_ID,
      CURRICULUM.INSTITUTION_TYPE_ID,
      SEED.COMPANY_ID,
      [{ variableId: CURRICULUM.TOP_VARIABLE_ID }],
    );
    expect([401, 403]).toContain(response.status());
  });

  test('getAll rejects a missing variables list', async ({ clientAs }) => {
    const client = new ContentClient(await clientAs('admin'));
    const response = await client.getAll(
      CURRICULUM.COUNTRY_ID,
      CURRICULUM.TYPE_OF_BOOK_ID,
      CURRICULUM.INSTITUTION_TYPE_ID,
      SEED.COMPANY_ID,
      undefined as never,
    );
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('Please select variables!');
  });
});
