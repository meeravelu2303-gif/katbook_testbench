import { test, expect } from '../../fixtures/api.fixture';
import { HighlighterClient } from '../../client/highlighter.client';
import { readError, getSelfUserId } from '../management/support';
import { CURRICULUM } from '../../config/seed.constants';

test.describe.configure({ mode: 'parallel' });

/**
 * Highlighter.controller.js — confirmed live: no auth on ANY route (v1 or v2), and
 * userLoginID is just an unverified caller-supplied body field, not tied to a real
 * session. SECURITY tests below confirm this is reachable, not just a source-reading
 * conclusion. Full create happy-path uses the real, verified curriculum Variable chain in
 * CURRICULUM (see seed.constants.ts for how it was discovered).
 */
const validCreatePayload = () => ({
  refInstID: '000000000000000000000001',
  refMediumID: '000000000000000000000002',
  refSectionID: '000000000000000000000003',
  refSubjectID: '000000000000000000000004',
  katUnitID: '000000000000000000000005', // deliberately nonexistent — see "rejects a nonexistent" test
  katSessionID: '000000000000000000000006',
  wordID: '000000000000000000000007',
  color: '#ffff00',
  highlightedText: 'sample text',
  userLoginID: '000000000000000000000008',
});

test.describe('Content — Highlighter', () => {
  test('SECURITY: create requires no authentication (anonymous request reaches real business logic)', async ({
    anonClient,
  }) => {
    const client = new HighlighterClient(anonClient);
    const response = await client.create(validCreatePayload());
    // Not 401/403 — the request reaches CreateHighlighter and fails only on business logic
    // (unit lookup), proving there is no auth gate at all.
    expect([401, 403]).not.toContain(response.status());
    await expect(readError(response)).resolves.toMatch(/unit was not exists/i);
  });

  test('BUG: create omits the HTTP status code on validation failure, so it responds 200 with success:false', async ({
    anonClient,
  }) => {
    // Highlighter.controller.js:41-43 — `ReE(res, {message: ...})` with no third argument;
    // ReE only calls res.statusCode = code when code is defined, so Express's default 200
    // is left in place despite the body being an error envelope.
    const client = new HighlighterClient(anonClient);
    const response = await client.create({});
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/please enter the required fields/i);
  });

  test('create rejects a nonexistent katUnitID', async ({ anonClient }) => {
    const client = new HighlighterClient(anonClient);
    const response = await client.create(validCreatePayload());
    expect(response.status()).toBe(404);
    await expect(readError(response)).resolves.toBe('requested unit was not exists. please check again');
  });

  test('full lifecycle with a real curriculum unit/session: create, getOne, getAll, update, delete', async ({
    anonClient,
    clientAs,
  }) => {
    const userLoginID = await getSelfUserId(await clientAs('admin'));
    const client = new HighlighterClient(anonClient); // no auth needed — see SECURITY tests
    const payload = {
      refInstID: CURRICULUM.INSTITUTION_TYPE_ID,
      refMediumID: CURRICULUM.COUNTRY_ID,
      refSectionID: CURRICULUM.TYPE_OF_BOOK_ID,
      refSubjectID: CURRICULUM.ATTRIBUTE_ID,
      katUnitID: CURRICULUM.UNIT_ID,
      katSessionID: CURRICULUM.SESSION_ID,
      wordID: '1',
      color: '#ffff00',
      highlightedText: 'qa-highlighter-lifecycle-probe',
      userLoginID,
    };

    const createResponse = await client.create(payload);
    expect(createResponse.status()).toBe(200);
    const created = (await createResponse.json()).data;
    expect(created.highlightedText).toBe(payload.highlightedText);

    const getOneResponse = await client.getOne({
      refInstID: payload.refInstID, refMediumID: payload.refMediumID, refSectionID: payload.refSectionID,
      refSubjectID: payload.refSubjectID, userLoginID, highlightedID: created._id, katSessionID: payload.katSessionID,
    });
    expect(getOneResponse.status()).toBe(200);

    const getAllResponse = await client.getAll({
      refInstID: payload.refInstID, refMediumID: payload.refMediumID, refSectionID: payload.refSectionID,
      refSubjectID: payload.refSubjectID, userLoginID,
    });
    expect(getAllResponse.status()).toBe(200);
    const allBody = await getAllResponse.json();
    expect(allBody.data.some((x: { _id: string }) => x._id === created._id)).toBe(true);

    const updateResponse = await client.update({ highlighterId: created._id, userLoginID, color: '#00ff00' });
    expect(updateResponse.status()).toBe(200);
    expect((await updateResponse.json()).data.color).toBe('#00ff00');

    const deleteResponse = await client.delete({ highlighterId: created._id, userLoginID });
    expect(deleteResponse.status()).toBe(200);

    const afterDelete = await client.getOne({
      refInstID: payload.refInstID, refMediumID: payload.refMediumID, refSectionID: payload.refSectionID,
      refSubjectID: payload.refSubjectID, userLoginID, highlightedID: created._id, katSessionID: payload.katSessionID,
    });
    expect(afterDelete.status()).toBe(404);
  });

  test('getOne reports missing required fields with 400 (unlike create)', async ({ anonClient }) => {
    const client = new HighlighterClient(anonClient);
    const response = await client.getOne({});
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toMatch(/please enter the required fields/i);
  });

  test('getOne returns 404 for a nonexistent highlighter', async ({ anonClient }) => {
    const client = new HighlighterClient(anonClient);
    const response = await client.getOne({
      refInstID: 'a', refMediumID: 'b', refSectionID: 'c', refSubjectID: 'd',
      userLoginID: 'e', highlightedID: '000000000000000000000000',
      katSessionID: '000000000000000000000000', // must be well-formed — see BUG test below
    });
    expect(response.status()).toBe(404);
    await expect(readError(response)).resolves.toBe('requested data was not exists');
  });

  test('BUG: getOne returns 500 instead of 400 for a malformed katSessionID', async ({ anonClient }) => {
    // katSessionID is an ObjectId-typed ref (highlighter.model.js:34-38), but
    // GetOneHighlightedWord never format-checks it before querying — unlike refInstID/
    // refMediumID/refSectionID/refSubjectID/userLoginID, which are plain Strings in the
    // schema and tolerate any value. A non-hex value here trips a Mongoose CastError that
    // propagates straight to the client as a raw 500, instead of a handled 400.
    const client = new HighlighterClient(anonClient);
    const response = await client.getOne({
      refInstID: 'a', refMediumID: 'b', refSectionID: 'c', refSubjectID: 'd',
      userLoginID: 'e', highlightedID: '000000000000000000000000', katSessionID: 'not-an-object-id',
    });
    expect(response.status()).toBe(500);
  });

  test('getAll reports missing required fields with 400', async ({ anonClient }) => {
    const client = new HighlighterClient(anonClient);
    const response = await client.getAll({});
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toMatch(/please enter the required fields/i);
  });

  test('getAll returns 404 when nothing matches', async ({ anonClient }) => {
    const client = new HighlighterClient(anonClient);
    const response = await client.getAll({
      refInstID: 'a', refMediumID: 'b', refSectionID: 'c', refSubjectID: 'd', userLoginID: 'nobody',
    });
    expect(response.status()).toBe(404);
    await expect(readError(response)).resolves.toBe('requested data was not exists');
  });

  test('update reports missing required fields with 400', async ({ anonClient }) => {
    const client = new HighlighterClient(anonClient);
    const response = await client.update({});
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toMatch(/please enter the required fields/i);
  });

  test('update returns 404 for a nonexistent highlighter', async ({ anonClient }) => {
    const client = new HighlighterClient(anonClient);
    const response = await client.update({
      highlighterId: '000000000000000000000000', userLoginID: 'nobody', color: '#000000',
    });
    expect(response.status()).toBe(404);
    await expect(readError(response)).resolves.toBe('requested highlighter id was not exists');
  });

  test('SECURITY: delete requires no authentication or ownership proof (404 not 401/403)', async ({ anonClient }) => {
    const client = new HighlighterClient(anonClient);
    const response = await client.delete({ highlighterId: '000000000000000000000000', userLoginID: 'anyone' });
    expect([401, 403]).not.toContain(response.status());
    expect(response.status()).toBe(404);
    await expect(readError(response)).resolves.toBe('requested highlighter id was not exists');
  });
});
