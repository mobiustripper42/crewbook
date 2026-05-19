// Server-side only. Resolves the active Xola environment (sandbox vs prod)
// and the API key for it. Lazy — called per request, not at module load —
// so tests and Vercel build steps can import without env being set.

const SANDBOX_BASE_URL = "https://sandbox.xola.com";
const PROD_BASE_URL = "https://xola.com";

export type XolaEnvName = "sandbox" | "prod";

export interface XolaEnv {
  name: XolaEnvName;
  baseUrl: string;
  apiKey: string;
}

export function resolveXolaEnv(): XolaEnv {
  const raw = process.env.XOLA_ENV?.trim().toLowerCase() ?? "sandbox";
  if (raw !== "sandbox" && raw !== "prod") {
    throw new Error(
      `XOLA_ENV must be 'sandbox' or 'prod' (got '${process.env.XOLA_ENV}')`,
    );
  }

  const name = raw satisfies XolaEnvName;
  const baseUrl = name === "prod" ? PROD_BASE_URL : SANDBOX_BASE_URL;
  const keyVar = name === "prod" ? "XOLA_PROD_API_KEY" : "XOLA_API_KEY";
  const apiKey = process.env[keyVar];

  if (!apiKey) {
    throw new Error(
      `${keyVar} is not set. Required for XOLA_ENV='${name}'.`,
    );
  }

  return { name, baseUrl, apiKey };
}
