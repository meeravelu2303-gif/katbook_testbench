import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

export interface InstitutionCodeParams {
  companyId: string;
  typeOfBook: string;
  countryId: string;
  institutionTypeId: string;
}

/**
 * institutionCode.controller.js (`InstitutionCodeController`) — activation keys, keyed by
 * company+typeOfBook+country+institutionType (refs the `InstitutionTypeClient` collection).
 * No pre-save-hook defect here (unlike IASInstitution/InstitutionUser) and no delete route
 * at all for this resource — every record this suite creates is a permanent stray, by
 * design of the API (not a bug to route around, there's simply no delete endpoint).
 */
export class InstitutionCodeClient {
  constructor(private readonly client: BaseApiClient) {}

  create(p: InstitutionCodeParams, keyCount: number): Promise<APIResponse> {
    return this.client.post('/v1/institution/key/create', {
      data: { companyId: p.companyId, typeOfBookId: p.typeOfBook, countryId: p.countryId, institutionTypeId: p.institutionTypeId, keyCount },
    });
  }

  getAll(p: Pick<InstitutionCodeParams, 'companyId' | 'typeOfBook' | 'countryId'>): Promise<APIResponse> {
    return this.client.get(`/v1/institution/key/get/all/${p.companyId}/${p.typeOfBook}/${p.countryId}`);
  }

  get(p: InstitutionCodeParams): Promise<APIResponse> {
    return this.client.get(`/v1/institution/key/get/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}`);
  }

  block(p: InstitutionCodeParams): Promise<APIResponse> {
    return this.client.put(`/v1/institution/block/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}`, {});
  }

  unblock(p: InstitutionCodeParams): Promise<APIResponse> {
    return this.client.put(`/v1/institution/unblock/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}`, {});
  }

  blockKey(p: InstitutionCodeParams, key: string): Promise<APIResponse> {
    return this.client.put(`/v1/institution/key/block/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}`, { data: { key } });
  }

  unblockKey(p: InstitutionCodeParams, key: string): Promise<APIResponse> {
    return this.client.put(`/v1/institution/key/unblock/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}`, { data: { key } });
  }

  updateKeys(p: InstitutionCodeParams, keyCount: number): Promise<APIResponse> {
    return this.client.put(`/v1/institution/key/update/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}`, { data: { keyCount } });
  }
}
