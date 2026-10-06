import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

/**
 * institution.controller.js (`InstitutionController`) — the institution-TYPE master list
 * (collection `Institution`, model `intitution.model.js`). `CURRICULUM.INSTITUTION_TYPE_ID`
 * is a real, pre-existing document here ("Corporate").
 *
 * CRITICAL — `deleteInstitutionTypeName` (`DELETE /institute/remove/:nameId`) has NO client
 * method here, deliberately: confirmed live-equivalent via direct source reading that it
 * references `err`/`countryId` before their `let` declarations (a genuine TDZ
 * `ReferenceError`, not a style nit) and uses an undeclared `CONFIG`. Since nothing in this
 * codebase has a global `unhandledRejection` handler, this throws inside an async route
 * handler with no `try/catch` around it anywhere in the call chain — on Node 24 this is an
 * unhandled rejection, which crashes the whole process (pm2 then restarts it per
 * `ecosystem.config.js`). This is documented from source-reading ONLY; it has never been
 * called, by explicit decision, because the backend is a shared dev server other work may
 * depend on. Practical effect: there is no way to delete an InstitutionType via this API —
 * every one this suite creates is a permanent stray, same as several other domains' delete-
 * blocked findings this project has documented (ContentLink's hangs, StaffAllocation's $nin
 * bug), just via a different (and more severe) mechanism.
 */
export class InstitutionTypeClient {
  constructor(private readonly client: BaseApiClient) {}

  create(countryId: string, institutionTypeName: string): Promise<APIResponse> {
    return this.client.post(`/v1/institute/create/${countryId}`, { data: { institutionTypeName } });
  }

  update(countryId: string, institutionId: string, institutionTypeName: string): Promise<APIResponse> {
    return this.client.put(`/v1/institute/update/${countryId}/${institutionId}`, { data: { institutionTypeName } });
  }

  getInfo(countryId: string, name: string): Promise<APIResponse> {
    return this.client.get(`/v1/institute/getInfo/${countryId}/${encodeURIComponent(name)}`);
  }

  getAllByCountry(countryId: string): Promise<APIResponse> {
    return this.client.get(`/v1/institute/getAllByCountry/${countryId}`);
  }

  getAll(): Promise<APIResponse> {
    return this.client.get('/v1/institute/getAll');
  }
}
