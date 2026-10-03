import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from './base-client';

export interface ContentLinkCreateInput {
  companyId: string;
  typeOfBook: string;
  countryId: string;
  institutionTypeId: string;
  attributeId: string;
  tierDetails: Array<{ tierId: string }>;
  variableDetails: Array<{ variableId: string }>;
  linkWord: string;
  contentWord: string;
  content: string;
}

/**
 * contentLink.controller.js — create/getById/getlist/getAll/getInfo/update/delete/
 * upload-file routes use needsAuth (routes/v1.js:674-682); GetAdditionalContentByLink
 * (getOne) and GetAllContentLinkWordsByBookDetails_V2 are public (683, 688).
 * UploadFiles/UploadLink (multipart file upload) are out of scope — no file fixtures.
 */
export class ContentLinkClient {
  constructor(private readonly client: BaseApiClient) {}

  create(input: ContentLinkCreateInput): Promise<APIResponse> {
    return this.client.post('/v1/content/link/create', { data: input });
  }

  getById(contentlinkId: string): Promise<APIResponse> {
    return this.client.get(`/v1/content/link/${contentlinkId}`);
  }

  getAllForSession(sessionId: string): Promise<APIResponse> {
    return this.client.get(`/v1/content/link/getlist/${sessionId}`);
  }

  getAll(
    params: { countryId: string; typeOfBookId: string; institutionTypeId: string; companyId: string },
    variables: Array<{ variableId: string }>,
  ): Promise<APIResponse> {
    return this.client.post(
      `/v1/content/link/getAll/${params.countryId}/${params.typeOfBookId}/${params.institutionTypeId}/${params.companyId}`,
      { data: { variables } },
    );
  }

  update(
    contentId: string,
    countryId: string,
    institutionTypeId: string,
    companyId: string,
    input: { linkWord?: string; content?: string; contentWord?: string },
    timeout?: number,
  ): Promise<APIResponse> {
    return this.client.put(`/v1/content/link/update/${contentId}/${countryId}/${institutionTypeId}/${companyId}`, {
      data: input,
      timeout,
    });
  }

  delete(
    contentId: string,
    countryId: string,
    institutionTypeId: string,
    companyId: string,
    timeout?: number,
  ): Promise<APIResponse> {
    return this.client.delete(`/v1/content/link/delete/${contentId}/${countryId}/${institutionTypeId}/${companyId}`, {
      timeout,
    });
  }

  getOne(link: string): Promise<APIResponse> {
    return this.client.post('/v1/content/link/getOne', { data: { link } });
  }

  /**
   * SECURITY: UploadFiles (PUT /content/link/content/upload/file) takes `path`/`name` from
   * the request body and does an unsanitized `fs.writeFile(path + '/' + contentId + '_' +
   * name + '.html', content, ...)` — BEFORE validating contentId exists. Any authenticated
   * caller can write an arbitrary file to an arbitrary path on the server. This method only
   * exists to exercise the auth boundary (anonymous rejection) — never call it
   * authenticated in a test, since that executes the vulnerable write immediately.
   */
  uploadFilesAuthProbe(): Promise<APIResponse> {
    return this.client.put('/v1/content/link/content/upload/file', { data: {} });
  }

  /** UploadLink (PUT /content/link/upload/file) — multer's upload.single('socureFile'); calling it
   * without an actual multipart file is safe (multer writes nothing to disk when the field is absent).
   * The body must still be a *properly terminated* multipart stream (a bare boundary with no parts) —
   * a malformed one leaves multer's parser waiting indefinitely for data that never arrives. */
  uploadLinkWithoutFile(contentId: string, timeout?: number): Promise<APIResponse> {
    const boundary = 'qaBoundary123456';
    return this.client.put(`/v1/content/link/upload/file?contentId=${contentId}`, {
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      data: `--${boundary}--\r\n`,
      timeout,
    });
  }
}
