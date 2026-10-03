import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

export interface HandbookCreateInput {
  companyId: string;
  typeOfBook: string;
  countryId: string;
  institutionTypeId: string;
  attributeId: string;
  tierDetails: Array<{ tierId: string }>;
  variableDetails: Array<{ variableId: string }>;
  content: string;
  isUnit: boolean;
}

/**
 * handbook.controller.js — CreateTeachersHandbook (POST /content/handbook/create) is
 * dual-purpose: no `_id` in the body creates, an `_id` in the body updates instead (same
 * needsAuth route). GetAll and GetHandbookByQuery are fully public (routes/v1.js:804,807-808).
 * Update/Delete (the dedicated routes) are needsAuth + admin-gated (usertype.code==='MA@1')
 * for Delete.
 */
export class HandbookClient {
  constructor(private readonly client: BaseApiClient) {}

  create(input: HandbookCreateInput): Promise<APIResponse> {
    return this.client.post('/v1/content/handbook/create', { data: input });
  }

  updateViaCreate(id: string, content: string, isUnit: boolean): Promise<APIResponse> {
    return this.client.post('/v1/content/handbook/create', { data: { _id: id, content, isUnit } });
  }

  getAllByCompany(params: {
    countryId: string;
    institutionTypeId: string;
    companyId: string;
    typeOfBookId: string;
  }): Promise<APIResponse> {
    return this.client.post(
      `/v1/content/handbook/getall/${params.countryId}/${params.institutionTypeId}/${params.companyId}/${params.typeOfBookId}`,
      {},
    );
  }

  delete(handbookId: string, countryId: string, institutionTypeId: string, companyId: string): Promise<APIResponse> {
    return this.client.delete(`/v1/content/handbook/delete/${handbookId}/${countryId}/${institutionTypeId}/${companyId}`);
  }

  /** The dedicated PUT route (UpdateTeacherHandbook) — distinct from the dual-purpose create/update-via-create above. */
  updateDedicated(
    handbookId: string,
    countryId: string,
    institutionTypeId: string,
    companyId: string,
    content: string,
    isUnit: boolean,
    timeout?: number,
  ): Promise<APIResponse> {
    return this.client.put(`/v1/content/handbook/update/${handbookId}/${countryId}/${institutionTypeId}/${companyId}`, {
      data: { content, isUnit },
      timeout,
    });
  }

  getAllByVariables(
    params: { countryId: string; typeOfBookId: string; institutionTypeId: string; companyId: string },
    variables: Array<{ variableId: string }>,
  ): Promise<APIResponse> {
    return this.client.post(
      `/v1/content/handbook/getall/variables/${params.countryId}/${params.typeOfBookId}/${params.institutionTypeId}/${params.companyId}`,
      { data: { variables } },
    );
  }

  getByQuery(query: Record<string, string>, timeout?: number): Promise<APIResponse> {
    const qs = new URLSearchParams(query).toString();
    return this.client.get(`/v1/content/handbooks?${qs}`, { timeout });
  }
}
