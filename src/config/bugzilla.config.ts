import { env } from './env';

export type BenchSeverity = 'blocker' | 'critical' | 'major' | 'minor' | 'trivial';

/** Internal severity -> Bugzilla's severity field values. Adjust to match the real Bugzilla instance's field options once provisioned. */
export const BUGZILLA_SEVERITY: Record<BenchSeverity, string> = {
  blocker: 'blocker',
  critical: 'critical',
  major: 'major',
  minor: 'minor',
  trivial: 'trivial',
};

export const BUGZILLA_PRIORITY: Record<BenchSeverity, string> = {
  blocker: 'P1',
  critical: 'P1',
  major: 'P2',
  minor: 'P3',
  trivial: 'P4',
};

/** Resolutions a human has already judged — the filer must never reopen or re-file these. */
export const JUDGED_RESOLUTIONS = ['INVALID', 'WONTFIX', 'WORKSFORME', 'DUPLICATE'];

/** Prefix used in the dedupe fingerprint tag, e.g. "KB-A1B2C3" (Katbook Bench). */
export const DEDUPE_TAG_PREFIX = 'KB';

export interface BugzillaConfig {
  enabled: boolean;
  dryRun: boolean;
  url: string;
  apiKey: string;
  product: string;
  component: string;
  version: string;
}

/**
 * enabled === false whenever BUGZILLA_URL/BUGZILLA_API_KEY are unset — the framework and
 * reporter run normally, just without filing anything. Fill in .env once a Bugzilla
 * project/product exists for Katbook.
 */
export function readBugzillaConfig(): BugzillaConfig {
  return {
    enabled: Boolean(env.BUGZILLA_URL && env.BUGZILLA_API_KEY),
    dryRun: env.BUGZILLA_DRY_RUN,
    url: env.BUGZILLA_URL ?? '',
    apiKey: env.BUGZILLA_API_KEY ?? '',
    product: env.BUGZILLA_PRODUCT,
    component: env.BUGZILLA_COMPONENT,
    version: env.BUGZILLA_VERSION,
  };
}
