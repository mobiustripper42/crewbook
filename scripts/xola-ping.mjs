#!/usr/bin/env node
// Smoke-test a Xola sandbox API key end-to-end.
//
// Usage:
//   node --env-file=.env.local scripts/xola-ping.mjs
//
// Requires XOLA_API_KEY in env. Hits sandbox.xola.com and prints status +
// the first experience name on success. Auth header pattern (X-API-Key vs
// Bearer) should be verified against the current Xola docs at
// https://developers.xola.com/docs/integrate-with-xola — adjust below if
// the published scheme is different.

const HOST = "https://sandbox.xola.com";
// limit=1 is best-effort — ignored if the endpoint doesn't accept it.
const PATH = "/api/experiences?limit=1";

const key = process.env.XOLA_API_KEY;
if (!key) {
  console.error("XOLA_API_KEY missing. Add it to .env.local and re-run with:");
  console.error("  node --env-file=.env.local scripts/xola-ping.mjs");
  process.exit(2);
}

const url = `${HOST}${PATH}`;
console.log(`GET ${url}`);

let res;
try {
  res = await fetch(url, {
    headers: {
      "X-API-Key": key,
      Accept: "application/json",
    },
  });
} catch (err) {
  console.error(`Network error: ${err.message}`);
  process.exit(1);
}

console.log(`Status: ${res.status} ${res.statusText}`);

const text = await res.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  body = null;
}

if (!res.ok) {
  if (res.status === 401 || res.status === 403) {
    console.error(
      "Auth failed. If the key is correct, try the other scheme: swap the\n" +
        "`X-API-Key` header above for `Authorization: Bearer ${key}` and re-run.",
    );
  }
  console.error("Request failed. Response body:");
  console.error(body ?? text);
  process.exit(1);
}

const first =
  Array.isArray(body)
    ? body[0]
    : body?.data?.[0] ?? body?.experiences?.[0] ?? body?.items?.[0];
if (first) {
  const name = first.name ?? first.title ?? "(no name field on first experience)";
  console.log(`OK — first experience: ${name}`);
} else {
  console.log("OK — request succeeded but no experiences returned (empty sandbox?).");
}
