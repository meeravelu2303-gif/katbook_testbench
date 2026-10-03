import { test, expect } from '../../fixtures/api.fixture';
import { ContentAttributeClient } from '../../client/content-attribute.client';
import { buildContentAttributeName } from '../../factories/content.factory';
import { readError } from '../management/support';
import { SEED } from '../../config/seed.constants';

test.describe.configure({ mode: 'parallel' });

/**
 * BUG (routes/v1.js): `router.post('/content/:sessionId', needsAuth, requireParams,
 * ContentController.GetSessionContentAndPlanningBySessionID)` is registered at line 380,
 * before `router.post('/content/attribute', needsAuth, ContentAttributeController.
 * CreateContentAttribute)` at line 798. Express matches POST routes in registration order,
 * so any POST to /v1/content/attribute is permanently captured by the generic
 * `/content/:sessionId` handler (treating "attribute" as sessionId) — the real
 * CreateContentAttribute handler is unreachable dead code. Confirmed live below via the
 * exact error text that only the shadowing handler's `requireParams` middleware produces.
 * Net effect: there is currently no way to create a content attribute through this API at
 * all, for any company — GetContentAttribute (GET) is unaffected (different route shape,
 * not shadowed) but has nothing to ever return.
 */
test.describe('Content — ContentAttribute', () => {
  test('BUG: POST /v1/content/attribute is shadowed by POST /v1/content/:sessionId and never creates anything', async ({
    clientAs,
  }) => {
    const client = new ContentAttributeClient(await clientAs('admin'));
    const response = await client.create(SEED.COMPANY_ID, buildContentAttributeName());

    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe(
      'The following parameters [ sessionId ] are required to access this route',
    );
  });

  test('getAll requires no auth (confirmed public) and returns 404 for a company with no attributes', async ({
    anonClient,
  }) => {
    const client = new ContentAttributeClient(anonClient);
    const response = await client.getAll(SEED.COMPANY_ID);

    // Consistent with the finding above: since creation is unreachable, this is currently
    // the only observable behavior for every company, including the real seeded one.
    expect(response.status()).toBe(404);
    await expect(readError(response)).resolves.toBe('No content attributes were found for requested company');
  });

  test('getAll rejects a malformed companyId', async ({ anonClient }) => {
    const client = new ContentAttributeClient(anonClient);
    const response = await client.getAll('not-an-object-id');
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toMatch(/valid companyId/i);
  });
});
