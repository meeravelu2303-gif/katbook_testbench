import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

export interface CreateManagementResourceInput {
  companyId: string;
  name: string;
  isRework?: boolean;
}

export interface UpdateManagementResourceInput {
  name?: string;
  isRework?: boolean;
}

/**
 * Typed wrapper over the two "management" CRUD resources — Preparations and Uploadings —
 * which share an identical shape in the backend (ManagementPreparation.controller.js /
 * ManagementUploading.controller.js), differing only in field name
 * (managementPreparation vs managementUploading) and endpoint path.
 */
export class ManagementClient {
  constructor(private readonly client: BaseApiClient) {}

  createPreparation(input: CreateManagementResourceInput): Promise<APIResponse> {
    return this.client.post('/v1/management/preparations', {
      data: { companyId: input.companyId, managementPreparation: input.name, isRework: input.isRework },
    });
  }

  getAllPreparations(companyId: string): Promise<APIResponse> {
    return this.client.get('/v1/management/preparations', { params: { companyId } });
  }

  getPreparationById(id: string): Promise<APIResponse> {
    return this.client.get(`/v1/management/preparations/${id}`);
  }

  updatePreparation(companyId: string, id: string, input: UpdateManagementResourceInput): Promise<APIResponse> {
    return this.client.patch(`/v1/management/preparations/${companyId}/${id}`, {
      data: { managementPreparation: input.name, isRework: input.isRework },
    });
  }

  deletePreparation(id: string): Promise<APIResponse> {
    return this.client.delete(`/v1/management/preparations/${id}`);
  }

  createUploading(input: CreateManagementResourceInput): Promise<APIResponse> {
    return this.client.post('/v1/management/uploadings', {
      data: { companyId: input.companyId, managementUploading: input.name, isRework: input.isRework },
    });
  }

  getAllUploadings(companyId: string): Promise<APIResponse> {
    return this.client.get('/v1/management/uploadings', { params: { companyId } });
  }

  getUploadingById(id: string): Promise<APIResponse> {
    return this.client.get(`/v1/management/uploadings/${id}`);
  }

  updateUploading(companyId: string, id: string, input: UpdateManagementResourceInput): Promise<APIResponse> {
    return this.client.patch(`/v1/management/uploadings/${companyId}/${id}`, {
      data: { managementUploading: input.name, isRework: input.isRework },
    });
  }

  deleteUploading(id: string): Promise<APIResponse> {
    return this.client.delete(`/v1/management/uploadings/${id}`);
  }
}
