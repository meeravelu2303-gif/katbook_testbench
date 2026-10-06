import { test, expect } from '../../fixtures/api.fixture';
import { AdminUserClient } from '../../client/admin-user.client';
import { BaseApiClient } from '../../client/base-client';
import { SEED } from '../../config/seed.constants';
import { baseFactory } from '../../factories/base.factory';
import { env } from '../../config/env';
import { isActorConfigured } from '../../config/api.config';

const PLACEHOLDER = '000000000000000000000000';

/**
 * user.controller.js — the "Admin" user-management routes. See `admin-user.client.ts`'s
 * top-of-file comment for the full writeup of the two routes intentionally excluded or
 * restricted here (`updateAdminPassword`: no client method at all; `updateUserPassword`:
 * has a method, but every test below targets ONLY the disposable employee this file
 * creates for itself in `beforeAll`, never a real shared id).
 *
 * This disposable employee is exclusive to this file (same reasoning as
 * `holiday-employee.spec.ts`'s own disposable employee) — mutating the shared
 * `contentUploader` actor (block/enable/password-change) could break other concurrently
 * running domain suites that log in as it.
 *
 * `beforeAll`'s own `request` fixture is only used for one-time setup (looking up the
 * admin's own id, creating the disposable employee) — Playwright disposes a `request`
 * context obtained inside `beforeAll` once `beforeAll` finishes, so every test body below
 * gets its own client via the memoized `clientAs('admin')` test fixture instead of reusing
 * that setup-only client (confirmed live: reusing it throws "Fixture { request } from
 * beforeAll cannot be reused in a test").
 */
test.describe('Admin — User management', () => {
  let employeeId: string;
  let employeeUserName: string;
  let companyId: string;
  let adminId: string;

  test.beforeAll(async ({ request }) => {
    test.skip(!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD, 'ADMIN_USERNAME/ADMIN_PASSWORD not set.');
    const loginResponse = await request.post('/v1/admin/login', {
      data: { userName: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD },
    });
    expect(loginResponse.ok()).toBe(true);
    const loginBody = await loginResponse.json();
    const token: string = loginBody.token.replace(/^Bearer\s+/i, '');
    adminId = loginBody.user._id;
    companyId = SEED.COMPANY_ID;
    const setupClient = new AdminUserClient(new BaseApiClient(request, token));

    employeeUserName = `qa-admin-user-${baseFactory.testTag()}`.toLowerCase();
    const addResponse = await setupClient.addUser({
      userName: employeeUserName,
      email: `${employeeUserName}@example.com`,
      password: baseFactory.password(),
      userTypeId: SEED.CONTENT_UPLOADER_USER_TYPE_ID,
      companyId,
      reportingTo: adminId,
      isThirdParty: false,
    });
    expect(addResponse.status()).toBe(200);

    const getAllByType = await setupClient.getAllByUserType(SEED.CONTENT_UPLOADER_USER_TYPE_ID);
    const byTypeBody = await getAllByType.json();
    const created = (byTypeBody.user as Array<{ _id: string; userName: string }>).find((u) => u.userName === employeeUserName);
    expect(created).toBeDefined();
    employeeId = created!._id;
  });

  test('addUser rejects a non-Admin caller', async ({ clientAs }) => {
    test.skip(!isActorConfigured('contentUploader'), 'CONTENT_UPLOADER_USERNAME/PASSWORD not set.');
    const client = new AdminUserClient(await clientAs('contentUploader'));
    const tag = baseFactory.testTag();
    const response = await client.addUser({
      userName: `qa-probe-${tag}`,
      email: `qa-probe-${tag}@example.com`,
      password: baseFactory.password(),
      userTypeId: SEED.CONTENT_UPLOADER_USER_TYPE_ID,
      companyId,
      reportingTo: adminId,
      isThirdParty: false,
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('Admin user only allow to access here!.');
  });

  test('addUser rejects creating another Admin-coded userType', async ({ clientAs }) => {
    const client = new AdminUserClient(await clientAs('admin'));
    const tag = baseFactory.testTag();
    const response = await client.addUser({
      userName: `qa-probe-${tag}`,
      email: `qa-probe-${tag}@example.com`,
      password: baseFactory.password(),
      userTypeId: SEED.ADMIN_USER_TYPE_ID,
      companyId,
      reportingTo: adminId,
      isThirdParty: false,
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('Non Admin user only allow to register here!.');
  });

  test('addUser rejects a nonexistent companyId', async ({ clientAs }) => {
    const client = new AdminUserClient(await clientAs('admin'));
    const tag = baseFactory.testTag();
    const response = await client.addUser({
      userName: `qa-probe-${tag}`,
      email: `qa-probe-${tag}@example.com`,
      password: baseFactory.password(),
      userTypeId: SEED.CONTENT_UPLOADER_USER_TYPE_ID,
      companyId: PLACEHOLDER,
      reportingTo: adminId,
      isThirdParty: false,
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('Company not found!');
  });

  test('addUser rejects a nonexistent reportingTo', async ({ clientAs }) => {
    const client = new AdminUserClient(await clientAs('admin'));
    const tag = baseFactory.testTag();
    const response = await client.addUser({
      userName: `qa-probe-${tag}`,
      email: `qa-probe-${tag}@example.com`,
      password: baseFactory.password(),
      userTypeId: SEED.CONTENT_UPLOADER_USER_TYPE_ID,
      companyId,
      reportingTo: PLACEHOLDER,
      isThirdParty: false,
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('Please select vaild reporting to user!.');
  });

  test('addUser rejects a duplicate userName', async ({ clientAs }) => {
    const client = new AdminUserClient(await clientAs('admin'));
    const response = await client.addUser({
      userName: employeeUserName,
      email: `qa-probe-${baseFactory.testTag()}@example.com`,
      password: baseFactory.password(),
      userTypeId: SEED.CONTENT_UPLOADER_USER_TYPE_ID,
      companyId,
      reportingTo: adminId,
      isThirdParty: false,
    });
    expect(response.status()).toBe(400);
  });

  test('addUser rejects an anonymous request', async ({ anonClient }) => {
    const tag = baseFactory.testTag();
    const response = await new AdminUserClient(anonClient).addUser({
      userName: `qa-probe-${tag}`,
      email: `qa-probe-${tag}@example.com`,
      password: baseFactory.password(),
      userTypeId: SEED.CONTENT_UPLOADER_USER_TYPE_ID,
      companyId,
      reportingTo: adminId,
      isThirdParty: false,
    });
    expect([401, 403]).toContain(response.status());
  });

  test('SECURITY: getAllByAdmin leaks the bcrypt password hash for every listed user', async ({ clientAs }) => {
    const client = new AdminUserClient(await clientAs('admin'));
    const response = await client.getAllByAdmin();
    expect(response.status()).toBe(200);
    const body = await response.json();
    const users: Array<Record<string, unknown>> = body.users;
    expect(users.length).toBeGreaterThan(0);
    expect(users.find((u) => u._id === employeeId)).toHaveProperty('password');
  });

  test('SECURITY: getByAdmin leaks the bcrypt password hash for a single user', async ({ clientAs }) => {
    const client = new AdminUserClient(await clientAs('admin'));
    const response = await client.getByAdmin(employeeId);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.user).toHaveProperty('password');
  });

  test('SECURITY: getAllActiveByAdmin leaks the bcrypt password hash', async ({ clientAs }) => {
    const client = new AdminUserClient(await clientAs('admin'));
    const response = await client.getAllActiveByAdmin();
    expect(response.status()).toBe(200);
    const body = await response.json();
    const users: Array<Record<string, unknown>> = body.users;
    expect(users.find((u) => u._id === employeeId)).toHaveProperty('password');
  });

  test('SECURITY: getAllByUserType leaks the bcrypt password hash (response key is singular "user" despite being an array)', async ({
    clientAs,
  }) => {
    const client = new AdminUserClient(await clientAs('admin'));
    const response = await client.getAllByUserType(SEED.CONTENT_UPLOADER_USER_TYPE_ID);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.user)).toBe(true);
    const users: Array<Record<string, unknown>> = body.user;
    expect(users.find((u) => u._id === employeeId)).toHaveProperty('password');
  });

  test('real lifecycle: block then enable the disposable employee is fully reversible', async ({ clientAs }) => {
    const client = new AdminUserClient(await clientAs('admin'));
    const block = await client.block(employeeId);
    expect(block.status()).toBe(200);

    const blocked = await client.getByAdmin(employeeId);
    expect((await blocked.json()).user.block).toBe(true);

    const enable = await client.enable(employeeId);
    expect(enable.status()).toBe(200);

    const enabled = await client.getByAdmin(employeeId);
    expect((await enabled.json()).user.block).toBe(false);
  });

  test('BUG ($nin-excludes-self, same class confirmed 9+ times elsewhere in this codebase): block rejects targeting any Admin-usertype user, including the caller itself', async ({
    clientAs,
  }) => {
    const client = new AdminUserClient(await clientAs('admin'));
    const response = await client.block(adminId);
    expect(response.status()).toBe(400);
  });

  test('block rejects a nonexistent userId', async ({ clientAs }) => {
    const client = new AdminUserClient(await clientAs('admin'));
    const response = await client.block(PLACEHOLDER);
    expect(response.status()).toBe(400);
  });

  test('real: updatePassword succeeds against the disposable employee this suite created (never a real shared id — see top-of-file note)', async ({
    clientAs,
  }) => {
    const client = new AdminUserClient(await clientAs('admin'));
    const response = await client.updatePassword(employeeId, { password: baseFactory.password() });
    expect(response.status()).toBe(200);
  });

  test('updatePassword rejects an empty body (no fields to update)', async ({ clientAs }) => {
    const client = new AdminUserClient(await clientAs('admin'));
    const response = await client.updatePassword(employeeId, {});
    expect(response.status()).toBe(400);
  });

  test('SECURITY: getUsageLogs is needsAuth but NOT admin-gated — any authenticated caller may read the global usage-log counts', async ({
    clientAs,
  }) => {
    test.skip(!isActorConfigured('contentUploader'), 'CONTENT_UPLOADER_USERNAME/PASSWORD not set.');
    const client = new AdminUserClient(await clientAs('contentUploader'));
    const response = await client.getUsageLogs();
    // 404 "No Logger data found" is the one legitimate non-200 outcome (empty collection) —
    // anything else would mean it WAS admin-gated after all.
    expect([200, 404]).toContain(response.status());
  });

  test('getUsageLogs rejects an anonymous request', async ({ anonClient }) => {
    const response = await new AdminUserClient(anonClient).getUsageLogs();
    expect([401, 403]).toContain(response.status());
  });

  test('removePublishingPlanning rejects a missing publisher before reaching the crash-risk activities check', async ({ clientAs }) => {
    const client = new AdminUserClient(await clientAs('admin'));
    const response = await client.removePublishingPlanning(undefined as unknown as string, []);
    expect(response.status()).toBe(400);
  });

  test('CRASH-RISK (documented, never triggered): removePublishingPlanning 400s cleanly for an empty activities array — never send anything else', async ({
    clientAs,
  }) => {
    // `isEmpty(activities)` (`!Object.keys(activities).length > 0`) throws a TypeError, not a
    // handled rejection, for undefined/null/non-array `activities` — confirmed from source,
    // never reproduced live. `[]` is the one value proven safe to send: Object.keys([]) is
    // `[]`, so `isEmpty([])` evaluates to `true` and hits the ordinary validation branch.
    // This check runs BEFORE the admin-only gate, so it's reachable by any authenticated
    // caller, not just admins. With `activities: []`, this branch also fires before the
    // publisher is ever looked up — a non-empty activities array is the only way to reach
    // that check, and that's exactly the input never sent in this suite.
    const client = new AdminUserClient(await clientAs('admin'));
    const response = await client.removePublishingPlanning(PLACEHOLDER, []);
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/activities/i);
  });
});
