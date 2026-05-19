// Run with: node --experimental-strip-types --test tests/unit/
//
// Stubs globalThis.fetch — no live Xola calls. Covers retry policy
// without exercising real backoff delays (tests force maxAttempts low
// or pre-arrange success).

import { strict as assert } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";

import { xolaFetch, XolaError } from "../../lib/xola/client.ts";

type FetchFn = typeof fetch;

const originalFetch: FetchFn | undefined = globalThis.fetch;
const originalEnv = { ...process.env };

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

beforeEach(() => {
  process.env.XOLA_ENV = "sandbox";
  process.env.XOLA_API_KEY = "test-key";
});

afterEach(() => {
  globalThis.fetch = originalFetch as FetchFn;
  process.env = { ...originalEnv };
});

describe("xolaFetch", () => {
  it("returns parsed JSON on 200", async () => {
    const captured: { url: string; init: RequestInit }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured.push({ url: String(input), init: init ?? {} });
      return jsonResponse(200, { ok: true, name: "Tour A" });
    }) as FetchFn;

    const out = await xolaFetch<{ ok: boolean; name: string }>("/api/experiences?limit=1");
    assert.deepEqual(out, { ok: true, name: "Tour A" });
    assert.equal(captured.length, 1);
    assert.equal(captured[0].url, "https://sandbox.xola.com/api/experiences?limit=1");
    const headers = captured[0].init.headers as Record<string, string>;
    assert.equal(headers["X-API-Key"], "test-key");
    assert.equal(headers["Accept"], "application/json");
  });

  it("throws XolaError on 4xx without retry", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return jsonResponse(404, { error: "not found" });
    }) as FetchFn;

    await assert.rejects(
      () => xolaFetch("/api/missing"),
      (err: unknown) => {
        assert.ok(err instanceof XolaError);
        assert.equal((err as XolaError).status, 404);
        assert.equal((err as XolaError).path, "/api/missing");
        assert.deepEqual((err as XolaError).body, { error: "not found" });
        return true;
      },
    );
    assert.equal(calls, 1, "should not retry on 4xx");
  });

  it("retries 5xx and surfaces final error", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return jsonResponse(503, { error: "down" });
    }) as FetchFn;

    await assert.rejects(
      () => xolaFetch("/api/flaky", { maxAttempts: 2 }),
      (err: unknown) => {
        assert.ok(err instanceof XolaError);
        assert.equal((err as XolaError).status, 503);
        return true;
      },
    );
    assert.equal(calls, 2);
  });

  it("retries 429 honoring Retry-After (small numeric)", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) {
        return jsonResponse(429, { error: "slow down" }, { "Retry-After": "0" });
      }
      return jsonResponse(200, { ok: true });
    }) as FetchFn;

    const out = await xolaFetch<{ ok: boolean }>("/api/rate");
    assert.deepEqual(out, { ok: true });
    assert.equal(calls, 2);
  });

  it("retries on network errors then succeeds", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) {
        throw new TypeError("fetch failed");
      }
      return jsonResponse(200, { ok: true });
    }) as FetchFn;

    const out = await xolaFetch<{ ok: boolean }>("/api/jittery");
    assert.deepEqual(out, { ok: true });
    assert.equal(calls, 2);
  });

  it("throws when XOLA_API_KEY missing", async () => {
    delete process.env.XOLA_API_KEY;
    await assert.rejects(
      () => xolaFetch("/api/anything"),
      /XOLA_API_KEY is not set/,
    );
  });

  it("hits prod base URL when XOLA_ENV=prod", async () => {
    process.env.XOLA_ENV = "prod";
    process.env.XOLA_PROD_API_KEY = "prod-key";
    let captured = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      captured = String(input);
      return jsonResponse(200, {});
    }) as FetchFn;

    await xolaFetch("/api/experiences");
    assert.equal(captured, "https://xola.com/api/experiences");
  });
});
