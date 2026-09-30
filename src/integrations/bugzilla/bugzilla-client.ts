import { BugzillaConfig } from '../../config/bugzilla.config';

export interface BugFields {
  product: string;
  component: string;
  summary: string;
  version: string;
  description: string;
  severity: string;
  priority: string;
  op_sys: string;
  platform: string;
  status_whiteboard?: string;
  assigned_to?: string;
}

interface BugzillaFailure {
  error: true;
  message: string;
}

function isFailure(body: unknown): body is BugzillaFailure {
  return Boolean(body && typeof body === 'object' && (body as Record<string, unknown>).error === true);
}

/**
 * REST client for Bugzilla 5.x. Auth is the `api_key` query parameter — this instance's
 * X-BUGZILLA-API-KEY header form is ignored (ported from kpost-testbench_v2's finding).
 * Never throws on a failed request: HTTP 200 with { error: true } is the failure shape;
 * callers check the return value. Retries GETs only (idempotent), twice, with backoff.
 */
export class BugzillaClient {
  constructor(private readonly config: BugzillaConfig) {}

  private buildUrl(path: string, query: Record<string, string | number | undefined> = {}): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    params.set('api_key', this.config.apiKey);
    return `${this.config.url}${path}?${params.toString()}`;
  }

  private async request<T>(method: string, path: string, options: { query?: Record<string, string | number | undefined>; body?: unknown; retries?: number } = {}): Promise<T | BugzillaFailure> {
    const url = this.buildUrl(path, options.query);
    const retries = method === 'GET' ? options.retries ?? 2 : 0;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
          body: options.body ? JSON.stringify(options.body) : undefined,
        });
        const body = (await response.json().catch(() => ({}))) as T;
        if (!response.ok) {
          return { error: true, message: `HTTP ${response.status}` };
        }
        return body;
      } catch (err) {
        if (attempt === retries) {
          return { error: true, message: err instanceof Error ? err.message : String(err) };
        }
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    return { error: true, message: 'unreachable' };
  }

  findByTag(tag: string) {
    return this.request<{ bugs: Array<Record<string, unknown>> }>('GET', '/bug', {
      query: { quicksearch: tag },
    });
  }

  findOpenByPhrase(product: string, component: string, summaryPhrase: string) {
    return this.request<{ bugs: Array<Record<string, unknown>> }>('GET', '/bug', {
      query: { product, component, summary: summaryPhrase },
    });
  }

  openBenchBugs(product: string) {
    return this.request<{ bugs: Array<Record<string, unknown>> }>('GET', '/bug', {
      query: { product, resolution: '---' },
    });
  }

  createBug(fields: BugFields) {
    return this.request<{ id: number }>('POST', '/bug', { body: fields });
  }

  addComment(bugId: number, comment: string) {
    return this.request<{ id: number }>('POST', `/bug/${bugId}/comment`, { body: { comment } });
  }

  reopen(bugId: number) {
    return this.request<{ bugs: unknown[] }>('PUT', `/bug/${bugId}`, {
      body: { status: 'CONFIRMED', resolution: '' },
    });
  }

  resolve(bugId: number, resolution: 'FIXED' | 'INVALID') {
    return this.request<{ bugs: unknown[] }>('PUT', `/bug/${bugId}`, {
      body: { status: 'RESOLVED', resolution },
    });
  }

  appendWhiteboard(bugId: number, tag: string) {
    return this.request<{ bugs: unknown[] }>('PUT', `/bug/${bugId}`, {
      body: { status_whiteboard: tag },
    });
  }

  isFailure = isFailure;
}
