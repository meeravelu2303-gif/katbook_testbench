import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

export interface ContentPreparationInput {
  companyId: string;
  name: string;
  isRework?: boolean;
}

/**
 * ContentPreparationController.js / ContentUploadingController.js — mirror resources
 * (`content/prepation/name/*` vs `content/uploading/name/*`), same shape as
 * management.client.ts's ManagementClient but for content-authoring "activity names".
 * Unlike the management pair, message wording here is consistently resource-specific — no
 * copy-paste bugs found on this one.
 */
export class ContentPreparationClient {
  constructor(
    private readonly client: BaseApiClient,
    private readonly variant: 'preparation' | 'uploading',
  ) {}

  private get basePath(): string {
    return this.variant === 'preparation' ? '/v1/content/prepation/name' : '/v1/content/uploading/name';
  }

  private nameField(): 'contentPreparationName' | 'contentUploadingName' {
    return this.variant === 'preparation' ? 'contentPreparationName' : 'contentUploadingName';
  }

  create(input: ContentPreparationInput): Promise<APIResponse> {
    return this.client.post(`${this.basePath}/create`, {
      data: { companyId: input.companyId, [this.nameField()]: input.name, isRework: input.isRework },
    });
  }

  getAllByCompany(companyId: string): Promise<APIResponse> {
    return this.client.get(`${this.basePath}/getall/${companyId}`);
  }

  getById(companyId: string, id: string): Promise<APIResponse> {
    return this.client.get(`${this.basePath}/get/${companyId}/${id}`);
  }

  update(companyId: string, id: string, input: { name?: string; isRework?: boolean }): Promise<APIResponse> {
    return this.client.put(`${this.basePath}/update`, {
      data: {
        companyId,
        [this.variant === 'preparation' ? 'contentPreparationNameId' : 'contentUploadingNameId']: id,
        [this.nameField()]: input.name,
        isRework: input.isRework,
      },
    });
  }

  delete(companyId: string, id: string): Promise<APIResponse> {
    return this.client.delete(`${this.basePath}/delete/${companyId}/${id}`);
  }
}
