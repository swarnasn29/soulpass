import { cn } from "@/lib/cn";

export function Logo({ className, accent = true }: { className?: string; accent?: boolean }) {
  // Hex of 6 stones: 5 dark, 1 lime.  Matches the brand mark in /SoulPass.fig.
  return (
    <svg
      viewBox="0 0 64 70"
      className={cn("h-7 w-7", className)}
      aria-label="SoulPass"
    >
      <g fill="#1F2228">
        <path d="M16 6 l12 0 l4 8 l-8 14 l-12 -4 z" />
        <path d="M36 6 l12 0 l4 18 l-12 4 l-8 -14 z" />
        <path d="M28 18 l8 0 l4 14 l-8 4 l-8 -4 z" />
        <path d="M4 28 l12 -4 l8 14 l-4 12 l-12 -4 z" />
        <path d="M24 50 l8 -4 l8 4 l4 12 l-12 4 l-12 -4 z" />
      </g>
      <path
        d={accent ? "M48 22 l12 6 l4 18 l-12 4 l-8 -14 z" : "M48 22 l12 6 l4 18 l-12 4 l-8 -14 z"}
        fill={accent ? "#B5FF1A" : "#1F2228"}
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Logo />
      <span className="font-display font-bold tracking-tight text-lg">SoulPass</span>
    </div>
  );
}
