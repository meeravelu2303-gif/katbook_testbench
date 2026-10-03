import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

/** routes/v1.js:964-968 and routes/v2.js:70-75 — no auth middleware on any of these. */
export class HyperlinkClient {
  constructor(private readonly client: BaseApiClient) {}

  create(input: Record<string, unknown>): Promise<APIResponse> {
    return this.client.post('/v1/hyperlink/create', { data: input });
  }

  getOne(input: Record<string, unknown>): Promise<APIResponse> {
    return this.client.post('/v1/hyperlink/getone', { data: input });
  }

  getAll(input: Record<string, unknown>): Promise<APIResponse> {
    return this.client.post('/v1/hyperlink/getall', { data: input });
  }

  update(input: Record<string, unknown>): Promise<APIResponse> {
    return this.client.patch('/v1/hyperlink/update', { data: input });
  }

  delete(input: Record<string, unknown>): Promise<APIResponse> {
    return this.client.delete('/v1/hyperlink/delete', { data: input });
  }
}
