import type { TestInfo } from '@playwright/test';

interface AnnotationSource {
  annotations: Array<{ type: string; description?: string }>;
}

export interface ApiFailureContext {
  method: string;
  endpoint: string;
  statusCode?: number;
  requestPayload?: unknown;
  responseBody?: unknown;
}

const ANNOTATION_TYPE = 'api-failure-context';

/**
 * Call from a test right before/after an assertion that might fail, so the Bugzilla
 * reporter has real endpoint/method/payload/response detail for the filed bug instead
 * of just the assertion error. Safe to call unconditionally — only read on failure.
 */
export function recordApiContext(testInfo: TestInfo, context: ApiFailureContext): void {
  testInfo.annotations.push({ type: ANNOTATION_TYPE, description: JSON.stringify(context) });
}

export function readApiContext(source: AnnotationSource): ApiFailureContext | undefined {
  const annotation = source.annotations.filter((a) => a.type === ANNOTATION_TYPE).pop();
  if (!annotation?.description) return undefined;
  try {
    return JSON.parse(annotation.description) as ApiFailureContext;
  } catch {
    return undefined;
  }
}
