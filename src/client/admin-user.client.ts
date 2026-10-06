import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

export interface AddUserInput {
  userName: string;
  email: string;
  password: string;
  userTypeId: string;
  companyId: string;
  reportingTo: string;
  isThirdParty?: boolean;
}

/**
 * user.controller.js — the "Admin" swagger tag is mostly this file's User-management layer
 * (register/login already covered by `src/tests/user/login.spec.ts`/`auth.fixture.ts`;
 * `addUser` already used by `scripts/bootstrap-admin.ts`/`bootstrap-content-uploader.ts`).
 *
 * CRITICAL — `updateAdminPassword` (`PUT /admin/update/password/:userId`) has NO client
 * method here, deliberately: confirmed from source that this route has **no auth
 * middleware at all** (`routes/v1.js:909`), looks up "the first UserType with code
 * 'MA@1'" and then any active, unblocked user with that exact userTypeId+companyId, and
 * overwrites their password unconditionally. If the first `MA@1` UserType MongoDB happens
 * to return is this test bench's own seed `SEED.ADMIN_USER_TYPE_ID`/`SEED.COMPANY_ID`
 * combination, this is an unauthenticated account-takeover of the bench's own admin
 * account. Never called, by explicit user decision — not even with a placeholder id,
 * since confirming the "not found" path for one userId says nothing about what a
 * DIFFERENT, real userId would do, and there is no way to enumerate "every real MA@1 user
 * in every company" safely to prove it's otherwise. Documented from source-reading alone.
 *
 * CRITICAL (same severity class, this one DOES have a method, but every test using it must
 * only ever target a placeholder/disposable id, never a real shared one) —
 * `updateUserPassword` (`PUT /admin/content/user/update/:userId`) has NO self/peer
 * exclusion (confirmed from source: `User.findOne({_id: userId, companyId: user.companyId,
 * active: true, block: false})` — no `$nin` on userTypeId or on the caller's own id, unlike
 * every sibling route in this same file). A caller could change their OWN password or
 * usertype (self-demotion) or any other admin's, including this bench's own seed admin, by
 * passing the wrong id. Every test using this method targets ONLY a disposable user this
 * suite itself creates via `addUser`, never `SEED.COMPANY_ID`'s real admin or any other
 * real shared id.
 *
 * CRITICAL — `removeUserPublishingPlanningByAdmin` (`POST /admin/publishingplanning/remove`)
 * CRASHES THE WHOLE BACKEND PROCESS if `activities` is missing/null/non-array/malformed —
 * confirmed from source: `isEmpty(activities)` calls `Object.keys(activities)`, which
 * throws a TypeError on `undefined`/`null`, uncaught, in a codebase with no
 * `unhandledRejection` handler anywhere (Node 24 + Express 4 = process exit; pm2 restarts
 * it, but it bounces for everyone on this shared dev server). This check runs BEFORE the
 * admin-only gate, so it's reachable by ANY authenticated user, not just admins. The method
 * below requires a real array argument at the TypeScript level specifically to make an
 * accidental `undefined` call harder — but the only safe values to ever actually pass are
 * `[]` (400s cleanly at the `isEmpty` check) or omitting the call entirely. NEVER pass a
 * non-empty array unless every entry is a real `{_id: <valid hex ObjectId>}` object you
 * have independently verified belongs to planning data this suite itself created.
 *
 * Verified from source (user.controller.js, routes/v1.js:900-917):
 * - `addUser` requires all of `userName, email, password, userTypeId, companyId,
 *   reportingTo, isThirdParty`; rejects a non-Admin caller, a nonexistent/Admin-coded
 *   `userTypeId` ("Non Admin user only allow to register here!."), a nonexistent/blocked
 *   `reportingTo` user, and duplicate `userName`/`email`. Its success response is just a
 *   message — confirmed NOT to echo the saved doc, no password-hash-leak risk here.
 * - `blockUser`/`enableUser` are exact mirror-image, fully-reversible, company-scoped,
 *   `$nin: user.userTypeId`-guarded (can't target the caller's own usertype) — responses
 *   are `{message, userName}` only, no leak.
 * - `getAllByAdmin`/`getByAdmin`/`getAllActiveByAdmin`/`getAllByUserType` ALL confirmed to
 *   leak the bcrypt password hash: `User.find/findOne(...).populate(...)` never `.select()`s
 *   the top-level document, only the populated sub-fields, and the schema's `password`
 *   field has no `select: false`. `getAllByUserType`'s response key is singular `user` even
 *   though the value is an array — a cosmetic bug, not a functional one.
 * - `getUsageLogs` (`GET /admin/logger/getall`) is needsAuth but NOT admin-gated (any
 *   logged-in user may call it), and is NOT scoped to that user despite the function name
 *   `GetUsageLogsofUser` — it's a global count-by-date over every row in the `loggerModel`
 *   collection. It also reads `req.query.date` but never uses the parsed value in the
 *   query — confirmed dead code, so a `?date=` filter has zero effect. 404s with `{message:
 *   "No Logger data found"}` if the collection is empty rather than an empty object.
 */
export class AdminUserClient {
  constructor(private readonly client: BaseApiClient) {}

  addUser(input: AddUserInput): Promise<APIResponse> {
    return this.client.post('/v1/admin/content/user/add', { data: input });
  }

  getAllByAdmin(): Promise<APIResponse> {
    return this.client.get('/v1/admin/content/user/getAll');
  }

  getByAdmin(userId: string): Promise<APIResponse> {
    return this.client.get(`/v1/admin/content/user/get/${userId}`);
  }

  block(userId: string): Promise<APIResponse> {
    return this.client.put(`/v1/admin/content/user/block/${userId}`, {});
  }

  enable(userId: string): Promise<APIResponse> {
    return this.client.put(`/v1/admin/content/user/enable/${userId}`, {});
  }

  /** See the top-of-file CRITICAL note — only ever call with a disposable userId this suite created itself. */
  updatePassword(userId: string, body: { password?: string; reportingTo?: string; userTypeId?: string; isThirdParty?: boolean }): Promise<APIResponse> {
    return this.client.put(`/v1/admin/content/user/update/${userId}`, { data: body });
  }

  getAllActiveByAdmin(): Promise<APIResponse> {
    return this.client.get('/v1/admin/active/content/user/getAll');
  }

  getAllByUserType(userTypeId: string): Promise<APIResponse> {
    return this.client.get(`/v1/admin/content/user/getAll/type/${userTypeId}`);
  }

  /** See the top-of-file CRITICAL note — `activities` must be `[]` or real, independently-verified `{_id}` objects only. */
  removePublishingPlanning(publisher: string, activities: Array<{ _id: string }>): Promise<APIResponse> {
    return this.client.post('/v1/admin/publishingplanning/remove', { data: { publisher, activities } });
  }

  getUsageLogs(): Promise<APIResponse> {
    return this.client.get('/v1/admin/logger/getall');
  }
}
