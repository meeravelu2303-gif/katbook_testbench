import { z } from 'zod';

/**
 * Observed error envelope shape from POST /v1/admin/login with an empty body:
 * { "success": false, "error": "Please enter phone Number or Email !.", "description": "" }
 * swagger.json documents no error schemas at all — this is reverse-engineered from a real
 * response and should be widened/split per-domain as more error shapes are confirmed.
 */
export const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  description: z.string(),
});
