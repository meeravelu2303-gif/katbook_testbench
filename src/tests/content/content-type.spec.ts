import { test, expect } from '../../fixtures/api.fixture';
import { ContentTypeClient } from '../../client/content-type.client';
import { buildContentType } from '../../factories/content.factory';
import { contentTypeDocSchema } from '../../utils/validators/content.schema';
import { assertMatchesSchema } from '../../utils/schema-validator';
import { readError } from '../management/support';
import { SEED } from '../../config/seed.constants';

test.describe.configure({ mode: 'parallel' });

/**
 * ContentType.controller.js — read directly (swagger only lists required field names, not
 * validation order/messages). Create/Update/Delete require the caller's usertype
 * code === 'MA@1' (admin-only, same gate as management.spec.ts); GetAll only requires any
 * valid session.
 */
test.describe('Content — ContentType', () => {
  test('create rejects an anonymous request', async ({ anonClient }) => {
    const client = new ContentTypeClient(anonClient);
    const response = await client.create(buildContentType(SEED.COMPANY_ID));
    expect([401, 403]).toContain(response.status());
  });

  test('create reports every missing required field at once', async ({ clientAs }) => {
    const client = new ContentTypeClient(await clientAs('admin'));
    // @ts-expect-error intentionally sending an incomplete payload to exercise validation
    const response = await client.create({});
    expect(response.status()).toBe(400);
    const error = await readError(response);
    expect(error).toMatch(/vaild required feilds/i);
    for (const field of ['companyId', 'contentName', 'contentType', 'mappingType']) {
      expect(error).toContain(field);
    }
  });

  test('create rejects a contentName shorter than 4 characters', async ({ clientAs }) => {
    const client = new ContentTypeClient(await clientAs('admin'));
    const response = await client.create({ ...buildContentType(SEED.COMPANY_ID), contentName: 'abc' });
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toMatch(/content name with more/i);
  });

  test('create rejects a contentType shorter than 4 characters', async ({ clientAs }) => {
    const client = new ContentTypeClient(await clientAs('admin'));
    const response = await client.create({ ...buildContentType(SEED.COMPANY_ID), contentType: 'abc' });
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toMatch(/content type with more/i);
  });

  test('create rejects a mappingType outside Unit/Session', async ({ clientAs }) => {
    const client = new ContentTypeClient(await clientAs('admin'));
    const response = await client.create({ ...buildContentType(SEED.COMPANY_ID), mappingType: 'Garbage' as never });
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toMatch(/vaild content mapping type/i);
  });

  test('full lifecycle: create, appears in getAll, delete (admin)', async ({ clientAs }) => {
    const client = new ContentTypeClient(await clientAs('admin'));
    const input = buildContentType(SEED.COMPANY_ID);

    const createResponse = await client.create(input);
    expect(createResponse.status()).toBe(200);
    expect((await createResponse.json()).message).toBe('Content type was created successfully!.');

    const getAllResponse = await client.getAll(SEED.COMPANY_ID);
    expect(getAllResponse.status()).toBe(200);
    const body = await getAllResponse.json();
    const created = body.contentType.find((c: { contentName: string }) => c.contentName === input.contentName);
    expect(created).toBeTruthy();
    const doc = assertMatchesSchema(contentTypeDocSchema, created, 'ContentType list item');
    expect(doc.mappingType).toBe('Unit');

    const duplicateResponse = await client.create(input);
    expect(duplicateResponse.status()).toBe(400);
    await expect(readError(duplicateResponse)).resolves.toBe('Content Name was already taken!.');

    const deleteResponse = await client.delete(doc._id);
    expect(deleteResponse.status()).toBe(200);
    expect((await deleteResponse.json()).message).toBe('Content Type was deleted!.');
  });

  test('BUG: update rejects switching to a valid mappingType but accepts an arbitrary invalid one', async ({
    clientAs,
  }) => {
    // ContentType.controller.js:178-181 — the check is inverted:
    //   if (CONFIG.contentMap.includes(mappingType)) return ReE(...)   // should be `!includes`
    // so a *valid* target ('Session') is rejected, while any garbage string sails through
    // and gets persisted. Documented here as a defect, not desired behavior.
    const client = new ContentTypeClient(await clientAs('admin'));
    const input = buildContentType(SEED.COMPANY_ID); // mappingType: 'Unit'
    const createBody = await (await client.create(input)).json();
    const getAllBody = await (await client.getAll(SEED.COMPANY_ID)).json();
    const created = getAllBody.contentType.find((c: { contentName: string }) => c.contentName === input.contentName);

    const rejectsValidTarget = await client.update({ contentTypeId: created._id, mappingType: 'Session' });
    expect(rejectsValidTarget.status()).toBe(400);
    await expect(readError(rejectsValidTarget)).resolves.toMatch(/vaild content mapping type/i);

    const acceptsGarbage = await client.update({ contentTypeId: created._id, mappingType: 'NotARealMappingType' });
    expect(acceptsGarbage.status()).toBe(200);

    const afterUpdate = await client.getAll(SEED.COMPANY_ID);
    const updated = (await afterUpdate.json()).contentType.find((c: { _id: string }) => c._id === created._id);
    expect(updated.mappingType).toBe('NotARealMappingType');

    await client.delete(created._id);
    void createBody;
  });

  test('getAll requires an authenticated session', async ({ anonClient }) => {
    const client = new ContentTypeClient(anonClient);
    const response = await client.getAll(SEED.COMPANY_ID);
    expect([401, 403]).toContain(response.status());
  });

  test('getAll returns 400 for a nonexistent company', async ({ clientAs }) => {
    const client = new ContentTypeClient(await clientAs('admin'));
    const response = await client.getAll('000000000000000000000000');
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('Company not found!');
  });

  test('getAll returns 400 for a real company with zero active content types', async ({ clientAs }) => {
    // company.controller.js's DELETE route throws (references an unimported `UserType`),
    // so this throwaway company can't be reliably cleaned up — best-effort only.
    const admin = await clientAs('admin');
    const client = new ContentTypeClient(admin);
    const companyName = `qa-${Date.now()}-empty-content-type-co`;
    const createCompanyResponse = await admin.post('/v1/company/add', { data: { companyName } });
    const companyId = (await createCompanyResponse.json()).company._id;

    const response = await client.getAll(companyId);
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('Content Type was empty!.');

    await admin.delete(`/v1/company/${companyId}`).catch(() => undefined);
  });

  test('delete returns 400 for a well-formed but nonexistent id', async ({ clientAs }) => {
    const client = new ContentTypeClient(await clientAs('admin'));
    const response = await client.delete('000000000000000000000000');
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('Content Type was not found!');
  });
});
