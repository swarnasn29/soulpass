import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/node";

// Singleton — the Privy client lazily fetches JWKS on first verify.
let cachedClient: PrivyClient | null = null;

function getPrivy(): PrivyClient {
  if (cachedClient) return cachedClient;
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  const missing: string[] = [];
  if (!appId) missing.push("NEXT_PUBLIC_PRIVY_APP_ID");
  if (!appSecret) missing.push("PRIVY_APP_SECRET");
  if (missing.length) {
    throw new AuthConfigError(
      `Privy server-side auth not configured — missing env: ${missing.join(", ")}`,
    );
  }
  cachedClient = new PrivyClient({ appId: appId!, appSecret: appSecret! });
  return cachedClient;
}

// Cache user_id → Solana wallet address. Privy sessions are typically 1h+; a
// 5-minute TTL keeps verify fast without holding stale data after re-link.
type CachedSession = { wallet: string; expiresAt: number };
const sessionCache = new Map<string, CachedSession>();
const SESSION_TTL_MS = 5 * 60_000;

export class UnauthorizedError extends Error {
  status = 401 as const;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  status = 403 as const;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

// Server is misconfigured (missing env vars, JWKS unreachable, etc). Surfaced
// as 500 to the client but with a descriptive message so the developer can
// see WHY in the network tab instead of a generic "Auth check failed".
export class AuthConfigError extends Error {
  status = 500 as const;
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigError";
  }
}

export type AuthSession = {
  userId: string;
  wallet: string; // Solana base58 address (embedded or external)
};

function extractToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

/**
 * Verifies the Privy access token in the Authorization header and returns the
 * authenticated user's Solana wallet address. Throws UnauthorizedError if no
 * valid token is present.
 *
 * Why we look up the full user: the access token only carries `user_id`. To
 * map that to a wallet we have to call the Privy API once. Result is cached
 * per-process for SESSION_TTL_MS so subsequent calls in the same instance are
 * free.
 */
export async function requireSession(req: NextRequest): Promise<AuthSession> {
  const token = extractToken(req);
  if (!token) throw new UnauthorizedError("Missing Authorization: Bearer token");

  const privy = getPrivy();

  let userId: string;
  try {
    const payload = await privy.utils().auth().verifyAccessToken(token);
    userId = payload.user_id;
  } catch {
    throw new UnauthorizedError("Invalid or expired session");
  }

  // Cache hit
  const now = Date.now();
  const cached = sessionCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return { userId, wallet: cached.wallet };
  }

  // Cache miss — fetch user, find Solana wallet
  let wallet: string | null = null;
  try {
    const user = await privy.users()._get(userId);
    const accounts = (user.linked_accounts ?? []) as Array<{
      type?: string;
      chain_type?: string;
      address?: string;
    }>;
    const solana = accounts.find(
      (a) =>
        a.chain_type === "solana" &&
        typeof a.address === "string" &&
        a.address.length > 0,
    );
    wallet = solana?.address ?? null;
  } catch {
    throw new UnauthorizedError("Failed to resolve session wallet");
  }

  if (!wallet) {
    throw new ForbiddenError("No Solana wallet linked to this Privy account");
  }

  sessionCache.set(userId, { wallet, expiresAt: now + SESSION_TTL_MS });
  return { userId, wallet };
}

/**
 * Convenience: ensures the authenticated wallet matches `expected`. Throws
 * ForbiddenError if they don't match. Returns the session for further use.
 */
export async function requireWallet(
  req: NextRequest,
  expected: string,
): Promise<AuthSession> {
  const session = await requireSession(req);
  if (session.wallet !== expected) {
    throw new ForbiddenError(
      `Caller wallet ${session.wallet} does not match required ${expected}`,
    );
  }
  return session;
}

/**
 * Maps an auth error thrown by requireSession/requireWallet to the right
 * NextResponse. Routes used to do this inline with a hardcoded "Auth check
 * failed" 500 — which hid real config errors (missing env vars, etc).
 * Returns null if the error is not auth-related (caller should rethrow).
 */
export function authErrorResponse(e: unknown): NextResponse | null {
  if (e instanceof UnauthorizedError) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  if (e instanceof ForbiddenError) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
  if (e instanceof AuthConfigError) {
    // Log so the developer can see the full reason in the server console; the
    // message itself is descriptive enough to also return to the client.
    console.error("[auth] config error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
  return null;
}
