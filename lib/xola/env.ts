// Server-side only. Resolves the active Xola environment (sandbox vs prod),
// the plugin user key (DEC-114), and the active seller ID. Lazy — called per
// request, not at module load — so tests and Vercel build steps can import
// without env being set.

const SANDBOX_BASE_URL = "https://sandbox.xola.com";
const PROD_BASE_URL = "https://xola.com";

export const XOLA_API_VERSION = "2021-03-10";

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
  const keyVar = name === "prod" ? "XOLA_PROD_PLUGIN_KEY" : "XOLA_PLUGIN_KEY";
  const apiKey = process.env[keyVar];

  if (!apiKey) {
    throw new Error(
      `${keyVar} is not set. Required for XOLA_ENV='${name}'.`,
    );
  }

  return { name, baseUrl, apiKey };
}

export function resolveXolaSellerId(): string {
  const id = process.env.XOLA_SELLER_ID?.trim();
  if (!id) {
    throw new Error(
      "XOLA_SELLER_ID is not set. Required for seller-scoped Xola endpoints (DEC-114).",
    );
  }
  return id;
}
