import { test, expect } from '../../fixtures/api.fixture';
import { VideoScriptClient } from '../../client/videoscript.client';
import { forgeUnsignedToken } from '../../utils/forge-jwt';
import { readError } from '../management/support';
import { SEED, CURRICULUM } from '../../config/seed.constants';

test.describe.configure({ mode: 'parallel' });

/**
 * videoscript.controller.js — create/delete use needsAuth (routes/v1.js:407,410);
 * getById/getAllVideoScripts use `authToken` (routes/v1.js:408-409), which decodes JWTs
 * with jwt.decode() and never checks the signature (middleware/tokenparser.js:5-35) — the
 * SECURITY tests below prove this is exploitable, not just a source-reading conclusion.
 * Uses the real, verified curriculum chain from CURRICULUM (see seed.constants.ts).
 */
function buildScript(overrides: Partial<Parameters<VideoScriptClient['create']>[0]> = {}) {
  return {
    companyId: SEED.COMPANY_ID,
    typeOfBookId: CURRICULUM.TYPE_OF_BOOK_ID,
    countryId: CURRICULUM.COUNTRY_ID,
    institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
    attributeId: CURRICULUM.ATTRIBUTE_ID,
    tierDetails: [{ tierId: CURRICULUM.TIER_1_ID }],
    variableDetails: [{ variableId: CURRICULUM.TOP_VARIABLE_ID }],
    title: 'qa-video-script-test',
    content: 'Sample script content for the automated test bench.',
    videotype: 'explainer',
    ...overrides,
  };
}

test.describe('Content — VideoScript', () => {
  test('create rejects an anonymous request', async ({ anonClient }) => {
    const client = new VideoScriptClient(anonClient);
    const response = await client.create(buildScript());
    expect([401, 403]).toContain(response.status());
  });

  test('create rejects a missing typeOfBookId', async ({ clientAs }) => {
    const client = new VideoScriptClient(await clientAs('admin'));
    const response = await client.create(buildScript({ typeOfBookId: '' }));
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('Please select type of book!');
  });

  test('create rejects a nonexistent attributeId', async ({ clientAs }) => {
    const client = new VideoScriptClient(await clientAs('admin'));
    const response = await client.create(buildScript({ attributeId: '000000000000000000000000' }));
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('Attribute not found!');
  });

  test('full lifecycle with real curriculum data: create, getById (authToken), delete', async ({ clientAs }) => {
    const client = new VideoScriptClient(await clientAs('admin'));
    const input = buildScript();

    const createResponse = await client.create(input);
    expect(createResponse.status()).toBe(200);
    const created = (await createResponse.json()).data;
    expect(created.title).toBe(input.title);

    // getById is authToken-protected, not needsAuth — a real bearer token still works fine
    // (it's just that the middleware never actually checks it — see the SECURITY test below).
    const getByIdResponse = await client.getById(created._id);
    expect(getByIdResponse.status()).toBe(200);

    const deleteResponse = await client.delete(created._id);
    expect(deleteResponse.status()).toBe(200);

    const afterDelete = await client.getById(created._id);
    expect(afterDelete.status()).toBe(400);
  });

  test('SECURITY: getById accepts a forged, unsigned JWT with no real signature', async ({ anonClient, clientAs }) => {
    // Create a real script first (needs needsAuth), then read it back using a completely
    // fabricated token that was never issued by this server.
    const admin = new VideoScriptClient(await clientAs('admin'));
    const created = (await (await admin.create(buildScript())).json()).data;

    const client = new VideoScriptClient(anonClient);
    const forged = forgeUnsignedToken({ userId: '000000000000000000000001' });
    const response = await client.getById(created._id, forged);
    expect(response.status()).toBe(200);
    expect((await response.json()).data._id).toBe(created._id);

    await admin.delete(created._id);
  });

  test('SECURITY: getById rejects a request with no Authorization header at all', async ({ anonClient }) => {
    const client = new VideoScriptClient(anonClient);
    const response = await client.getById('000000000000000000000000');
    expect(response.status()).toBe(401);
    await expect(readError(response)).resolves.toBe('please request with a valid token');
  });

  test('SECURITY: getAllVideoScripts accepts a forged, unsigned JWT', async ({ anonClient }) => {
    const client = new VideoScriptClient(anonClient);
    const forged = forgeUnsignedToken();
    const response = await client.getAll(
      {
        countryId: CURRICULUM.COUNTRY_ID,
        typeOfBookId: CURRICULUM.TYPE_OF_BOOK_ID,
        institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
        companyId: SEED.COMPANY_ID,
      },
      {},
      forged,
    );
    expect(response.status()).not.toBe(401);
  });

  test('getById rejects a malformed id', async ({ clientAs }) => {
    const client = new VideoScriptClient(await clientAs('admin'));
    const response = await client.getById('not-an-object-id');
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('Please select video script id!.');
  });

  test('delete returns 400 for a well-formed but nonexistent id', async ({ clientAs }) => {
    const client = new VideoScriptClient(await clientAs('admin'));
    const response = await client.delete('000000000000000000000000');
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('Script was not found!.');
  });
});
