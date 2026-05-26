/**
 * apiFetch — thin wrapper around fetch.
 *
 * - Always sends credentials: 'include' so the signed kr_session cookie flows.
 * - Adds Content-Type: application/json for non-GET requests.
 * - Throws an Error (with .message from the server envelope) on non-2xx.
 * - Returns null on HTTP 304 (Not Modified) — the polling sentinel.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  opts: RequestInit & { etag?: string } = {},
): Promise<T | null> {
  const { etag, ...fetchOpts } = opts;

  const headers: Record<string, string> = {
    ...(fetchOpts.headers as Record<string, string> | undefined),
  };

  const method = (fetchOpts.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
  }

  if (etag) {
    headers['If-None-Match'] = etag;
  }

  const res = await fetch(path, {
    ...fetchOpts,
    credentials: 'include',
    headers,
  });

  // 304 Not Modified — caller should keep the prior value
  if (res.status === 304) {
    return null;
  }

  if (!res.ok) {
    let code: string | undefined;
    let message = `Request failed: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error?.message) message = body.error.message;
      if (body?.error?.code) code = body.error.code;
    } catch {
      // ignore JSON parse failure; use statusText message
    }
    throw new ApiError(res.status, message, code);
  }

  // 204 No Content
  if (res.status === 204) {
    return null;
  }

  return res.json() as Promise<T>;
}
