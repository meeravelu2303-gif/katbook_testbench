import { test, expect } from '../../fixtures/api.fixture';
import { isActorConfigured } from '../../config/api.config';
import { assertMatchesSchema } from '../../utils/schema-validator';
import { errorEnvelopeSchema } from '../../utils/validators/common.schema';
import { recordApiContext } from '../../utils/failure-context';

test.describe.configure({ mode: 'parallel' });

test.describe('Auth — admin login', () => {
  test('rejects an empty body with a descriptive validation error', async ({ anonClient }, testInfo) => {
    const response = await anonClient.post('/v1/admin/login', { data: {} });
    recordApiContext(testInfo, {
      method: 'POST',
      endpoint: '/v1/admin/login',
      statusCode: response.status(),
      requestPayload: {},
      responseBody: await response.text(),
    });

    expect(response.status()).toBe(400);
    const body = assertMatchesSchema(errorEnvelopeSchema, await response.json(), 'POST /v1/admin/login (empty body)');
    expect(body.error).toMatch(/phone|email/i);
  });

  test('rejects an unregistered identifier with "User not register!." and does not leak a token', async ({
    anonClient,
  }, testInfo) => {
    const response = await anonClient.post('/v1/admin/login', {
      data: { userName: 'definitely-not-a-real-user@example.invalid', password: 'Wrong@Password1' },
    });
    recordApiContext(testInfo, {
      method: 'POST',
      endpoint: '/v1/admin/login',
      statusCode: response.status(),
    });

    expect(response.status()).toBe(400);
    const body = assertMatchesSchema(
      errorEnvelopeSchema,
      await response.json(),
      'POST /v1/admin/login (unregistered userName)',
    );
    expect(body.error).toMatch(/not register/i);
    expect(body).not.toHaveProperty('token');
  });

  test('logs in with configured admin credentials and returns a usable token', async ({ clientAs }) => {
    test.skip(!isActorConfigured('admin'), 'ADMIN_USERNAME/ADMIN_PASSWORD not set — see .env.example');
    const client = await clientAs('admin');
    const response = await client.get('/v1/user/profile');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.user.userName).toBe('qa.testbench.admin');
  });

  test('SECURITY: GET /v1/user/profile must not leak the password hash', async ({ clientAs }, testInfo) => {
    test.skip(!isActorConfigured('admin'), 'ADMIN_USERNAME/ADMIN_PASSWORD not set — see .env.example');
    const client = await clientAs('admin');
    const response = await client.get('/v1/user/profile');
    const body = await response.json();
    recordApiContext(testInfo, {
      method: 'GET',
      endpoint: '/v1/user/profile',
      statusCode: response.status(),
      responseBody: { user: { ...body.user, password: body.user?.password ? '[REDACTED IN TEST LOG]' : undefined } },
    });

    // Confirmed live: this endpoint currently returns the bcrypt hash in `user.password`.
    // Filed as a security finding — endpoints must never return credential material, hashed or not.
    expect(body.user).not.toHaveProperty('password');
  });
});

test.describe('Auth boundary — protected endpoints reject missing/invalid tokens', () => {
  test('GET /v1/user/menuprivileges/byusertoken without a token is rejected', async ({ anonClient }, testInfo) => {
    const response = await anonClient.get('/v1/user/menuprivileges/byusertoken');
    recordApiContext(testInfo, {
      method: 'GET',
      endpoint: '/v1/user/menuprivileges/byusertoken',
      statusCode: response.status(),
    });

    expect([401, 403]).toContain(response.status());
  });
});
