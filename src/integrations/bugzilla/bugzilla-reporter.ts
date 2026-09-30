import type { FullConfig, FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { readBugzillaConfig } from '../../config/bugzilla.config';
import { readApiContext } from '../../utils/failure-context';
import { FailureDetails } from './bug-builder';
import { BugzillaClient } from './bugzilla-client';
import { BugzillaFiler, FilerOutcome } from './bugzilla-filer';

/**
 * Files/dedupes Bugzilla bugs for failed tests in onEnd(). No-ops entirely when
 * BUGZILLA_URL/BUGZILLA_API_KEY aren't set (readBugzillaConfig().enabled === false) —
 * safe to leave wired into playwright.config.ts before Bugzilla is provisioned.
 */
export default class BugzillaReporter implements Reporter {
  private readonly failures: Array<{ test: TestCase; result: TestResult }> = [];
  private readonly config = readBugzillaConfig();

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === 'failed' || result.status === 'timedOut') {
      this.failures.push({ test, result });
    }
  }

  async onEnd(_result: FullResult): Promise<void> {
    if (!this.config.enabled || this.failures.length === 0) return;

    const client = new BugzillaClient(this.config);
    const filer = new BugzillaFiler(this.config, client);
    const outcomes: FilerOutcome[] = [];

    for (const { test, result } of this.failures) {
      const context = readApiContext(result);
      const failure: FailureDetails = {
        testTitle: test.titlePath().slice(1).join(' > '),
        endpoint: context?.endpoint ?? 'unknown',
        method: context?.method ?? 'unknown',
        statusCode: context?.statusCode,
        requestPayload: context?.requestPayload,
        responseBody: context?.responseBody,
        errorStack: result.errors.map((e) => e.message ?? '').join('\n') || 'No error message captured',
        severity: 'major',
      };
      outcomes.push(await filer.process(failure));
    }

    console.log(`[BugzillaReporter] processed ${outcomes.length} failure(s): ${JSON.stringify(outcomes)}`);
  }

  printsToStdio(): boolean {
    return false;
  }
}
