import "server-only";

// Required at runtime on every request that hits a server route. Validated
// once at boot so a missing var fails fast with a clear message instead of
// surfacing as cryptic 500s deep inside SDK calls.
const REQUIRED = [
  "NEXT_PUBLIC_PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "FEE_PAYER_SECRET_KEY",
] as const;

let validated = false;

export function validateEnv() {
  if (validated) return;

  // Skip during `next build` page-data collection — env vars are set at
  // request-time on Vercel, not during the build. Downstream getters
  // (getSupabase, Privy auth, fee payer) throw clear errors at first use.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const missing = REQUIRED.filter((k) => !process.env[k] || process.env[k]!.trim() === "");
  if (missing.length > 0) {
    const message =
      `Missing required env vars: ${missing.join(", ")}. ` +
      `See .env.example for documentation.`;
    if (process.env.NODE_ENV === "production") {
      throw new Error(message);
    } else {
      console.warn(`[soulpass] ${message}`);
    }
  }
  validated = true;
}
