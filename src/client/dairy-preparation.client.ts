import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

export interface AttributeParams {
  companyId: string;
  typeOfBook: string;
  countryId: string;
  institutionTypeId: string;
  attributeId: string;
}

export interface DetailedStatusQuery {
  companyId: string;
  typeOfBook: string;
  countryId: string;
  institutionTypeId: string;
  attributeId: string;
  variableId: string;
  status?: string[];
  statusAll?: boolean;
}

export interface TaskStatusUpdateItem {
  planningPreparationId: string;
  companyId: string;
  status: 'InProgress' | 'Completed';
  remark?: string;
  lsd?: string;
  lfd?: string;
}

/**
 * dairyPreparation.controller.js — 29 routes, almost all read-only reporting over the
 * `PlanningPreparation` collection that `PlanningPreparationClient` (planning domain) seeds.
 * Every route uses `needsAuth` uniformly (confirmed from routes/v1.js, no mixed-middleware
 * risk here unlike other domains). The methods below cover every "Self" variant plus the
 * one write route — all of which only depend on `PlanningPreparation` directly and so get
 * full happy-path coverage. The "ByTeam"/"Consolidated"/"ByTeam4-6" variants additionally
 * require `StaffAllocationContentPreparation` records (no seeding infra for that model
 * exists in this test bench yet) and are covered only by the lean auth/validation matrix in
 * the spec file, called via raw client methods rather than dedicated typed wrappers here.
 */
export class DairyPreparationClient {
  constructor(private readonly client: BaseApiClient) {}

  /** V2 — self-scoped by contentDeveloperId only, no company/attribute params needed. */
  getAllForDate(date: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/preparation/get/all/${date}`);
  }

  getAllForDateByAttribute(p: AttributeParams, date: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/preparation/get/all/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}/${p.attributeId}/${date}`);
  }

  updateTaskStatus(items: TaskStatusUpdateItem[]): Promise<APIResponse> {
    return this.client.put('/v1/dairy/content/preparation/activity/status/update', { data: { data: items } });
  }

  getAllCompletedBySelf(p: AttributeParams): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/preparation/completed/task/get/all/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}/${p.attributeId}`);
  }

  getAllMonthlyCompletedBySelf(p: AttributeParams, date: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/preparation/completed/task/get/self/mothly/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}/${p.attributeId}/${date}`);
  }

  getAllMonthlyCompletedBySelfV2(companyId: string, startDate: string, endDate: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/preparation/completed/task/get/self/monthly/${companyId}/${startDate}/${endDate}`);
  }

  getAllWeeklyCompletedBySelf(p: AttributeParams, fromDate: string, toDate: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/preparation/completed/task/get/self/weekly/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}/${p.attributeId}/${fromDate}/${toDate}`);
  }

  getAllWeeklyCompletedBySelfV2(companyId: string, fromDate: string, toDate: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/preparation/completed/task/get/self/weekly/${companyId}/${fromDate}/${toDate}`);
  }

  getAllTodayCompletedBySelf(p: AttributeParams): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/preparation/completed/task/get/self/today/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}/${p.attributeId}`);
  }

  getAllTodayCompletedBySelfV2(companyId: string, startDate: string, endDate: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/preparation/completed/task/get/self/today/${companyId}/${startDate}/${endDate}`);
  }

  getAllMonthlyAppraisalBySelf(p: AttributeParams, date: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/preparation/appraisal/task/get/self/mothly/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}/${p.attributeId}/${date}`);
  }

  getAllMonthlyAppraisalBySelfV2(companyId: string, fromDate: string, toDate: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/preparation/appraisal/task/get/self/mothly/${companyId}/${fromDate}/${toDate}`);
  }

  getAllWeeklyAppraisalBySelf(p: AttributeParams, fromDate: string, toDate: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/preparation/appraisal/task/get/self/weekly/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}/${p.attributeId}/${fromDate}/${toDate}`);
  }

  getAllWeeklyAppraisalBySelfV2(companyId: string, fromDate: string, toDate: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/preparation/appraisal/task/get/self/weekly/${companyId}/${fromDate}/${toDate}`);
  }

  getAllTodayAppraisalBySelf(p: AttributeParams): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/preparation/appraisal/task/get/self/today/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}/${p.attributeId}`);
  }

  getAllTodayAppraisalBySelfV2(companyId: string, startDate: string, endDate: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/preparation/appraisal/task/get/self/today/${companyId}/${startDate}/${endDate}`);
  }

  getDetailedStatusReportBySelf(q: DetailedStatusQuery): Promise<APIResponse> {
    return this.client.post('/v1/dairy/content/preparation/status/task/get/self/detailed', { data: q });
  }

  /** Requires real `StaffAllocationContentPreparation` records to ever return non-empty — no seeding infra yet, lean coverage only. */
  getConsolidatedStatusReportBySelf(p: AttributeParams): Promise<APIResponse> {
    return this.client.post('/v1/dairy/content/preparation/status/task/get/self/consolidated', { data: p });
  }

  /**
   * BUG (confirmed live via raw curl, independent of Playwright, bounded 15s timeout):
   * `getDetailed` (`POST /self/detailed`) validates company/typeOfBook/country/
   * institutionType/attribute/tier/variable all exist, then the function simply ends —
   * no `ReS`/`ReE` call on the valid path (dairyPreparation.controller.js:1988-2108). Same
   * "no success-response path at all" class as `KAudioController.GetKAudioById` (section
   * 11). The request hangs until client timeout for ANY fully-valid payload.
   */
  getDetailed(body: {
    companyId: string;
    typeOfBookId: string;
    countryId: string;
    institutionTypeId: string;
    attributeId: string;
    tierId: string;
    variableId: string;
  }, timeout?: number): Promise<APIResponse> {
    return this.client.post('/v1/self/detailed', { data: body, timeout });
  }
}
