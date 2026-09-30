import type { z } from 'zod';

/**
 * swagger.json has no usable response schemas (every response is declared bare text/plain).
 * Domain test files build their own Zod schema from the first real response observed and
 * pass it here — this is how we get contract enforcement despite the spec's gap.
 */
export function assertMatchesSchema<T>(schema: z.ZodType<T>, body: unknown, context: string): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new Error(`Response for ${context} did not match expected schema:\n${result.error.toString()}`);
  }
  return result.data;
}
