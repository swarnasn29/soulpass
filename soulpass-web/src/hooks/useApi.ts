"use client";

import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";

export type ApiFetchInit = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
  /** Abort the request after this many ms. Default 30_000. Set to 0 to disable. */
  timeoutMs?: number;
  /** Skip attaching the Privy access token (e.g. for public endpoints). */
  unauthenticated?: boolean;
};

/**
 * Auth-aware fetch hook. Returns an `apiFetch(url, init)` that:
 *   - Attaches the Privy access token as `Authorization: Bearer <token>`
 *   - Aborts after `timeoutMs` (default 30s)
 *   - Throws an Error with the server's `{ error }` message on non-2xx
 *
 * Usage:
 *   const { apiFetch } = useApi();
 *   const res = await apiFetch("/api/events", { method: "POST", body: JSON.stringify(...) });
 */
export function useApi() {
  const { getAccessToken } = usePrivy();

  const apiFetch = useCallback(
    async (input: string, init: ApiFetchInit = {}) => {
      const { headers = {}, timeoutMs = 30_000, unauthenticated, ...rest } = init;

      const finalHeaders: Record<string, string> = { ...headers };
      if (!unauthenticated) {
        const token = await getAccessToken();
        if (token) finalHeaders["Authorization"] = `Bearer ${token}`;
      }

      // Default Content-Type for JSON bodies — only when caller didn't override
      // and the body is a string (FormData should be left to the browser).
      if (
        rest.body &&
        typeof rest.body === "string" &&
        !Object.keys(finalHeaders).some((k) => k.toLowerCase() === "content-type")
      ) {
        finalHeaders["Content-Type"] = "application/json";
      }

      const controller = timeoutMs > 0 ? new AbortController() : null;
      const timer = controller
        ? setTimeout(() => controller.abort(new DOMException("Timeout", "AbortError")), timeoutMs)
        : null;

      try {
        const res = await fetch(input, {
          ...rest,
          headers: finalHeaders,
          signal: controller?.signal ?? rest.signal,
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error || `${res.status} ${res.statusText}`);
        }
        return res;
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    [getAccessToken],
  );

  return { apiFetch };
}
