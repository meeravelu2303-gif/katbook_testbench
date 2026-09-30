import { defineConfig } from '@playwright/test';
import { apiConfig } from './src/config/api.config';

const BUGZILLA_REPORTER = './src/integrations/bugzilla/bugzilla-reporter.ts';

export default defineConfig({
  testDir: './src/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI
    ? [['blob'], ['github'], ['list']]
    : [['list'], ['html', { open: 'never' }], [BUGZILLA_REPORTER]],
  timeout: apiConfig.timeout,
  use: {
    baseURL: apiConfig.baseURL,
    extraHTTPHeaders: apiConfig.defaultHeaders,
    trace: 'retain-on-failure',
  },
});
