import { test, expect } from '../../fixtures/api.fixture';
import { ContentHistoryClient } from '../../client/content-history.client';
import { readError } from '../management/support';

test.describe.configure({ mode: 'parallel' });

/**
 * contentHistory.controller.js — confirmed live: no auth on any GET route. Happy paths need
 * a real contentId/yearId/unitId from content that doesn't exist yet in this test bench
 * (blocked on the `content`/`variables` domains), so only validation/not-found paths are
 * covered here.
 *
 * `PUT /v1/history/existinghistory/upload` (UploadAllExistingContentHistoryToS3) is
 * DELIBERATELY NOT tested at all, in either direction: it re-uploads up to 1000 real
 * ContentHistory documents to R2 storage and mutates them in place, with (per routes/v1.js:403)
 * no auth middleware. Confirmed as a security finding from source only — actually invoking it,
 * even just to prove it's unauthenticated, would perform a real bulk mutation against the
 * shared dev database, which is not an acceptable price for a test assertion.
 */
test.describe('Content — ContentHistory', () => {
  test('SECURITY: getAllForContent requires no authentication', async ({ anonClient }) => {
    const client = new ContentHistoryClient(anonClient);
    const response = await client.getAllForContent('000000000000000000000000');
    expect([401, 403]).not.toContain(response.status());
    expect(response.status()).toBe(404);
    await expect(readError(response)).resolves.toBe('No content history found for the requested content');
  });

  test('getAllForContent rejects a malformed contentId', async ({ anonClient }) => {
    const client = new ContentHistoryClient(anonClient);
    const response = await client.getAllForContent('not-an-object-id');
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toMatch(/valid content id/i);
  });

  test('getById rejects a malformed id', async ({ anonClient }) => {
    const client = new ContentHistoryClient(anonClient);
    const response = await client.getById('not-an-object-id');
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toMatch(/valid content history id/i);
  });

  test('getById returns 404 for a well-formed but nonexistent id', async ({ anonClient }) => {
    const client = new ContentHistoryClient(anonClient);
    const response = await client.getById('000000000000000000000000');
    expect(response.status()).toBe(404);
    await expect(readError(response)).resolves.toBe('No content history found for the requested content');
  });

  test('getAllForBook returns 404 for a nonexistent yearId', async ({ anonClient }) => {
    const client = new ContentHistoryClient(anonClient);
    const response = await client.getAllForBook('000000000000000000000000');
    expect(response.status()).toBe(404);
    await expect(readError(response)).resolves.toBe('No year found for requested Id');
  });

  test('getAllForUnit returns 404 for a nonexistent unitId', async ({ anonClient }) => {
    const client = new ContentHistoryClient(anonClient);
    const response = await client.getAllForUnit('000000000000000000000000');
    expect(response.status()).toBe(404);
    await expect(readError(response)).resolves.toBe('No unit found for requested Id');
  });
});
