import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

/**
 * routes/v1.js:399-403 — no auth middleware on any route, including the destructive bulk
 * migration endpoint (PUT /history/existinghistory/upload, mutates up to 1000 records via
 * R2 uploads). That one is intentionally NOT wrapped here / never called by tests — see
 * content-history.spec.ts for why.
 */
export class ContentHistoryClient {
  constructor(private readonly client: BaseApiClient) {}

  getAllForContent(contentId: string): Promise<APIResponse> {
    return this.client.get(`/v1/history/content/${contentId}`);
  }

  getById(id: string): Promise<APIResponse> {
    return this.client.get(`/v1/history/${id}`);
  }

  getAllForBook(yearId: string): Promise<APIResponse> {
    return this.client.get(`/v1/history/book/${yearId}`);
  }

  getAllForUnit(unitId: string): Promise<APIResponse> {
    return this.client.get(`/v1/history/unit/${unitId}`);
  }
}
