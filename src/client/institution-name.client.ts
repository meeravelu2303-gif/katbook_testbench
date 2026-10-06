import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

/**
 * attribute.controller.js's `getAllInstitutionName` — tagged `InstitutionName` in swagger
 * (its own domain per the consolidation table), but lives in `AttributeController` and
 * reads the `Attribute` model's `institutionName` field directly, reusing the same real
 * CURRICULUM chain every other domain's tests already seeded against.
 */
export class InstitutionNameClient {
  constructor(private readonly client: BaseApiClient) {}

  getAll(companyId: string, typeOfBook: string, countryId: string, institutionTypeId: string): Promise<APIResponse> {
    return this.client.get(`/v1/institutionName/${companyId}/${typeOfBook}/${countryId}/${institutionTypeId}`);
  }
}
