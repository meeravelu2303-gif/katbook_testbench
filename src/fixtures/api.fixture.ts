import { test as base, expect } from '@playwright/test';
import { apiConfig, ActorRole, isActorConfigured } from '../config/api.config';
import { BaseApiClient } from '../client/base-client';
import { loginAs } from './auth.fixture';

interface ApiFixtures {
  /** Unauthenticated client — no Authorization header attached. */
  anonClient: BaseApiClient;
  /** Client authenticated as a factory function per role, memoized per test. */
  clientAs: (role: ActorRole) => Promise<BaseApiClient>;
}

export const test = base.extend<ApiFixtures>({
  anonClient: async ({ request }, use) => {
    await use(new BaseApiClient(request));
  },

  clientAs: async ({ request }, use) => {
    const cache = new Map<ActorRole, BaseApiClient>();
    await use(async (role: ActorRole) => {
      const cached = cache.get(role);
      if (cached) return cached;
      if (!isActorConfigured(role)) {
        throw new Error(
          `Actor role "${role}" has no credentials in the environment — skip this test with test.skip() instead of calling clientAs("${role}").`,
        );
      }
      const token = await loginAs(request, role);
      const client = new BaseApiClient(request, token);
      cache.set(role, client);
      return client;
    });
  },
});

export { expect };
export { apiConfig };
