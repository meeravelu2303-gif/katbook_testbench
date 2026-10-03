import { test, expect } from '../../fixtures/api.fixture';
import { ContentLinkClient } from '../../client/content-link.client';
import { baseFactory } from '../../factories/base.factory';
import { readError } from '../management/support';
import { SEED, CURRICULUM } from '../../config/seed.constants';

test.describe.configure({ mode: 'parallel' });

/**
 * contentLink.controller.js — read directly. Same structural tierDetails/variableDetails
 * array-vs-object validation mismatch as VideoScript/HandBook (see section 11 of
 * TEST_STRATEGY.md) — not re-tested here, already documented as one systemic finding.
 * The public GetAdditionalContentByLink/GetAllContentLinkWordsByBookDetails_V2 lookups are
 * out of scope (no seed data to look up).
 *
 * SECURITY (critical, found reading source, deliberately NOT exploited here): UploadFiles
 * (PUT /content/link/content/upload/file) writes `req.body.content` to a file path built
 * directly from `req.body.path` + `req.body.name`, via `fs.writeFile`, with no sanitization
 * and BEFORE validating that contentId exists — any authenticated caller can write an
 * arbitrary file to an arbitrary path on the server (path traversal / arbitrary file write,
 * plausibly RCE). Testing the actual write behavior against this shared dev server would be
 * genuinely destructive, so only the anonymous-rejection auth boundary is exercised below;
 * an authenticated call is never made. Flag this to the backend team directly — it's more
 * severe than anything else found in this project so far, including the JWT auth-bypass.
 *
 * BUG (confirmed live, reproducible): the success response field is `linkContent`, not
 * `data` like every sibling controller (Management/ContentType/VideoScript/HandBook all use
 * `data`) — an inconsistency worth flagging on its own.
 *
 * BUG (confirmed live, severe, 2 of ContentLink's 5 write routes): both `updateLinkContent`
 * and `deleteLinkContent` hang indefinitely (no response, confirmed with bounded 8-15s
 * timeouts via both Playwright and a raw `curl` probe) for any *real* existing content
 * link — but the underlying write still actually happens server-side (verified: re-fetching
 * a "hung" update showed the new value persisted). Both return fast for a nonexistent id,
 * since that check happens first; the hang is specifically in whatever runs after the
 * record is found (for delete, confirmed as an unindexed `Content.findOne({content:
 * {$regex: contentId}})` full-collection regex scan before responding — update's exact
 * cause wasn't traced, but the symptom is identical). Practical effect: ContentLink test
 * data created here CANNOT be cleaned up or safely updated via the API right now. Every
 * test below uses a unique linkWord/contentWord (via baseFactory.testTag()) instead of
 * relying on update/delete, and does not attempt either on real records it creates. When
 * this is fixed, revisit and add real update/delete-based assertions and cleanup.
 */
function buildLink(overrides: Partial<Parameters<ContentLinkClient['create']>[0]> = {}) {
  const tag = baseFactory.testTag();
  return {
    companyId: SEED.COMPANY_ID,
    typeOfBook: CURRICULUM.TYPE_OF_BOOK_ID,
    countryId: CURRICULUM.COUNTRY_ID,
    institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
    attributeId: CURRICULUM.ATTRIBUTE_ID,
    tierDetails: [{ tierId: CURRICULUM.TIER_1_ID }],
    variableDetails: [{ variableId: CURRICULUM.TOP_VARIABLE_ID }],
    linkWord: `${tag}-link-word`,
    contentWord: `${tag}-content-word`,
    content: `Sample content referencing ${tag}-link-word for the automated test bench.`,
    ...overrides,
  };
}

test.describe('Content — ContentLink', () => {
  test('create rejects an anonymous request', async ({ anonClient }) => {
    const client = new ContentLinkClient(anonClient);
    const response = await client.create(buildLink());
    expect([401, 403]).toContain(response.status());
  });

  test('create rejects a missing contentWord', async ({ clientAs }) => {
    const client = new ContentLinkClient(await clientAs('admin'));
    const response = await client.create(buildLink({ contentWord: '' }));
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toMatch(/valid content word/i);
  });

  test('create rejects a nonexistent attributeId', async ({ clientAs }) => {
    const client = new ContentLinkClient(await clientAs('admin'));
    const response = await client.create(buildLink({ attributeId: '000000000000000000000000' }));
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('Attribute not found!');
  });

  test('create, getById, getAll with real curriculum data (no update/delete — see BUG note above)', async ({
    clientAs,
  }) => {
    const client = new ContentLinkClient(await clientAs('admin'));
    const input = buildLink();

    const createResponse = await client.create(input);
    expect(createResponse.status()).toBe(200);
    const created = (await createResponse.json()).linkContent;
    expect(created.linkWord).toBe(input.linkWord);

    const getByIdResponse = await client.getById(created._id);
    expect(getByIdResponse.status()).toBe(200);

    const getAllResponse = await client.getAll(
      {
        countryId: CURRICULUM.COUNTRY_ID,
        typeOfBookId: CURRICULUM.TYPE_OF_BOOK_ID,
        institutionTypeId: CURRICULUM.INSTITUTION_TYPE_ID,
        companyId: SEED.COMPANY_ID,
      },
      [{ variableId: CURRICULUM.TOP_VARIABLE_ID }],
    );
    expect(getAllResponse.status()).toBe(200);
  });

  test('BUG: update hangs indefinitely for a real existing content link, though the write still applies server-side', async ({
    clientAs,
  }) => {
    const client = new ContentLinkClient(await clientAs('admin'));
    const input = buildLink();
    const created = (await (await client.create(input)).json()).linkContent;

    await expect(
      client.update(
        created._id,
        CURRICULUM.COUNTRY_ID,
        CURRICULUM.INSTITUTION_TYPE_ID,
        SEED.COMPANY_ID,
        { linkWord: `${input.linkWord}-updated`, content: input.content, contentWord: input.contentWord },
        8000,
      ),
    ).rejects.toThrow(/timeout/i);
    // No cleanup possible — update's hang means we can't even confirm/undo the write
    // without risking another hang. See the BUG note at the top of this file.
  });

  test('SECURITY: create response leaks the password hash via createdBy/updatedBy', async ({ clientAs }) => {
    // Same defect class as sections 9/11 — createdBy/updatedBy assigned req.user directly.
    // 5th confirmed instance of this pattern across the codebase.
    const client = new ContentLinkClient(await clientAs('admin'));
    const created = (await (await client.create(buildLink())).json()).linkContent;
    expect(created.createdBy).not.toHaveProperty('password');
    expect(created.updatedBy).not.toHaveProperty('password');
  });

  test('BUG: delete hangs indefinitely for a real existing content link (bounded-timeout proof)', async ({
    clientAs,
  }) => {
    const client = new ContentLinkClient(await clientAs('admin'));
    const created = (await (await client.create(buildLink())).json()).linkContent;

    await expect(
      client.delete(created._id, CURRICULUM.COUNTRY_ID, CURRICULUM.INSTITUTION_TYPE_ID, SEED.COMPANY_ID, 8000),
    ).rejects.toThrow(/timeout/i);
    // No cleanup possible — this record is now permanently stray until the backend fixes
    // DeleteLinkContent's hang. See the BUG note at the top of this file.
  });

  test('getById rejects a malformed id', async ({ clientAs }) => {
    const client = new ContentLinkClient(await clientAs('admin'));
    const response = await client.getById('not-an-object-id');
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('Please select content link!');
  });

  test('getById returns 400 for a well-formed but nonexistent id', async ({ clientAs }) => {
    const client = new ContentLinkClient(await clientAs('admin'));
    const response = await client.getById('000000000000000000000000');
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('Content link not found!');
  });

  test('delete returns 400 quickly for a well-formed but nonexistent id (the hang is specific to real records)', async ({
    clientAs,
  }) => {
    const client = new ContentLinkClient(await clientAs('admin'));
    const response = await client.delete(
      '000000000000000000000000',
      CURRICULUM.COUNTRY_ID,
      CURRICULUM.INSTITUTION_TYPE_ID,
      SEED.COMPANY_ID,
    );
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('No matches found!');
  });

  test('SECURITY: UploadFiles (arbitrary file write) rejects an anonymous request', async ({ anonClient }) => {
    const client = new ContentLinkClient(anonClient);
    const response = await client.uploadFilesAuthProbe();
    expect([401, 403]).toContain(response.status());
  });

  test('BUG: UploadLink hangs indefinitely when no file is attached, even with a well-formed empty multipart body', async ({
    clientAs,
  }) => {
    // First attempt used a hand-rolled, not-quite-valid multipart body and hung — initially
    // suspected as a test-construction artifact (multer waiting on a malformed stream).
    // Retried with a correctly-terminated empty multipart body (bare `--boundary--`) and it
    // hangs identically — this is a genuine server-side defect, not a malformed request.
    const client = new ContentLinkClient(await clientAs('admin'));
    await expect(client.uploadLinkWithoutFile('000000000000000000000000', 10000)).rejects.toThrow(/timeout/i);
  });
});
