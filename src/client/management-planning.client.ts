import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

export interface PlanningCreateItem {
  companyId: string;
  sequenceNo: number;
  assigneeId: string; // contentDeveloperId or contentUploaderId, mapped per-resource below
  selectedActivities: string;
  duration: number;
  delay: number;
  esd: string; // YYYY-MM-DD
  efd: string; // YYYY-MM-DD
}

export interface PlanningStatusUpdate {
  id?: string; // required for the bulk endpoint, ignored for the by-id endpoint
  lsd: string;
  lfd: string;
  status: 'InProgress' | 'Completed';
  remarks?: string;
}

export interface PlanningQuery {
  companyId?: string;
  assigneeId?: string;
  selectedActivities?: string;
  status?: string;
  active?: boolean;
}

/**
 * The developer-side (/v1/management/preparations/planning) and uploader-side
 * (/v1/management/uploadings/planning) task-assignment workflows are structural mirrors —
 * confirmed by reading managementplanningpreparation.controller.js and
 * managementuploadingpreparation.controller.js directly — differing only in the
 * contentDeveloperId/contentUploaderId field name and which "management activity" resource
 * (Preparations vs Uploadings, from management.client.ts) selectedActivities references.
 */
export class ManagementPlanningClient {
  constructor(
    private readonly client: BaseApiClient,
    private readonly variant: 'developer' | 'uploader',
  ) {}

  private get basePath(): string {
    return this.variant === 'developer' ? '/v1/management/preparations/planning' : '/v1/management/uploadings/planning';
  }

  private assigneeField(): 'contentDeveloperId' | 'contentUploaderId' {
    return this.variant === 'developer' ? 'contentDeveloperId' : 'contentUploaderId';
  }

  private toItemPayload(item: PlanningCreateItem): Record<string, unknown> {
    const { assigneeId, ...rest } = item;
    return { ...rest, [this.assigneeField()]: assigneeId };
  }

  create(items: PlanningCreateItem[]): Promise<APIResponse> {
    return this.client.post(this.basePath, { data: { data: items.map((i) => this.toItemPayload(i)) } });
  }

  updateBulk(items: PlanningStatusUpdate[]): Promise<APIResponse> {
    return this.client.patch(this.basePath, { data: { data: items } });
  }

  updateById(id: string, input: Omit<PlanningStatusUpdate, 'id'>): Promise<APIResponse> {
    return this.client.patch(`${this.basePath}/${id}`, { data: input });
  }

  getForSelf(): Promise<APIResponse> {
    return this.client.get(this.basePath.replace('/planning', '/user/planning'));
  }

  getAll(query: PlanningQuery = {}): Promise<APIResponse> {
    const { assigneeId, ...rest } = query;
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) params[k] = String(v);
    if (assigneeId) params[this.assigneeField()] = assigneeId;
    return this.client.get(this.basePath, { params });
  }

  getById(id: string): Promise<APIResponse> {
    return this.client.get(`${this.basePath}/${id}`);
  }

  delete(id: string): Promise<APIResponse> {
    return this.client.delete(`${this.basePath}/${id}`);
  }
}
