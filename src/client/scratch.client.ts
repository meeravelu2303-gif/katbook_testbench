import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

/**
 * All 5 routes (routes/v1.js:1024-1028) have NO auth middleware at all, and the
 * underlying collection is global — not scoped by company or user
 * (scratchfile.controller.js never filters by companyId/createdBy). See the SECURITY
 * tests in scratch.spec.ts.
 */
export class ScratchClient {
  constructor(private readonly client: BaseApiClient) {}

  create(code: string): Promise<APIResponse> {
    return this.client.post('/v1/scratch/create', { data: { code } });
  }

  getAll(): Promise<APIResponse> {
    return this.client.get('/v1/scratch/getall');
  }

  getById(id: string): Promise<APIResponse> {
    return this.client.get(`/v1/scratch/getone/${id}`);
  }

  update(id: string, code: string): Promise<APIResponse> {
    return this.client.put(`/v1/scratch/update/${id}`, { data: { code } });
  }

  delete(id: string): Promise<APIResponse> {
    return this.client.delete(`/v1/scratch/delete/${id}`);
  }
}
