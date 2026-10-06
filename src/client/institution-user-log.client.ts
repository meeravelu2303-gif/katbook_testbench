import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

/**
 * InstitutionUserLog.controller.js (`InstitutionUserLogController`) — self-contained, no
 * shared-model defects. `createInsitutionUserLog` is idempotent per (userId, ip, browser,
 * today) — safe to call repeatedly with the admin actor. `getAllLogAllInstitutionUser` has
 * no admin or company-ownership check at all (confirmed from source) — any authenticated
 * caller can read any company's logs (IDOR) — tested here only against our own
 * `SEED.COMPANY_ID`, never exploited against another real company's data.
 */
export class InstitutionUserLogClient {
  constructor(private readonly client: BaseApiClient) {}

  createForSelf(): Promise<APIResponse> {
    return this.client.post('/v1/institution/user/log/create', {});
  }

  getAllForSelf(): Promise<APIResponse> {
    return this.client.get('/v1/institution/user/log/get/all');
  }

  getAllForCompany(companyId: string): Promise<APIResponse> {
    return this.client.get(`/v1/institution/user/log/get/all/${companyId}`);
  }
}
