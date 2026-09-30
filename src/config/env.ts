import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

const TEST_ENV = process.env.TEST_ENV ?? 'dev';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), `.env.${TEST_ENV}`), override: true });

const EnvSchema = z.object({
  TEST_ENV: z.enum(['dev', 'staging', 'prod']).default('dev'),

  DEV_API_BASE_URL: z.string().url().default('http://192.168.1.74:2504'),
  STAGING_API_BASE_URL: z.string().url().optional().or(z.literal('')),
  PROD_API_BASE_URL: z.string().url().optional().or(z.literal('')),

  API_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  INSTITUTION_USERNAME: z.string().optional(),
  INSTITUTION_PASSWORD: z.string().optional(),
  USER_USERNAME: z.string().optional(),
  USER_PASSWORD: z.string().optional(),
  OFFLINE_USERNAME: z.string().optional(),
  OFFLINE_PASSWORD: z.string().optional(),

  BUGZILLA_URL: z.string().optional(),
  BUGZILLA_API_KEY: z.string().optional(),
  BUGZILLA_PRODUCT: z.string().default('Katbook'),
  BUGZILLA_COMPONENT: z.string().default('API'),
  BUGZILLA_VERSION: z.string().default('1.0.0'),
  BUGZILLA_DRY_RUN: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() !== 'false'),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${parsed.error.toString()}`);
  }
  return parsed.data;
}

export const env = loadEnv();
