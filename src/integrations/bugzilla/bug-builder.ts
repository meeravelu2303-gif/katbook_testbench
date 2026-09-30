import { BenchSeverity, BUGZILLA_PRIORITY, BUGZILLA_SEVERITY, BugzillaConfig } from '../../config/bugzilla.config';
import { normalizeForFingerprint } from './bug-fingerprint';
import { BugFields } from './bugzilla-client';

export interface FailureDetails {
  testTitle: string;
  endpoint: string;
  method: string;
  statusCode?: number;
  requestPayload?: unknown;
  responseBody?: unknown;
  errorStack: string;
  severity: BenchSeverity;
}

export function buildSummary(tag: string, failure: FailureDetails): string {
  const raw = `[${tag}] ${failure.method} ${failure.endpoint} — ${failure.testTitle}`;
  return raw.length > 255 ? `${raw.slice(0, 252)}...` : raw;
}

export function buildDescription(failure: FailureDetails): string {
  const lines = [
    `Endpoint: ${failure.method} ${failure.endpoint}`,
    `Test: ${failure.testTitle}`,
    failure.statusCode !== undefined ? `Status code: ${failure.statusCode}` : undefined,
    '',
    'Request payload:',
    safeJson(failure.requestPayload),
    '',
    'Response body:',
    safeJson(failure.responseBody),
    '',
    'Error / stack:',
    failure.errorStack,
    '',
    'Filed automatically by the Katbook API test bench (BugzillaReporter). Do not edit this section manually — subsequent runs match on it.',
  ].filter((l): l is string => l !== undefined);
  return lines.join('\n');
}

function safeJson(value: unknown): string {
  if (value === undefined) return '(none)';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function sameFault(a: string, b: string): boolean {
  return normalizeForFingerprint(a).trim() === normalizeForFingerprint(b).trim();
}

export function buildBugFields(config: BugzillaConfig, tag: string, failure: FailureDetails): BugFields {
  return {
    product: config.product,
    component: config.component,
    version: config.version,
    summary: buildSummary(tag, failure),
    description: buildDescription(failure),
    severity: BUGZILLA_SEVERITY[failure.severity],
    priority: BUGZILLA_PRIORITY[failure.severity],
    op_sys: 'All',
    platform: 'All',
    status_whiteboard: tag,
  };
}
