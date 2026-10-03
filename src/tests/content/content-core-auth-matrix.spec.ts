import { test, expect } from '../../fixtures/api.fixture';

test.describe.configure({ mode: 'parallel' });

/**
 * content.controller.js has ~50+ routes; the 6 core CRUD ops get full coverage in
 * content-core.spec.ts. Per direction ("validation/security coverage now, real data
 * later"), the remaining routes below get lean, broad auth-boundary coverage: for each,
 * confirm the swagger-documented 🔓/🔒 marker actually matches live behavior. This matters
 * because that marker has already proven unreliable elsewhere in this API (ContentAttribute,
 * Scratch, Highlighter/Hyperlink were all documented one way and behaved differently) — an
 * anonymous call either gets rejected with 401/403 (auth genuinely required) or reaches real
 * business logic and gets some other status (genuinely public), and that's the one fact
 * worth locking in across this many endpoints without a deep dive into each.
 *
 * PLACEHOLDER is a well-formed ObjectId used for any path param — none of these calls are
 * expected to find real data, we only care whether the *auth* gate was reached.
 */
const PLACEHOLDER = '000000000000000000000000';

interface RouteCase {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  authRequired: boolean;
  body?: unknown;
  /**
   * Confirmed live (individually, sequentially, with base connectivity verified healthy
   * immediately before and after — not parallel-execution noise): these hang indefinitely
   * on an empty/minimal JSON body, zero response. `checkProgram`'s route registers
   * `formidable()` (a multipart parser) ahead of the handler — sending `Content-Type:
   * application/json` instead of multipart plausibly explains that one hanging forever
   * waiting for a form boundary that never arrives; the other 5 share the same symptom
   * without an obvious shared cause from a routes.js-level read alone. Bounded-timeout
   * tests below prove the hang rather than assert a 30s-timeout auth boundary.
   */
  knownHang?: boolean;
}

const ROUTES: RouteCase[] = [
  { method: 'post', path: '/v1/book/unitsandsessioncount1', authRequired: false, body: {} },
  { method: 'post', path: '/v1/content/extract-urls', authRequired: false, body: {}, knownHang: true },
  { method: 'get', path: `/v1/content/keywords/matching/${PLACEHOLDER}/${PLACEHOLDER}?typeId=1`, authRequired: false },
  {
    method: 'patch',
    path: `/v1/content/update/processedcontent/${PLACEHOLDER}`,
    authRequired: false,
    body: { processedContent: 'x', processedTypeId: 'x', processedOccurrenceType: 'x', processedKeywords: 'x' },
  },
  { method: 'post', path: `/v1/content/view/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}`, authRequired: true, body: {} },
  { method: 'put', path: `/v1/content/upload/file/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}`, authRequired: true, body: {} },
  { method: 'post', path: `/v1/content/model-upload/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}`, authRequired: true, body: {} },
  {
    method: 'post',
    path: `/v1/content/view/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}`,
    authRequired: true,
    body: {},
  },
  { method: 'post', path: `/v1/content/text/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}`, authRequired: false, body: {} },
  { method: 'post', path: `/v1/content/firstFind/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}`, authRequired: false, body: {} },
  { method: 'post', path: `/v1/content/find/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}`, authRequired: false, body: {} },
  { method: 'get', path: `/v1/content/get/${PLACEHOLDER}/${PLACEHOLDER}`, authRequired: false },
  { method: 'get', path: `/v1/content/book/details/${PLACEHOLDER}`, authRequired: false },
  { method: 'post', path: '/v1/content/crumb/get', authRequired: false, body: {} },
  { method: 'post', path: '/v1/content/teacher/get/book', authRequired: false, body: {} },
  { method: 'get', path: '/v1/content/get/unitsandsession', authRequired: false },
  { method: 'get', path: `/v1/content/session/get/${PLACEHOLDER}`, authRequired: false },
  { method: 'get', path: `/v1/content/questions/get/${PLACEHOLDER}`, authRequired: false },
  {
    method: 'post',
    path: `/v1/content/find/v2/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}`,
    authRequired: false,
    body: {},
  },
  { method: 'get', path: '/v1/content/find/files/details', authRequired: false },
  { method: 'get', path: `/v1/content/files/user/details/${PLACEHOLDER}/2026-01-01/2026-01-31`, authRequired: false },
  {
    method: 'post',
    path: `/v1/content/upload/file/videos/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/topic/10`,
    authRequired: true,
    body: {},
  },
  { method: 'get', path: `/v1/content/${PLACEHOLDER}/history`, authRequired: false },
  { method: 'post', path: '/v1/content/resource', authRequired: false, body: { resourceType: 'x', unitId: PLACEHOLDER, sessionIds: [] } },
  { method: 'post', path: `/v1/content/publish/${PLACEHOLDER}`, authRequired: false, body: {} },
  {
    method: 'post',
    path: '/v1/content/video/find',
    authRequired: false,
    body: { userId: PLACEHOLDER, url: 'https://example.com/x.mp4', bookId: PLACEHOLDER, sessionId: PLACEHOLDER, unitId: PLACEHOLDER },
  },
  {
    method: 'post',
    path: `/v1/content/upload/file/audio/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/topic/10?typeId=1`,
    authRequired: true,
    body: {},
  },
  { method: 'post', path: '/v1/content/multibooks/publish', authRequired: false, body: {}, knownHang: true },
  { method: 'get', path: '/v1/content/get/published-books', authRequired: false },
  { method: 'post', path: '/v1/content/code/compile', authRequired: false, body: {}, knownHang: true },
  { method: 'post', path: '/v1/content/copy', authRequired: true, body: { sessionFrom: PLACEHOLDER, sessionTo: PLACEHOLDER } },
  { method: 'post', path: '/v1/content/upload/convert', authRequired: false, body: {} },
  { method: 'post', path: `/v1/content/${PLACEHOLDER}`, authRequired: true, body: {} },
  { method: 'post', path: '/v1/content/get/file-details', authRequired: true, body: { url: 'https://example.com/x' } },
  { method: 'post', path: '/v1/content/clcount/update', authRequired: false, body: {}, knownHang: true },
  { method: 'post', path: '/v1/content/assets/variable/update', authRequired: false, body: {}, knownHang: true },
  { method: 'post', path: '/v1/content/assets/size/update', authRequired: false, body: {}, knownHang: true },
  { method: 'patch', path: '/v1/content/extract-and-save', authRequired: false, body: {}, knownHang: true },
  { method: 'get', path: `/v1/content/load-analysis/${PLACEHOLDER}`, authRequired: false },
  { method: 'get', path: `/v1/content/chrome-simulation/${PLACEHOLDER}`, authRequired: false },
  { method: 'post', path: `/v2/content/text/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}`, authRequired: false, body: {} },
  {
    method: 'post',
    path: `/v2/content/find/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}/${PLACEHOLDER}`,
    authRequired: false,
    body: {},
  },
  { method: 'get', path: `/v2/content/${PLACEHOLDER}/${PLACEHOLDER}/topic/${PLACEHOLDER}`, authRequired: false },
  { method: 'post', path: '/v2/content/listview/unit', authRequired: false, body: {} },
];

test.describe('Content — core ContentController auth boundary matrix (lean, no happy-path)', () => {
  for (const route of ROUTES) {
    const label = `${route.method.toUpperCase()} ${route.path.split('?')[0]}`;

    if (route.knownHang) {
      test(`BUG: ${label} hangs indefinitely on an empty/minimal body`, async ({ anonClient }) => {
        const options = { ...(route.body !== undefined ? { data: route.body } : {}), timeout: 8000 };
        await expect(anonClient[route.method](route.path, options)).rejects.toThrow(/timeout/i);
      });
      continue;
    }

    test(`${label} — ${route.authRequired ? 'requires' : 'does not require'} authentication`, async ({ anonClient }) => {
      const response = await anonClient[route.method](route.path, route.body !== undefined ? { data: route.body } : {});
      if (route.authRequired) {
        expect([401, 403]).toContain(response.status());
      } else {
        expect([401, 403]).not.toContain(response.status());
      }
    });
  }
});
