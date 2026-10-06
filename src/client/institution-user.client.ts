import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

export interface InstitutionUserRegisterInput {
  userName: string;
  email: string;
  password: string;
  userTypeId: string;
  companyId: string;
}

/**
 * InsitutionUser.controller.js (`InstitutionUserController`) — institution end-users
 * (collection `InstitutionUser`, note the path spelling is mixed: `insitution` on
 * register/login/profile, `institution` everywhere else, confirmed from routes/v1.js, not a
 * typo in this client). Registration requires an active `IASInstitution` doc for the target
 * company to already exist (`addInstitution` must have succeeded first) — since that always
 * 500s (see `ias-institution.client.ts`), registration can never reach its own `.save()`
 * call in practice; it 400s earlier on "institution was not exists" first. `InstitutionUser`
 * shares the same broken `pre('save')` hook as `IASInstitution` (`this.isUpdated('password')`,
 * not a real Mongoose method) — confirmed live via the same Mongoose instance inspection —
 * so even with a real IAS doc, `.save()` would 500 safely (caught by `To()`), never crash.
 *
 * `InstitutionUserLogin` is NOT the crash-prone `institutionLogin` (that one lives on
 * `IasInstitutionClient` and is deliberately excluded there) — this one is structurally
 * safe to call (confirmed live-equivalent via source reading: no undeclared-variable
 * reference), it just can never succeed since no real `InstitutionUser`/`IASInstitution`
 * data can exist. It also has a confirmed real bug: it never checks that the resolved user
 * actually belongs to the submitted `companyId` before consuming a seat from that
 * company's `activatedKey` — a cross-company seat-consumption issue, documented but not
 * exploitable in this environment since no real institution user can exist to prove it
 * against.
 */
export class InstitutionUserClient {
  constructor(private readonly client: BaseApiClient) {}

  register(input: InstitutionUserRegisterInput): Promise<APIResponse> {
    return this.client.post('/v1/insitution/user/register', { data: input });
  }

  login(userName: string, password: string, companyId: string): Promise<APIResponse> {
    return this.client.post('/v1/insitution/user/login', { data: { userName, password, companyId } });
  }

  profile(): Promise<APIResponse> {
    return this.client.get('/v1/insitution/user/profile');
  }

  block(companyId: string, userId: string): Promise<APIResponse> {
    return this.client.put(`/v1/institution/user/block/${companyId}/${userId}`, {});
  }

  unblock(companyId: string, userId: string): Promise<APIResponse> {
    return this.client.put(`/v1/institution/user/unblock/${companyId}/${userId}`, {});
  }

  getAllByAdmin(companyId: string): Promise<APIResponse> {
    return this.client.get(`/v1/institution/user/get/all/${companyId}`);
  }

  getByAdmin(companyId: string, userId: string): Promise<APIResponse> {
    return this.client.get(`/v1/institution/user/get/${companyId}/${userId}`);
  }

  resetPassword(companyId: string, userId: string, password: string): Promise<APIResponse> {
    return this.client.put('/v1/institution/user/password/reset', { data: { companyId, userId, password } });
  }

  deleteByAdmin(companyId: string, userId: string): Promise<APIResponse> {
    return this.client.delete(`/v1/institution/user/delete/${companyId}/${userId}`);
  }
}
