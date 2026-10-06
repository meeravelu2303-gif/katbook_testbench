import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

/**
 * IASInstitution.controller.js (`IASInstitutionController`) — company plan/seat
 * subscriptions (collection `IASInstitution`). `addInstitution`/`resetPassword` always
 * return 500: their model's `pre('save')` hook calls `this.isUpdated('password')`, which is
 * not a real Mongoose Document method (confirmed live via Mongoose 8.9.5 instance
 * inspection — the real method is `isModified`) — any save with a non-null password throws
 * a `TypeError`, caught cleanly by this codebase's `To()` wrapper (NOT a crash, unlike the
 * two routes excluded below). Since no real `IASInstitution` record can ever be created via
 * this API, every other route here (recharge/block/unblock/get/delete) can only be tested
 * for its own precondition-failure path ("Institution was not exists!."), never a real
 * happy path.
 *
 * CRITICAL — NEITHER `institutionLogin` (`POST /institution/login`) NOR
 * `autoRemovalRecharge` (`PUT /ias/institution/plan/remove/auto`) has a client method here,
 * deliberately:
 * - `institutionLogin` references `user.userTypeId` on its very first line, but `user` is
 *   never declared anywhere in the function (no `req.user`, and the route has no auth
 *   middleware at all) — confirmed live-equivalent via direct source reading. This is a
 *   plain `ReferenceError` on every call, with the same uncaught-crash consequence as
 *   `deleteInstitutionTypeName` above. **This is the exact endpoint this test bench's own
 *   `institution` actor (`src/fixtures/auth.fixture.ts`) is configured to call** — see the
 *   warning added there.
 * - `autoRemovalRecharge` has NO auth middleware (confirmed from routes/v1.js) and calls
 *   `ReE`/`ReS` directly inside a `.map(async ...)` callback for every matching document —
 *   with 0 or 1 active `IASInstitution` docs this is harmless, but with >= 2 the second
 *   callback's response attempt throws `ERR_HTTP_HEADERS_SENT` on an already-sent response,
 *   unhandled and uncaught, crashing the process. Since this route is unauthenticated and
 *   the trigger condition depends on ambient server state this suite cannot verify is safe
 *   (how many real `IASInstitution` docs already exist), it is never called under any
 *   circumstances.
 *
 * Both are documented from source-reading only, by explicit decision — this is a shared dev
 * server other work may depend on, and the downside of being wrong isn't worth it.
 */
export class IasInstitutionClient {
  constructor(private readonly client: BaseApiClient) {}

  add(companyId: string, planId: string, password: string): Promise<APIResponse> {
    return this.client.post('/v1/ias/institution/add', { data: { companyId, planId, password } });
  }

  recharge(body: Record<string, unknown>): Promise<APIResponse> {
    return this.client.put('/v1/ias/institution/recharge', { data: body });
  }

  removePlanManual(body: Record<string, unknown>): Promise<APIResponse> {
    return this.client.put('/v1/ias/institution/plan/remove/manual', { data: body });
  }

  block(companyId: string): Promise<APIResponse> {
    return this.client.put(`/v1/ias/institution/block/${companyId}`, {});
  }

  unblock(companyId: string): Promise<APIResponse> {
    return this.client.put(`/v1/ias/institution/unblock/${companyId}`, {});
  }

  getAll(): Promise<APIResponse> {
    return this.client.get('/v1/ias/institution/get/all');
  }

  get(companyId: string): Promise<APIResponse> {
    return this.client.get(`/v1/ias/institution/get/${companyId}`);
  }

  resetPassword(companyId: string, password: string): Promise<APIResponse> {
    return this.client.put('/v1/ias/institution/password/reset', { data: { companyId, password } });
  }

  delete(companyId: string): Promise<APIResponse> {
    return this.client.delete(`/v1/ias/institution/delete/${companyId}`);
  }
}
