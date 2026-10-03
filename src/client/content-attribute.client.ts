import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

export class ContentAttributeClient {
  constructor(private readonly client: BaseApiClient) {}

  create(companyId: string, contentAttribute: string): Promise<APIResponse> {
    return this.client.post('/v1/content/attribute', { data: { companyId, contentAttribute } });
  }

  getAll(companyId: string): Promise<APIResponse> {
    return this.client.get(`/v1/content/attribute/${companyId}`);
  }
}
