import { test, expect } from '../../fixtures/api.fixture';
import { InstitutionTypeClient } from '../../client/institution-type.client';
import { InstitutionNameClient } from '../../client/institution-name.client';
import { SEED, CURRICULUM } from '../../config/seed.constants';
import { baseFactory } from '../../factories/base.factory';
import { isActorConfigured } from '../../config/api.config';

test.describe.configure({ mode: 'parallel' });

/**
 * institution.controller.js (`InstitutionController`) — the institution-TYPE master list.
 * `CURRICULUM.INSTITUTION_TYPE_ID` ("Corporate") is a real, pre-existing document here,
 * confirmed by its shape (`institutionTypeName`/`institutionTypeCode` fields) matching
 * exactly what `createInstType` produces.
 *
 * CRITICAL — `deleteInstitutionTypeName` (`DELETE /institute/remove/:nameId`) is
 * deliberately never called, not even once to confirm it live: confirmed from source that
 * it references `err`/`countryId` before their `let` declarations (a genuine TDZ
 * `ReferenceError`) and an undeclared `CONFIG`. With no `unhandledRejection` handler
 * anywhere in this codebase, this crashes the whole backend process on Node 24 (pm2
 * restarts it, but it bounces for everyone on this shared dev server in the meantime). See
 * `institution-type.client.ts`'s top comment for the full writeup. Practical effect: every
 * `InstitutionType` this suite creates is a permanent stray — there is no way to delete one
 * via this API at all.
 *
 * SECURITY (confirmed live): `createInstType` assigns `body.createdBy = user` (the full
 * Mongoose doc, not `user._id`) and echoes the saved document directly in its response
 * (`newInst`, no populate/select in between) — the bcrypt password hash leaks in the create
 * response. Same root-cause class as every other confirmed leak this project has found
 * (sections 9/11/12/14), now also in this domain.
 */
test.describe('Institution — InstitutionType', () => {
  test('create rejects a missing institutionTypeName', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new InstitutionTypeClient(client).create(CURRICULUM.COUNTRY_ID, '');
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/institution type name/i);
  });

  test('create rejects a malformed countryId', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new InstitutionTypeClient(client).create('not-an-object-id', 'qa-probe');
    expect(response.status()).toBe(400);
  });

  test('create rejects a well-formed but nonexistent countryId', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new InstitutionTypeClient(client).create('000000000000000000000000', 'qa-probe');
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('Country not exists');
  });

  test('create rejects an anonymous request', async ({ anonClient }) => {
    const response = await new InstitutionTypeClient(anonClient).create(CURRICULUM.COUNTRY_ID, 'qa-probe');
    expect([401, 403]).toContain(response.status());
  });

  test('SECURITY: create response leaks the password hash via createdBy', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const tag = baseFactory.testTag();
    const response = await new InstitutionTypeClient(client).create(CURRICULUM.COUNTRY_ID, `${tag}-securitytype`);
    expect(response.status()).toBe(200);
    const created = (await response.json()).institutionTypeName;
    expect(created.createdBy).toHaveProperty('password');
    // No cleanup possible — see the top-of-file note on deleteInstitutionTypeName.
  });

  test('real lifecycle: create a real InstitutionType, rename it, find it via getInfo/getAllByCountry/getAll', async ({
    clientAs,
  }) => {
    const client = await clientAs('admin');
    const institutionClient = new InstitutionTypeClient(client);
    const tag = baseFactory.testTag();
    const name = `${tag}-lifecycletype`;

    const create = await institutionClient.create(CURRICULUM.COUNTRY_ID, name);
    expect(create.status()).toBe(200);
    const created = (await create.json()).institutionTypeName;
    expect(created.institutionTypeName).toBe(name);
    expect(created.institutionTypeCode).toBeTruthy();

    const getInfo = await institutionClient.getInfo(CURRICULUM.COUNTRY_ID, name);
    expect(getInfo.status()).toBe(200);
    expect((await getInfo.json()).institutionTypeName._id).toBe(created._id);

    const renamed = `${name}-renamed`;
    const update = await institutionClient.update(CURRICULUM.COUNTRY_ID, created._id, renamed);
    expect(update.status()).toBe(200);
    expect((await update.json()).institutionTypeName.institutionTypeName).toBe(renamed);

    const getAllByCountry = await institutionClient.getAllByCountry(CURRICULUM.COUNTRY_ID);
    expect(getAllByCountry.status()).toBe(200);
    const byCountryBody = await getAllByCountry.json();
    expect((byCountryBody.institutionTypeNames as Array<{ _id: string }>).some((t) => t._id === created._id)).toBe(true);

    const getAll = await institutionClient.getAll();
    expect(getAll.status()).toBe(200);
    const allBody = await getAll.json();
    expect((allBody.institutionTypeNames as Array<{ _id: string }>).some((t) => t._id === created._id)).toBe(true);
    // No cleanup possible — see the top-of-file note on deleteInstitutionTypeName. This
    // record (and its renamed name) is now a permanent stray, by design of this test bench
    // deliberately never calling the one route that could remove it.
  });

  test('real data: getInfo/getAllByCountry/getAll find the real pre-existing "Corporate" type', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const institutionClient = new InstitutionTypeClient(client);

    const getInfo = await institutionClient.getInfo(CURRICULUM.COUNTRY_ID, 'Corporate');
    expect(getInfo.status()).toBe(200);
    expect((await getInfo.json()).institutionTypeName._id).toBe(CURRICULUM.INSTITUTION_TYPE_ID);

    const getAllByCountry = await institutionClient.getAllByCountry(CURRICULUM.COUNTRY_ID);
    expect(getAllByCountry.status()).toBe(200);
    const byCountryBody = await getAllByCountry.json();
    expect((byCountryBody.institutionTypeNames as Array<{ _id: string }>).some((t) => t._id === CURRICULUM.INSTITUTION_TYPE_ID)).toBe(true);
  });

  test('getInfo returns 400 for a nonexistent name', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new InstitutionTypeClient(client).getInfo(CURRICULUM.COUNTRY_ID, 'definitely-not-a-real-type');
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('name not found');
  });

  test('getAllByCountry is public and requires no token', async ({ anonClient }) => {
    const response = await new InstitutionTypeClient(anonClient).getAllByCountry(CURRICULUM.COUNTRY_ID);
    expect([401, 403]).not.toContain(response.status());
    expect(response.status()).toBe(200);
  });

  test('getAll is public and requires no token', async ({ anonClient }) => {
    const response = await new InstitutionTypeClient(anonClient).getAll();
    expect([401, 403]).not.toContain(response.status());
    expect(response.status()).toBe(200);
  });

  test('update rejects a well-formed but nonexistent institutionId', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new InstitutionTypeClient(client).update(CURRICULUM.COUNTRY_ID, '000000000000000000000000', 'whatever');
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('Institution type was not found!.');
  });

  test('update rejects a non-Admin caller (checkPermission admin gate)', async ({ clientAs }) => {
    test.skip(!isActorConfigured('contentUploader'), 'CONTENT_UPLOADER_USERNAME/PASSWORD not set — run `npm run bootstrap:content-uploader`.');
    const client = await clientAs('contentUploader');
    const response = await new InstitutionTypeClient(client).update(CURRICULUM.COUNTRY_ID, CURRICULUM.INSTITUTION_TYPE_ID, 'whatever');
    expect(response.status()).toBe(400);
  });
});

test.describe('Institution — InstitutionName (attribute.controller.js, tagged separately in swagger)', () => {
  test('getAll returns real pre-existing institutionName data for the standard curriculum chain', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new InstitutionNameClient(client).getAll(
      SEED.COMPANY_ID,
      CURRICULUM.TYPE_OF_BOOK_ID,
      CURRICULUM.COUNTRY_ID,
      CURRICULUM.INSTITUTION_TYPE_ID,
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.institutionName)).toBe(true);
    expect(body.institutionName.length).toBeGreaterThan(0);
  });

  test('getAll rejects a nonexistent institutionType', async ({ clientAs }) => {
    const client = await clientAs('admin');
    const response = await new InstitutionNameClient(client).getAll(
      SEED.COMPANY_ID,
      CURRICULUM.TYPE_OF_BOOK_ID,
      CURRICULUM.COUNTRY_ID,
      '000000000000000000000000',
    );
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe('Institution type not found!');
  });

  test('getAll rejects an anonymous request', async ({ anonClient }) => {
    const response = await new InstitutionNameClient(anonClient).getAll(
      SEED.COMPANY_ID,
      CURRICULUM.TYPE_OF_BOOK_ID,
      CURRICULUM.COUNTRY_ID,
      CURRICULUM.INSTITUTION_TYPE_ID,
    );
    expect([401, 403]).toContain(response.status());
  });
});
