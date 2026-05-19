// Server-side Xola HTTP client. Phase 1.1 foundation; per-endpoint wrappers
// (experiences, guides, orders, events) live in sibling modules and call
// xolaFetch here.
//
// Auth header: X-API-Key (confirmed against sandbox.xola.com via
// scripts/xola-ping.mjs in Phase 0.6).
//
// Retry policy:
//   - Network errors: retry
//   - 5xx: retry
//   - 429: retry, honor numeric Retry-After (seconds) if present
//   - Other 4xx: throw XolaError immediately (auth/validation — won't fix itself)

import { resolveXolaEnv } from "./env.ts";

export class XolaError extends Error {
  readonly status: number;
  readonly path: string;
  readonly body: unknown;

  constructor(message: string, opts: { status: number; path: string; body: unknown }) {
    super(message);
    this.name = "XolaError";
    this.status = opts.status;
    this.path = opts.path;
    this.body = opts.body;
  }
}

export interface XolaFetchOptions extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
  // Override retry attempts for this call (default: 3 total attempts).
  maxAttempts?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 250;
const MAX_RETRY_AFTER_MS = 30_000;

export async function xolaFetch<T = unknown>(
  path: string,
  options: XolaFetchOptions = {},
): Promise<T> {
  const { headers: userHeaders, maxAttempts = DEFAULT_MAX_ATTEMPTS, ...init } = options;
  if (!path.startsWith("/")) {
    throw new XolaError(`xolaFetch path must start with '/' (got '${path}')`, {
      status: 0,
      path,
      body: null,
    });
  }
  const env = resolveXolaEnv();
  const url = `${env.baseUrl}${path}`;
  const headers: Record<string, string> = {
    "X-API-Key": env.apiKey,
    Accept: "application/json",
    ...userHeaders,
  };

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers });
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new XolaError(
        `Xola request failed (network): ${(err as Error).message}`,
        { status: 0, path, body: null },
      );
    }

    if (res.ok) {
      try {
        return (await parseBody(res)) as T;
      } catch (err) {
        throw new XolaError(
          `Xola response body read failed: ${(err as Error).message}`,
          { status: res.status, path, body: null },
        );
      }
    }

    const retriable = res.status >= 500 || res.status === 429;
    if (!retriable || attempt === maxAttempts) {
      const body = await parseBody(res).catch(() => null);
      throw new XolaError(`Xola ${res.status} ${res.statusText} for ${path}`, {
        status: res.status,
        path,
        body,
      });
    }

    const delay =
      res.status === 429 ? (retryAfterMs(res) ?? backoffMs(attempt)) : backoffMs(attempt);
    await sleep(delay);
  }

  // Unreachable — loop either returns or throws — but keeps TS happy.
  throw new XolaError("Xola request exhausted retries", {
    status: 0,
    path,
    body: lastError,
  });
}

function backoffMs(attempt: number): number {
  return BASE_BACKOFF_MS * 2 ** (attempt - 1);
}

function retryAfterMs(res: Response): number | null {
  const header = res.headers.get("Retry-After");
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
