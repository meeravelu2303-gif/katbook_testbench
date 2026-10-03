import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

export interface ContentCreateInput {
  companyId: string;
  typeOfBook: string;
  countryId: string;
  institutionTypeId: string;
  attributeId: string;
  tierDetails: Array<{ tierId: string }>;
  variableDetails: Array<{ variableId: string }>;
  contentType: string;
  content: string;
}

/** content.controller.js — the 6 core CRUD ops out of ~50+ routes in this controller. */
export class ContentClient {
  constructor(private readonly client: BaseApiClient) {}

  create(input: ContentCreateInput): Promise<APIResponse> {
    return this.client.post('/v1/content/create', { data: input });
  }

  getById(contentId: string): Promise<APIResponse> {
    return this.client.get(`/v1/content/fetch/${contentId}`);
  }

  getInfo(contentId: string, typeOfBook: string, countryId: string, institutionTypeId: string, companyId: string): Promise<APIResponse> {
    return this.client.get(`/v1/content/getInfo/${contentId}/${typeOfBook}/${countryId}/${institutionTypeId}/${companyId}`);
  }

  update(
    contentId: string,
    countryId: string,
    institutionTypeId: string,
    companyId: string,
    input: {
      content?: string;
      audioUrl?: string;
      processedTypeId?: string;
      processedOccurrenceType?: string;
      processedKeywords?: string;
      updateModule?: string;
    },
  ): Promise<APIResponse> {
    return this.client.put(`/v1/content/update/${contentId}/${countryId}/${institutionTypeId}/${companyId}`, { data: input });
  }

  delete(contentId: string, countryId: string, institutionTypeId: string, companyId: string): Promise<APIResponse> {
    return this.client.delete(`/v1/content/delete/${contentId}/${countryId}/${institutionTypeId}/${companyId}`);
  }

  getAll(
    countryId: string,
    typeOfBook: string,
    institutionTypeId: string,
    companyId: string,
    variables: Array<{ variableId: string }>,
  ): Promise<APIResponse> {
    return this.client.post(`/v1/content/getAll/${countryId}/${typeOfBook}/${institutionTypeId}/${companyId}`, {
      data: { variables },
    });
  }
}
