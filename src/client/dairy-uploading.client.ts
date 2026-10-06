import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';
import type { AttributeParams } from './dairy-preparation.client';

export interface UploadingTaskStatusUpdateItem {
  planningUploadingId: string;
  companyId: string;
  status: 'InProgress' | 'Completed';
  remark?: string;
}

/**
 * dairyUploading.controller.js exports 27 functions but only 20 are actually wired in
 * routes/v1.js (confirmed by diffing the export list against every `DairyUploadingController.`
 * route registration) — `updatePlanningUploadingTaskStatusV2`,
 * `getAllPlanningUploadingInCompletedByInstitution_v2`,
 * `GetConsolidatedStatusReportPlanningUploadingByTeamv3`, and the non-"v2" monthly/appraisal
 * self variants are genuine dead code, permanently unreachable. Only the 20 live routes are
 * modeled below.
 *
 * Unlike `DairyPreparationClient`'s backing data (seeded successfully as Admin,
 * self-assigned), `PlanningUploadingController.createPlanningUploading` has an admin
 * self-assign bug: when the caller's usertype is Admin, its "does this user exist" check is
 * `User.findOne({ userTypeId: { $nin: user.userTypeId }, _id: contentUploaderId, ... })` —
 * the `$nin` excludes the ADMIN'S OWN usertype, so an Admin can never self-assign a
 * PlanningUploading record (confirmed live: self-assigning as Admin returns "User was not
 * found!." even with a fully valid payload otherwise). `createPlanningPreparation`'s
 * equivalent check has no such exclusion and self-assign works fine there — this asymmetry
 * is itself a bug worth flagging. A real Content Uploader actor account would be needed to
 * seed `PlanningUploading` test data; none exists in this test bench's `.env` role set, so
 * real happy-path coverage for this client's methods is deferred — every method here is
 * exercised only by the lean validation/auth-boundary matrix in the spec file.
 */
export class DairyUploadingClient {
  constructor(private readonly client: BaseApiClient) {}

  getAllForDateByAttribute(p: AttributeParams, fromDate: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/uploading/get/all/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}/${p.attributeId}/${fromDate}`);
  }

  updateTaskStatus(items: UploadingTaskStatusUpdateItem[]): Promise<APIResponse> {
    return this.client.put('/v1/dairy/content/uploading/activity/status/update', { data: { data: items } });
  }

  getAllCompletedBySelf(p: AttributeParams): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/uploading/completed/task/get/all/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}/${p.attributeId}`);
  }

  getAllMonthlyCompletedBySelfV2(companyId: string, date: string, endDate: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/uploading/completed/task/get/self/monthly/${companyId}/${date}/${endDate}`);
  }

  getAllWeeklyCompletedBySelf(p: AttributeParams, fromDate: string, toDate: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/uploading/completed/task/get/self/weekly/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}/${p.attributeId}/${fromDate}/${toDate}`);
  }

  getAllWeeklyCompletedBySelfV2(companyId: string, fromDate: string, toDate: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/uploading/completed/task/get/self/weekly/${companyId}/${fromDate}/${toDate}`);
  }

  getAllTodayCompletedBySelf(p: AttributeParams, todayDate: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/uploading/completed/task/get/self/today/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}/${p.attributeId}/${todayDate}`);
  }

  getAllTodayCompletedBySelfV2(companyId: string, startDate: string, endDate: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/uploading/completed/task/get/self/today/${companyId}/${startDate}/${endDate}`);
  }

  getAllMonthlyAppraisalBySelfV2(companyId: string, date: string, endDate: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/uploading/appraisal/task/get/self/mothly/${companyId}/${date}/${endDate}`);
  }

  getAllWeeklyAppraisalBySelf(p: AttributeParams, fromDate: string, toDate: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/uploading/appraisal/task/get/self/weekly/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}/${p.attributeId}/${fromDate}/${toDate}`);
  }

  getAllWeeklyAppraisalBySelfV2(companyId: string, fromDate: string, toDate: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/uploading/appraisal/task/get/self/weekly/${companyId}/${fromDate}/${toDate}`);
  }

  getAllTodayAppraisalBySelf(p: AttributeParams, todayDate: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/uploading/appraisal/task/get/self/today/${p.companyId}/${p.typeOfBook}/${p.countryId}/${p.institutionTypeId}/${p.attributeId}/${todayDate}`);
  }

  getAllTodayAppraisalBySelfV2(companyId: string, startDate: string, endDate: string): Promise<APIResponse> {
    return this.client.get(`/v1/dairy/content/uploading/appraisal/task/get/self/today/${companyId}/${startDate}/${endDate}`);
  }

  getDetailedStatusReportBySelf(body: Record<string, unknown>): Promise<APIResponse> {
    return this.client.post('/v1/dairy/content/uploading/status/task/get/self/detailed', { data: body });
  }

  getConsolidatedStatusReportBySelf(body: Record<string, unknown>): Promise<APIResponse> {
    return this.client.post('/v1/dairy/content/uploading/status/task/get/self/consolidated', { data: body });
  }

  workreport(body: Record<string, unknown>): Promise<APIResponse> {
    return this.client.post('/v1/dairy/uploading/workreport', { data: body });
  }
}
