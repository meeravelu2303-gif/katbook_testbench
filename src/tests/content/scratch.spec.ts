import { test, expect } from '../../fixtures/api.fixture';
import { ScratchClient } from '../../client/scratch.client';
import { buildScratchCode } from '../../factories/content.factory';
import { scratchDocSchema } from '../../utils/validators/content.schema';
import { assertMatchesSchema } from '../../utils/schema-validator';
import { readError } from '../management/support';

test.describe.configure({ mode: 'parallel' });

/**
 * scratchfile.controller.js / routes/v1.js:1024-1028 — confirmed live and in source:
 * every scratch-file route is completely unauthenticated, and the collection has no
 * companyId/userId scoping at all. The SECURITY tests below assert this is genuinely
 * reachable, not just theoretical from reading the code.
 */
test.describe('Content — Scratch', () => {
  test('create rejects missing code', async ({ anonClient }) => {
    const client = new ScratchClient(anonClient);
    const response = await client.create('');
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('Scratch Code is required');
  });

  test('full lifecycle over anonymous requests (no auth token used anywhere)', async ({ anonClient }) => {
    const client = new ScratchClient(anonClient);
    const code = buildScratchCode();

    const createResponse = await client.create(code);
    expect(createResponse.status()).toBe(200);
    const created = assertMatchesSchema(scratchDocSchema, (await createResponse.json()).data, 'Scratch create');
    expect(created.code).toBe(code);

    const duplicateResponse = await client.create(code);
    expect(duplicateResponse.status()).toBe(400);
    await expect(readError(duplicateResponse)).resolves.toBe('Scratch Code already exist');

    const getByIdResponse = await client.getById(created._id);
    expect(getByIdResponse.status()).toBe(200);

    const newCode = buildScratchCode();
    const updateResponse = await client.update(created._id, newCode);
    expect(updateResponse.status()).toBe(200);
    expect(assertMatchesSchema(scratchDocSchema, (await updateResponse.json()).data, 'Scratch update').code).toBe(newCode);

    const deleteResponse = await client.delete(created._id);
    expect(deleteResponse.status()).toBe(200);

    const afterDelete = await client.getById(created._id);
    expect(afterDelete.status()).toBe(400);
  });

  test('SECURITY: any anonymous caller can update a scratch file they did not create', async ({ anonClient }) => {
    const owner = new ScratchClient(anonClient);
    const attacker = new ScratchClient(anonClient); // same fixture, but the point is: no identity is checked at all
    const created = (await (await owner.create(buildScratchCode())).json()).data;

    const tamperResponse = await attacker.update(created._id, 'tampered by an unrelated caller');
    // Documents the actual defect: this succeeds. No ownership or auth check exists.
    expect(tamperResponse.status()).toBe(200);

    await owner.delete(created._id);
  });

  test('SECURITY: any anonymous caller can delete a scratch file they did not create', async ({ anonClient }) => {
    const owner = new ScratchClient(anonClient);
    const created = (await (await owner.create(buildScratchCode())).json()).data;

    const deleteAsAnyone = new ScratchClient(anonClient);
    const deleteResponse = await deleteAsAnyone.delete(created._id);
    // Documents the actual defect: this succeeds — full unauthenticated CRUD, no ownership.
    expect(deleteResponse.status()).toBe(200);
  });

  test('SECURITY: getAll exposes every scratch file globally, not scoped to a caller', async ({ anonClient }) => {
    const client = new ScratchClient(anonClient);
    const code = buildScratchCode();
    const created = (await (await client.create(code)).json()).data;

    // No company/user filter exists anywhere in GetAllScratchFiles — any caller sees
    // every active record in the system.
    const response = await client.getAll();
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.some((x: { _id: string }) => x._id === created._id)).toBe(true);

    await client.delete(created._id);
  });

  test('getById returns 400 for a well-formed but nonexistent id', async ({ anonClient }) => {
    const client = new ScratchClient(anonClient);
    const response = await client.getById('000000000000000000000000');
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toBe('Scratch Code not found');
  });

  test('getById rejects a malformed id', async ({ anonClient }) => {
    const client = new ScratchClient(anonClient);
    const response = await client.getById('not-an-object-id');
    expect(response.status()).toBe(400);
    await expect(readError(response)).resolves.toMatch(/valid scratch code id/i);
  });
});
