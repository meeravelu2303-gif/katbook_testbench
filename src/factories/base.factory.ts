import { faker } from '@faker-js/faker';

/** Collision-free identifiers/values shared across domain factories. */
export const baseFactory = {
  email: () => faker.internet.email().toLowerCase(),
  phoneNumber: () => faker.phone.number({ style: 'international' }).replace(/\s+/g, ''),
  password: () => `${faker.string.alphanumeric(10)}!${faker.number.int({ min: 10, max: 99 })}`,
  name: () => faker.person.fullName(),
  companyName: () => faker.company.name(),
  uuid: () => faker.string.uuid(),
  pastDate: () => faker.date.past().toISOString().slice(0, 10),
  futureDate: () => faker.date.future().toISOString().slice(0, 10),
  /** Suffix to keep test-created records unique and identifiable across runs. */
  testTag: () => `qa-${Date.now()}-${faker.string.alphanumeric(6)}`,
};
