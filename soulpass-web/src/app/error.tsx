"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error("[soulpass] uncaught render error:", error);
    }
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--color-bg)] px-6">
      <div className="max-w-md space-y-4 rounded-3xl border border-[var(--color-border)] bg-black/30 p-8 text-center backdrop-blur">
        <div className="text-sm font-semibold uppercase tracking-wider text-[var(--color-danger)]">
          Something broke
        </div>
        <h1 className="text-2xl font-semibold text-white">We hit an unexpected error</h1>
        <p className="text-sm text-white/60">
          The page failed to render. Try again — if it keeps happening, refresh fully or head
          back to the home screen.
        </p>
        <div className="flex flex-col items-center gap-2 pt-2 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="rounded-full bg-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-black transition hover:bg-[var(--color-accent)]/90"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-full border border-[var(--color-border)] px-5 py-2 text-sm font-semibold text-white/80 hover:bg-white/5"
          >
            Go home
          </Link>
        </div>
        {error.digest && (
          <p className="pt-2 text-[11px] text-white/40">ref: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
