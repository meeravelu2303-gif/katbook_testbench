import type { APIResponse } from '@playwright/test';
import { BaseApiClient } from '../../client/base-client';
import { assertMatchesSchema } from '../../utils/schema-validator';
import { errorEnvelopeSchema } from '../../utils/validators/common.schema';

/** ReE() (services/util.service.js) always responds {success:false, error, description} — never `message`. */
export async function readError(response: APIResponse): Promise<string> {
  const body = assertMatchesSchema(errorEnvelopeSchema, await response.json(), 'error envelope');
  return body.error;
}

/** Resolves the calling admin's own User._id, for use as a self-assignable contentDeveloperId/contentUploaderId. */
export async function getSelfUserId(client: BaseApiClient): Promise<string> {
  const response = await client.get('/v1/user/profile');
  const body = await response.json();
  return body.user._id as string;
}
