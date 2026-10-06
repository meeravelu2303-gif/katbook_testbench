import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

export interface StaffAllocationCreateInput {
  companyId: string;
  typeOfBook: string;
  countryId: string;
  institutionTypeId: string;
  attributeId: string;
  tierDetails: Array<{ tierId: string }>;
  variableDetails: Array<{ variableId: string }>;
  contentDeveloperId: string;
}

export interface AttributeUserParams {
  companyId: string;
  typeOfBook: string;
  countryId: string;
  institutionTypeId: string;
  attributeId: string;
  contentDeveloperId: string;
}

/**
 * StaffAllocationController.js — 12 routes, all `needsAuth`, no dead code (confirmed by
 * diffing exports against routes/v1.js). Tagged `Staff` in swagger (the `hr-staff` domain,
 * section 2) except `GetAllContentPreparationNameByYear`, tagged `Content` — first touched
 * in sections 15/16 purely as a `dairy`/`planning` test-data probe (the
 * `StaffAllocationContentPreparationId`/`StaffAllocationContentUploadingId` join fields).
 * This is the domain's own dedicated pass.
 */
export class StaffAllocationClient {
  constructor(
    private readonly client: BaseApiClient,
    private readonly variant: 'preparation' | 'uploading',
  ) {}

  private seg(preparation: string, uploading: string): string {
    return this.variant === 'preparation' ? preparation : uploading;
  }

  create(input: StaffAllocationCreateInput): Promise<APIResponse> {
    const path = this.seg('/v1/staff/content/prepation/create', '/v1/staff/content/uploading/create');
    return this.client.post(path, { data: input });
  }

  getAll(p: AttributeUserParams): Promise<APIResponse> {
    const base = this.seg('/v1/staff/content/perpation/get', '/v1/staff/content/uploading/get');
    return this.client.get(`${base}/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}/${p.attributeId}/${p.contentDeveloperId}`);
  }

  getByVariable(p: AttributeUserParams, variableId: string): Promise<APIResponse> {
    const base = this.seg('/v1/staff/content/perpation/variable/get', '/v1/staff/content/uploading/variable/get');
    return this.client.get(
      `${base}/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}/${p.attributeId}/${p.contentDeveloperId}/${variableId}`,
    );
  }

  getByFirstVariable(p: AttributeUserParams): Promise<APIResponse> {
    const base = this.seg('/v1/staff/content/perpation/first/variable/get', '/v1/staff/content/uploading/first/variable/get');
    return this.client.get(`${base}/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}/${p.attributeId}/${p.contentDeveloperId}`);
  }

  /**
   * BUG ($nin-excludes-self, confirmed live — see the spec file): on both sides, this
   * existence check excludes the caller's OWN usertype, so an Admin can never delete their
   * own self-allocated StaffAllocation record. The Preparation side additionally has its
   * admin-only gate commented out (anyone can call it, confirmed from source); the
   * Uploading side's gate is live.
   */
  delete(contentDeveloperId: string, staffAllocationId: string): Promise<APIResponse> {
    const path = this.seg('/v1/staff/content/perpation/delete', '/v1/staff/content/uploading/delete');
    return this.client.delete(path, { data: { contentDeveloperId, staffAllocationPreparationId: staffAllocationId } });
  }

  /** Uploading-only — no Preparation-side equivalent exists (confirmed from source, not just routing). Self-scoped (uses the caller's own id) and explicitly rejects Admin callers. */
  getAllForSelf(companyId: string): Promise<APIResponse> {
    return this.client.get(`/v1/staff/content/get/all/${companyId}`);
  }

  /** Standalone route, no preparation/uploading variant — reads PlanningPreparation (not StaffAllocation) by variableId. */
  static getContentPreparationNameByYear(client: BaseApiClient, variableId: string): Promise<APIResponse> {
    return client.get(`/v1/content/preparation/name/get/${variableId}`);
  }
}
