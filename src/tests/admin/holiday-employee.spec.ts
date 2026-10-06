import { test, expect } from '../../fixtures/api.fixture';
import { HolidayEmployeeClient } from '../../client/holiday-employee.client';
import { AdminUserClient } from '../../client/admin-user.client';
import { SEED } from '../../config/seed.constants';
import { baseFactory } from '../../factories/base.factory';
import { env } from '../../config/env';

const PLACEHOLDER = '000000000000000000000000';

/** DD-MM-YYYY, N days from now — stays within the current calendar year for any
 *  reasonable N used below (small offsets, run against a 2026-10 clock). */
function futureDateInCurrentYear(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}
const CURRENT_YEAR = new Date().getFullYear();

/**
 * HoildayEmployee.controller.js — the one genuinely real-lifecycle-safe resource in the
 * `admin` domain (see `holiday-employee.client.ts`'s top-of-file note: a real, working,
 * admin-gated soft-delete exists, unlike most of this project's other destructive routes).
 *
 * Every test here uses a dedicated, disposable non-Admin employee user created once in
 * `beforeAll` via `AdminUserClient.addUser`, instead of reusing the shared `contentUploader`
 * actor used by other domains (diary/planning/hr-staff) — blocking/unblocking or otherwise
 * mutating that shared account, even transiently, could break other concurrently-running
 * suites that depend on logging in as it. This employee is exclusive to this file.
 *
 * Each test uses its own distinct `holidayDate` (a growing day offset from "now") to avoid
 * cross-test collisions with the controller's real duplicate-date-per-employee rejection,
 * since `fullyParallel: true` in playwright.config.ts means tests in this file may run
 * concurrently even without an explicit serial mode here.
 */
test.describe('Admin — HolidayEmployee', () => {
  let employeeId: string;
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

    const { BaseApiClient } = await import('../../client/base-client');
    const adminClient = new BaseApiClient(request, token);
    const userClient = new AdminUserClient(adminClient);

    const tag = baseFactory.testTag().toLowerCase();
    const userName = `qa-holiday-employee-${tag}`;
    const addResponse = await userClient.addUser({
      userName,
      email: `${userName}@example.com`,
      password: baseFactory.password(),
      userTypeId: SEED.CONTENT_UPLOADER_USER_TYPE_ID,
      companyId,
      reportingTo: adminId,
      isThirdParty: false,
    });
    expect(addResponse.status()).toBe(200);

    const getAllByType = await userClient.getAllByUserType(SEED.CONTENT_UPLOADER_USER_TYPE_ID);
    expect(getAllByType.status()).toBe(200);
    const byTypeBody = await getAllByType.json();
    // addUser lowercases/trims userName server-side (user.controller.js:395-397) — the
    // backend's own `.toLowerCase()`, not just ours, is why this comparison is safe.
    const created = (byTypeBody.user as Array<{ _id: string; userName: string }>).find((u) => u.userName === userName);
    expect(created).toBeDefined();
    employeeId = created!._id;
  });

  test('real lifecycle: create, appears in getAll/getAllByEmployee/getAllByMonth, delete removes it', async ({ clientAs }) => {
    const admin = await clientAs('admin');
    const client = new HolidayEmployeeClient(admin);
    const holidayDate = futureDateInCurrentYear(10);

    // Confirmed live: create's success response key is `holiday` (singular) holding the
    // saved doc directly — the getAll-family routes below key their list as `hoilday`
    // (the controller file's own misspelling) instead; don't conflate the two. Also
    // confirmed live: `holidayDate` round-trips as a full ISO datetime string in every GET
    // response, not the DD-MM-YYYY shape the create/update routes accept — compare by `_id`.
    const create = await client.create({ companyId, year: CURRENT_YEAR, holidayDate, employeeId });
    expect(create.status()).toBe(200);
    const createdId: string = (await create.json()).holiday._id;

    const getAll = await client.getAll(companyId);
    expect(getAll.status()).toBe(200);
    const allBody = await getAll.json();
    expect(Array.isArray(allBody.hoilday)).toBe(true);
    const created = (allBody.hoilday as Array<{ _id: string }>).find((h) => h._id === createdId);
    expect(created).toBeDefined();

    const byEmployee = await client.getAllByEmployee(companyId, employeeId);
    expect(byEmployee.status()).toBe(200);
    expect((await byEmployee.json()).hoilday.some((h: { _id: string }) => h._id === createdId)).toBe(true);

    // getAllHolidayByMonthForAdmin parses `date` strictly as DD-MM-YYYY (confirmed from
    // source: `moment(date, 'DD-MM-YYYY', true)`), then computes that whole month's range
    // itself — any real date within the target month works, so reuse `holidayDate` itself.
    const byMonth = await client.getAllByMonth(companyId, holidayDate);
    expect(byMonth.status()).toBe(200);
    expect((await byMonth.json()).hoilday.some((h: { _id: string }) => h._id === createdId)).toBe(true);

    const del = await client.delete(companyId, createdId);
    expect(del.status()).toBe(200);

    const getAllAfterDelete = await client.getAll(companyId);
    // getAllHolidayForAdmin 400s "Employee's Hoilday was empty!." when the company has zero
    // ACTIVE holiday records at all (confirmed from source: isEmpty() check runs before any
    // 200 response) — this dev company has plenty of other real pre-existing records, so
    // in practice this never fires, but the guard is kept for correctness.
    if (getAllAfterDelete.status() === 400) return;
    const afterBody = await getAllAfterDelete.json();
    const afterList: Array<{ _id: string }> = afterBody.hoilday;
    expect(afterList.find((h) => h._id === createdId)).toBeUndefined();
  });

  test('create rejects a nonexistent employeeId', async ({ clientAs }) => {
    const admin = await clientAs('admin');
    const client = new HolidayEmployeeClient(admin);
    const response = await client.create({ companyId, year: CURRENT_YEAR, holidayDate: futureDateInCurrentYear(11), employeeId: PLACEHOLDER });
    expect(response.status()).toBe(400);
  });

  test('create rejects the caller\'s own id as employeeId (same-usertype $nin exclusion)', async ({ clientAs }) => {
    const admin = await clientAs('admin');
    const client = new HolidayEmployeeClient(admin);
    const response = await client.create({ companyId, year: CURRENT_YEAR, holidayDate: futureDateInCurrentYear(12), employeeId: adminId });
    expect(response.status()).toBe(400);
  });

  test('create rejects a past holidayDate', async ({ clientAs }) => {
    const admin = await clientAs('admin');
    const client = new HolidayEmployeeClient(admin);
    const response = await client.create({ companyId, year: CURRENT_YEAR, holidayDate: '01-01-2020', employeeId });
    expect(response.status()).toBe(400);
  });

  test('create rejects a duplicate holidayDate for the same employee', async ({ clientAs }) => {
    const admin = await clientAs('admin');
    const client = new HolidayEmployeeClient(admin);
    const holidayDate = futureDateInCurrentYear(13);

    const first = await client.create({ companyId, year: CURRENT_YEAR, holidayDate, employeeId });
    expect(first.status()).toBe(200);
    const createdId: string = (await first.json()).holiday._id;
    const second = await client.create({ companyId, year: CURRENT_YEAR, holidayDate, employeeId });
    expect(second.status()).toBe(400);

    await client.delete(companyId, createdId);
  });

  test('BUG: getAllByEmployeeForAdmin has no $nin usertype exclusion — reaches the "no data" branch for an Admin id instead of rejecting it as an invalid employee', async ({
    clientAs,
  }) => {
    // createHoildayEmployee DOES have a $nin exclusion (confirmed from source), so a real
    // HoildayEmployee record with employeeId == an Admin can never exist — meaning this
    // bug can only be proven by showing the lookup accepts the Admin id as a *candidate*
    // employee (falls through to the data-existence check) rather than rejecting it
    // up front the way create/update do. It can't be proven by returning 200 with data.
    const admin = await clientAs('admin');
    const client = new HolidayEmployeeClient(admin);
    const response = await client.getAllByEmployee(companyId, adminId);
    expect(response.status()).toBe(400);
    // ReE's error envelope key is `error`, not `message` (confirmed live) — the opposite of
    // ReS's success envelope, which uses `message`.
    expect((await response.json()).error).toBe('Employee Hoilday was empty!.');
  });

  test('create rejects an anonymous request', async ({ anonClient }) => {
    const client = new HolidayEmployeeClient(anonClient);
    const response = await client.create({ companyId, year: CURRENT_YEAR, holidayDate: futureDateInCurrentYear(14), employeeId });
    expect([401, 403]).toContain(response.status());
  });

  test('getAll rejects an anonymous request', async ({ anonClient }) => {
    const response = await new HolidayEmployeeClient(anonClient).getAll(companyId);
    expect([401, 403]).toContain(response.status());
  });
});
