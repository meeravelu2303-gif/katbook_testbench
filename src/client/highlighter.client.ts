import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

export interface HighlighterCreateInput {
  refInstID: string;
  refMediumID: string;
  refSectionID: string;
  refSubjectID: string;
  katUnitID: string;
  katSessionID: string;
  wordID: string;
  commonId?: string;
  color: string;
  highlightedText: string;
  userLoginID: string;
  variableDetails?: unknown;
}

/** routes/v1.js:955-959 and routes/v2.js:80-84 — no auth middleware on any of these. */
export class HighlighterClient {
  constructor(private readonly client: BaseApiClient) {}

  create(input: Partial<HighlighterCreateInput>): Promise<APIResponse> {
    return this.client.post('/v1/highlighter/create', { data: input });
  }

  getOne(input: Record<string, unknown>): Promise<APIResponse> {
    return this.client.post('/v1/highlighter/getone', { data: input });
  }

  getAll(input: Record<string, unknown>): Promise<APIResponse> {
    return this.client.post('/v1/highlighter/getall', { data: input });
  }

  update(input: Record<string, unknown>): Promise<APIResponse> {
    return this.client.patch('/v1/highlighter/update', { data: input });
  }

  delete(input: Record<string, unknown>): Promise<APIResponse> {
    return this.client.delete('/v1/highlighter/delete', { data: input });
  }
}
