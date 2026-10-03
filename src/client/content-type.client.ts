import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

export interface ContentTypeInput {
  companyId: string;
  contentName: string;
  contentType: string;
  mappingType: 'Unit' | 'Session';
}

export class ContentTypeClient {
  constructor(private readonly client: BaseApiClient) {}

  create(input: ContentTypeInput): Promise<APIResponse> {
    return this.client.post('/v1/content/type/create', { data: input });
  }

  getAll(companyId: string): Promise<APIResponse> {
    return this.client.get(`/v1/content/type/get/all/${companyId}`);
  }

  update(input: { contentTypeId: string; contentName?: string; contentType?: string; mappingType?: string }): Promise<APIResponse> {
    return this.client.put('/v1/content/type/update', { data: input });
  }

  delete(contentTypeId: string): Promise<APIResponse> {
    return this.client.delete(`/v1/content/type/delete/${contentTypeId}`);
  }
}
