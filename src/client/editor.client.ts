import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

export class EditorClient {
  constructor(private readonly client: BaseApiClient) {}

  logEvent(module: string): Promise<APIResponse> {
    return this.client.post('/v1/editor/load/add', { data: { module } });
  }

  getAll(range: { startdate?: string; enddate?: string } = {}, timeout?: number): Promise<APIResponse> {
    return this.client.post('/v1/editor/load/get-all', { data: range, timeout });
  }

  getAllForInterval(startdate?: string, enddate?: string): Promise<APIResponse> {
    return this.client.post('/v1/editor/load/intervals/get-all', { data: { startdate, enddate } });
  }

  getAllForUser(userId: string, range: { startdate?: string; enddate?: string } = {}): Promise<APIResponse> {
    return this.client.post('/v1/editor/load/user/get-all', { data: { userId, ...range } });
  }
}
