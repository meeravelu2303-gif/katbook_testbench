import { faker } from '@faker-js/faker';
import { baseFactory } from './base.factory';
import { CreateManagementResourceInput } from '../client/management.client';
import { PlanningCreateItem } from '../client/management-planning.client';

export function buildManagementResource(companyId: string): CreateManagementResourceInput {
  return {
    companyId,
    name: `${baseFactory.testTag()} preparation`,
    isRework: false,
  };
}

/**
 * esd/efd don't need to be unique themselves — the backend's "already exists for this
 * period" duplicate check keys on (companyId, assignee, selectedActivities, esd, efd), and
 * callers are expected to pass a fresh `selectedActivities` per test, which already makes
 * the tuple unique. Fixed dates keep this deterministic and easy to reason about.
 */
export function buildPlanningCreateItem(companyId: string, assigneeId: string, selectedActivities: string): PlanningCreateItem {
  return {
    companyId,
    sequenceNo: faker.number.int({ min: 1, max: 1000 }),
    assigneeId,
    selectedActivities,
    duration: faker.number.int({ min: 1, max: 30 }),
    delay: faker.number.int({ min: 0, max: 5 }),
    esd: '2026-01-01',
    efd: '2026-01-10',
  };
}
