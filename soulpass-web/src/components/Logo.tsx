import { cn } from "@/lib/cn";

// The brand mark: an icon + the SOULPASS wordmark. Lives at
// public/logo.jpeg. The source asset is a JPEG on a pure-black
// background, so we composite with `mix-blend-mode: lighten` to drop the
// black into whatever surface we're rendered on (the site bg is #08090A,
// not pure #000, so a plain <img> would otherwise show a visible rectangle).
export function Wordmark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.jpeg"
      alt="SoulPass"
      className={cn(
        "h-8 w-auto select-none",
        "mix-blend-lighten",
        className,
      )}
      draggable={false}
    />
  );
}

// Some surfaces (the Privy login modal, future favicons) want just the icon
// portion. We don't have an icon-only asset yet — until we do, render a
// horizontally-clipped slice of the full wordmark so the brand still feels
// consistent.
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-7 w-7 overflow-hidden align-middle",
        className,
      )}
      aria-label="SoulPass"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.jpeg"
        alt=""
        className="h-full w-auto max-w-none mix-blend-lighten"
        draggable={false}
      />
    </span>
  );
}
