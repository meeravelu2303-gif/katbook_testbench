import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

export interface CreateHolidayInput {
  companyId: string;
  year: number;
  holidayDate: string; // DD-MM-YYYY, strictly in the future, within `year`
  employeeId: string;
}

/**
 * HoildayEmployee.controller.js (filename and several messages misspelled "Hoilday" in the
 * real backend — not a typo in this client) — the Admin-side half of employee holidays, all
 * 7 routes `needsAuth` + admin-code-gated in the handler. `employeeId` must be a real active
 * User with a DIFFERENT usertype than the caller's (`$nin: existingUserType._id`) — an Admin
 * can never be the employee. `year` must equal the current calendar year, `holidayDate` must
 * be strictly in the future within that year (`DD-MM-YYYY`) — these tests are date-dependent
 * by design of the API itself, not a test-bench limitation.
 *
 * Unlike most of this project's other domains, delete here is genuinely safe to call: a
 * real, working, admin-gated soft-delete exists (`deleteHolidayEmployeebyIdForAdmin`) — full
 * real-lifecycle coverage with proper cleanup is possible, as long as the holiday was
 * created by this suite (deleting any OTHER real holiday is still irreversible, since there
 * is no reactivation endpoint).
 */
export class HolidayEmployeeClient {
  constructor(private readonly client: BaseApiClient) {}

  create(input: CreateHolidayInput): Promise<APIResponse> {
    return this.client.post('/v1/admin/employee/holiday/create', { data: input });
  }

  update(companyId: string, employeeId: string, holidayEmployeeId: string, holidayDate: string): Promise<APIResponse> {
    return this.client.put('/v1/admin/employee/holiday/update', { data: { companyId, employeeId, holidayEmployeeId, holidayDate } });
  }

  delete(companyId: string, holidayEmployeeId: string): Promise<APIResponse> {
    return this.client.delete('/v1/admin/employee/holiday/delete', { data: { companyId, holidayEmployeeId } });
  }

  getAll(companyId: string): Promise<APIResponse> {
    return this.client.get(`/v1/admin/employee/holiday/get/all/${companyId}`);
  }

  /** BUG (confirmed from source): unlike create/update/getAllByMonth, this one route in the family is missing the `$nin` exclusion — an Admin's own id is accepted as employeeId here. */
  getAllByEmployee(companyId: string, employeeId: string): Promise<APIResponse> {
    return this.client.get(`/v1/admin/employee/holiday/get/all/employee/${companyId}/${employeeId}`);
  }

  getAllByMonth(companyId: string, date: string): Promise<APIResponse> {
    return this.client.get(`/v1/admin/employee/holiday/get/all/month/${companyId}/${date}`);
  }

  getAllByEmployeeByMonth(companyId: string, employeeId: string, date: string): Promise<APIResponse> {
    return this.client.get(`/v1/admin/employee/holiday/get/all/employee/month/${companyId}/${employeeId}/${date}`);
  }
}
