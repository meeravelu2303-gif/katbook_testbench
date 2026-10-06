import { test, expect } from '../../fixtures/api.fixture';
import { IasInstitutionClient } from '../../client/ias-institution.client';

test.describe.configure({ mode: 'parallel' });

const PLACEHOLDER = '000000000000000000000000';

/**
 * IASInstitution.controller.js (`IASInstitutionController`) — company plan/seat
 * subscriptions. Every route is admin-gated in the handler except the two excluded below
 * (never called — see `ias-institution.client.ts`'s top comment for the full writeup of
 * why `institutionLogin`/`autoRemovalRecharge` are permanently off-limits).
 *
 * INCIDENT (2026-10-05, self-inflicted, corrected): an earlier version of this file used
 * `SEED.COMPANY_ID` (this bench's shared seed company, reused across every domain) for the
 * "delete rejects a nonexistent company" test, on the assumption that no real
 * `IASInstitution` record could exist for it — reasonable-seeming, since every creation
 * path in this controller reliably 500s (see below), but WRONG: a real, pre-existing
 * `IASInstitution` record for `SEED.COMPANY_ID` already existed in the dev DB (the same
 * "real pre-existing data" pattern found elsewhere in this project, e.g.
 * `CURRICULUM.LEAF_SESSION_ID`'s ContentPreparation activities) — and the test's call to
 * the real delete endpoint soft-deleted it (`active: false`; confirmed it's a soft delete,
 * not a hard one, and that `GET /ias/institution/get/all` now shows zero active records).
 * There is no reactivation endpoint in this controller, so this is NOT repairable via the
 * API; left as-is per explicit instruction rather than attempting any further action on it
 * (including direct DB access, which was never used or considered).
 * **Lesson applied below and worth remembering for any future domain**: never point a
 * state-mutating or existence-dependent test at a shared real seed id (`SEED.COMPANY_ID`
 * or any `CURRICULUM.*` constant) for a resource this suite hasn't itself first confirmed
 * (or created) the state of — use an all-zeros placeholder id for every "nonexistent"/
 * precondition-failure case instead, exactly like every other domain's tests already do
 * for `getById`-style "well-formed but nonexistent id" cases. The real seed ids are safe to
 * reuse for read-only lookups and for resources this suite has itself verified or created,
 * never for a destructive or state-changing call made purely to prove a negative.
 *
 * BUG (confirmed live): `addInstitution`/`resetPassword` always return 500 when they do
 * reach a real `.save()` — `IASInsitution.model.js`'s `pre('save')` hook calls
 * `this.isUpdated('password')`, which is not a real Mongoose Document method (confirmed via
 * direct Mongoose 8.9.5 instance inspection — the real method is `isModified`). Every save
 * with a non-null password throws a `TypeError`, caught cleanly by this codebase's `To()`
 * wrapper — a reliable 500, not a crash (unlike the two excluded routes). Combined with the
 * incident above, real `IASInstitution` data is now confirmed to be both rare AND unsafe to
 * assume doesn't exist — every test below uses the placeholder id so it is fully decoupled
 * from whatever real state the dev DB happens to have at any given moment.
 */
test.describe('Institution — IASInstitution (structurally blocked, see top-of-file note)', () => {
  test('add rejects a non-Admin caller', async ({ clientAs }) => {
    const client = await clientAs('contentUploader');
    const response = await new IasInstitutionClient(client).add(PLACEHOLDER, PLACEHOLDER, 'Password@123');
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/admin/i);
  });

  test('add rejects missing required fields', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new IasInstitutionClient(client).add('', '', '');
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/required fields/i);
  });

  test('add rejects a nonexistent company', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new IasInstitutionClient(client).add(PLACEHOLDER, PLACEHOLDER, 'Password@123');
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('Company not found!');
  });

  test('add rejects an anonymous request', async ({ anonClient }) => {
    const response = await new IasInstitutionClient(anonClient).add(PLACEHOLDER, PLACEHOLDER, 'Password@123');
    expect([401, 403]).toContain(response.status());
  });

  test('resetPassword rejects a nonexistent company', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new IasInstitutionClient(client).resetPassword(PLACEHOLDER, 'Password@123');
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('Company not found!');
  });

  test('get rejects a nonexistent company', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new IasInstitutionClient(client).get(PLACEHOLDER);
    expect(response.status()).toBe(400);
  });

  test('getAll runs cleanly as Admin (status not asserted — this list depends entirely on real, shared, out-of-this-suite\'s-control data)', async ({
    clientAs,
  }) => {
    const client = await clientAs('admin');
    const response = await new IasInstitutionClient(client).getAll();
    expect([200, 400]).toContain(response.status());
  });

  test('block rejects a nonexistent company', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new IasInstitutionClient(client).block(PLACEHOLDER);
    expect(response.status()).toBe(400);
  });

  test('unblock rejects a nonexistent company', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new IasInstitutionClient(client).unblock(PLACEHOLDER);
    expect(response.status()).toBe(400);
  });

  test('delete rejects a nonexistent company', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new IasInstitutionClient(client).delete(PLACEHOLDER);
    expect(response.status()).toBe(400);
  });

  test('get rejects an anonymous request', async ({ anonClient }) => {
    const response = await new IasInstitutionClient(anonClient).get(PLACEHOLDER);
    expect([401, 403]).toContain(response.status());
  });
});
