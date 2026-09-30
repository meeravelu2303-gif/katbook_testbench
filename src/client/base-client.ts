import type { APIRequestContext, APIResponse } from '@playwright/test';

export interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  data?: unknown;
}

/**
 * Thin wrapper around Playwright's APIRequestContext so test/domain client modules
 * don't repeat header/token plumbing. One instance per actor (token) per test.
 */
export class BaseApiClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly token?: string,
  ) {}

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...extra,
    };
  }

  get(path: string, options: RequestOptions = {}): Promise<APIResponse> {
    return this.request.get(path, { headers: this.headers(options.headers), params: options.params });
  }

  post(path: string, options: RequestOptions = {}): Promise<APIResponse> {
    return this.request.post(path, { headers: this.headers(options.headers), data: options.data });
  }

  put(path: string, options: RequestOptions = {}): Promise<APIResponse> {
    return this.request.put(path, { headers: this.headers(options.headers), data: options.data });
  }

  patch(path: string, options: RequestOptions = {}): Promise<APIResponse> {
    return this.request.patch(path, { headers: this.headers(options.headers), data: options.data });
  }

  delete(path: string, options: RequestOptions = {}): Promise<APIResponse> {
    return this.request.delete(path, { headers: this.headers(options.headers), data: options.data });
  }
}
