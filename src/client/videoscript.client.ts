import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

export interface VideoScriptCreateInput {
  companyId: string;
  typeOfBookId: string;
  countryId: string;
  institutionTypeId: string;
  attributeId: string;
  tierDetails: Array<{ tierId: string }>;
  variableDetails: Array<{ variableId: string }>;
  title: string;
  content: string;
  videotype?: string;
}

/**
 * videoscript.controller.js — create/delete use needsAuth; getById/getAllVideoScripts use
 * the vulnerable `authToken` middleware (jwt.decode, no signature check — see
 * src/utils/forge-jwt.ts and videoscript.spec.ts's SECURITY test).
 */
export class VideoScriptClient {
  constructor(private readonly client: BaseApiClient) {}

  create(input: VideoScriptCreateInput): Promise<APIResponse> {
    return this.client.post('/v1/content/videos/script', { data: input });
  }

  getById(id: string, bearerOverride?: string): Promise<APIResponse> {
    return this.client.get(`/v1/content/videos/script/${id}`, {
      headers: bearerOverride ? { Authorization: `Bearer ${bearerOverride}` } : undefined,
    });
  }

  getAll(
    params: { countryId: string; typeOfBookId: string; institutionTypeId: string; companyId: string },
    body: { variables?: unknown } = {},
    bearerOverride?: string,
  ): Promise<APIResponse> {
    return this.client.post(
      `/v1/content/videos/scripts/${params.countryId}/${params.typeOfBookId}/${params.institutionTypeId}/${params.companyId}`,
      { data: body, headers: bearerOverride ? { Authorization: `Bearer ${bearerOverride}` } : undefined },
    );
  }

  delete(id: string): Promise<APIResponse> {
    return this.client.delete(`/v1/content/videos/script/${id}`);
  }
}
