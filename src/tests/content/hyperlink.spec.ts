import { test, expect } from '../../fixtures/api.fixture';
import { HyperlinkClient } from '../../client/hyperlink.client';
import { readError, getSelfUserId } from '../management/support';
import { CURRICULUM } from '../../config/seed.constants';

test.describe.configure({ mode: 'parallel' });

/**
 * hyperlink.controller.js — confirmed live: no auth on ANY route (v1 or v2). Worse than
 * Highlighter: Update/Delete don't even filter by userLoginID when looking up the record
 * (`Hyperlink.findOne({_id: hyperlinkID, active:true})`, no userLoginID in the query) — any
 * caller who knows/guesses an id can modify or delete it, full stop. Create happy-path uses
 * the real, verified curriculum Variable chain in CURRICULUM (see seed.constants.ts).
 */
const validCreatePayload = () => ({
  refInstID: '000000000000000000000001',
  refMediumID: '000000000000000000000002',
  refSubjectID: '000000000000000000000003',
  refSectionID: '000000000000000000000004',
  katUnitID: '000000000000000000000005', // deliberately nonexistent
  katSessionID: '000000000000000000000006',
  userLoginID: '000000000000000000000007',
  hyperlinkText: 'sample',
  hyperlinkUnit: '000000000000000000000008',
  hyperlinkSession: '000000000000000000000009',
  hyperlinkLabel: 'label',
});

test.describe('Content — Hyperlink', () => {
  test('create reports missing required fields with 400', async ({ anonClient }) => {
    const client = new HyperlinkClient(anonClient);
    const response = await client.create({});
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toMatch(/please enter the required fields/i);
  });

  test('SECURITY: create requires no authentication, and rejects a nonexistent katUnitID', async ({ anonClient }) => {
    const client = new HyperlinkClient(anonClient);
    const response = await client.create(validCreatePayload());
    expect([401, 403]).not.toContain(response.status());
    expect(response.status()).toBe(404);
    await expect(readError(response)).resolves.toBe('requested unit was not exists. please check again');
  });

  test('full lifecycle with a real curriculum unit/session: create, getOne, getAll, update, delete', async ({
    anonClient,
    clientAs,
  }) => {
    const userLoginID = await getSelfUserId(await clientAs('admin'));
    const client = new HyperlinkClient(anonClient); // no auth needed — see SECURITY tests
    const payload = {
      refInstID: CURRICULUM.INSTITUTION_TYPE_ID,
      refMediumID: CURRICULUM.COUNTRY_ID,
      refSubjectID: CURRICULUM.ATTRIBUTE_ID,
      refSectionID: CURRICULUM.TYPE_OF_BOOK_ID,
      katUnitID: CURRICULUM.UNIT_ID,
      katSessionID: CURRICULUM.SESSION_ID,
      userLoginID,
      hyperlinkText: 'qa-hyperlink-lifecycle-probe',
      hyperlinkUnit: CURRICULUM.UNIT_ID,
      hyperlinkSession: CURRICULUM.SESSION_ID,
      hyperlinkLabel: 'qa-label',
    };

    const createResponse = await client.create(payload);
    expect(createResponse.status()).toBe(200);
    const created = (await createResponse.json()).data;
    expect(created.hyperlinkText).toBe(payload.hyperlinkText);

    const getOneResponse = await client.getOne({
      hyperlinkID: created._id, refInstID: payload.refInstID, refMediumID: payload.refMediumID,
      refSectionID: payload.refSectionID, refSubjectID: payload.refSubjectID, userLoginID,
    });
    expect(getOneResponse.status()).toBe(200);

    const getAllResponse = await client.getAll({
      refInstID: payload.refInstID, refMediumID: payload.refMediumID, refSubjectID: payload.refSubjectID,
      refSectionID: payload.refSectionID, userLoginID,
    });
    expect(getAllResponse.status()).toBe(200);
    const allBody = await getAllResponse.json();
    expect(allBody.data.some((x: { _id: string }) => x._id === created._id)).toBe(true);

    const updateResponse = await client.update({
      hyperlinkID: created._id, hyperlinkLabel: 'qa-label-updated',
      hyperlinkUnit: CURRICULUM.UNIT_ID, hyperlinkSession: CURRICULUM.SESSION_ID,
    });
    expect(updateResponse.status()).toBe(200);
    expect((await updateResponse.json()).data.hyperlinkLabel).toBe('qa-label-updated');

    const deleteResponse = await client.delete({ hyperlinkID: created._id, userLoginID });
    expect(deleteResponse.status()).toBe(200);

    const afterDelete = await client.getOne({
      hyperlinkID: created._id, refInstID: payload.refInstID, refMediumID: payload.refMediumID,
      refSectionID: payload.refSectionID, refSubjectID: payload.refSubjectID, userLoginID,
    });
    expect(afterDelete.status()).toBe(404);
  });

  test('getAll reports missing required fields with 400', async ({ anonClient }) => {
    const client = new HyperlinkClient(anonClient);
    const response = await client.getAll({});
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toMatch(/please enter the required fields/i);
  });

  test('getAll returns 404 when nothing matches', async ({ anonClient }) => {
    const client = new HyperlinkClient(anonClient);
    const response = await client.getAll({
      refInstID: 'a', refMediumID: 'b', refSubjectID: 'c', refSectionID: 'd', userLoginID: 'nobody',
    });
    expect(response.status()).toBe(404);
    await expect(readError(response)).resolves.toBe('no hyperlinks found for requested user');
  });

  test('getOne returns 404 for a nonexistent hyperlink', async ({ anonClient }) => {
    const client = new HyperlinkClient(anonClient);
    const response = await client.getOne({
      hyperlinkID: '000000000000000000000000', refInstID: 'a', refMediumID: 'b', refSectionID: 'c',
      refSubjectID: 'd', userLoginID: 'nobody',
    });
    expect(response.status()).toBe(404);
    await expect(readError(response)).resolves.toBe('no hyperlinks found for requested user');
  });

  test('SECURITY: update accepts any caller with no ownership check (404 not 401/403, and no userLoginID needed)', async ({
    anonClient,
  }) => {
    const client = new HyperlinkClient(anonClient);
    const response = await client.update({
      hyperlinkID: '000000000000000000000000', hyperlinkLabel: 'x', hyperlinkUnit: 'y', hyperlinkSession: 'z',
    });
    expect([401, 403]).not.toContain(response.status());
    expect(response.status()).toBe(404);
    await expect(readError(response)).resolves.toBe('Requested hyperlink was not exists');
  });

  test('SECURITY: delete accepts any caller with no ownership check', async ({ anonClient }) => {
    const client = new HyperlinkClient(anonClient);
    const response = await client.delete({ hyperlinkID: '000000000000000000000000', userLoginID: 'anyone-at-all' });
    expect([401, 403]).not.toContain(response.status());
    expect(response.status()).toBe(404);
    await expect(readError(response)).resolves.toBe('Requested hyperlink was not exists');
  });
});
