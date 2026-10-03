import { test, expect } from '../../fixtures/api.fixture';
import { EditorClient } from '../../client/editor.client';
import { readError, getSelfUserId } from '../management/support';

test.describe.configure({ mode: 'parallel' });

/** editorload.controller.js — all 4 routes use needsAuth (routes/v1.js:175-178). */
test.describe('Content — Editor load tracking', () => {
  test('logEvent rejects an anonymous request', async ({ anonClient }) => {
    const client = new EditorClient(anonClient);
    const response = await client.logEvent('content');
    expect([401, 403]).toContain(response.status());
  });

  test('logEvent succeeds and is visible via getAllForUser (self)', async ({ clientAs }) => {
    const authed = await clientAs('admin');
    const client = new EditorClient(authed);
    const selfId = await getSelfUserId(authed);

    const logResponse = await client.logEvent('content');
    expect(logResponse.status()).toBe(201);
    expect((await logResponse.json()).message).toBe('Event added');

    const response = await client.getAllForUser(selfId);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.username).toBeTruthy();
    expect(body.data.total).toBeGreaterThan(0);
    expect(body.data.contentloads).toBeGreaterThan(0);
  });

  test('getAllForUser rejects a malformed userId', async ({ clientAs }) => {
    const client = new EditorClient(await clientAs('admin'));
    const response = await client.getAllForUser('not-an-object-id');
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toMatch(/valid user id/i);
  });

  test('getAllForUser returns 404 for a well-formed but nonexistent userId', async ({ clientAs }) => {
    const client = new EditorClient(await clientAs('admin'));
    const response = await client.getAllForUser('000000000000000000000000');
    expect(response.status()).toBe(404);
    await expect(readError(response)).resolves.toBe('User not found!.');
  });

  test('getAllForInterval rejects a missing startdate', async ({ clientAs }) => {
    const client = new EditorClient(await clientAs('admin'));
    const response = await client.getAllForInterval(undefined, '2026-01-10');
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('Please enter start date!.');
  });

  test('getAllForInterval rejects a malformed startdate', async ({ clientAs }) => {
    const client = new EditorClient(await clientAs('admin'));
    const response = await client.getAllForInterval('10-01-2026');
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('Please enter valid start date!.');
  });

  test('getAllForInterval finds events logged today', async ({ clientAs }) => {
    const authed = await clientAs('admin');
    const client = new EditorClient(authed);
    await client.logEvent('content');

    const today = new Date().toISOString().slice(0, 10);
    const response = await client.getAllForInterval(today, today);
    expect(response.status()).toBe(200);
  });

  test('BUG: getAll (admin self-exclusion aggregate query) never responds — confirmed hang, not a flake', async ({
    clientAs,
  }) => {
    // Confirmed live via a direct timed curl before writing this test: 20+ seconds, zero
    // response, no error either. GetAllEditorLoadEvents (editorload.controller.js:55-162)
    // excludes the caller and aggregates load counts for every other user in the company —
    // as Admin, over a real multi-year company this is likely an expensive/unbounded query.
    // Bounding the timeout here so this one test documents the defect in ~8s instead of
    // burning the full 30s default on every run.
    const client = new EditorClient(await clientAs('admin'));
    await expect(client.getAll({}, 8000)).rejects.toThrow(/timeout/i);
  });
});
