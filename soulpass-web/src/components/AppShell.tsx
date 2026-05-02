"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Compass, Plus, QrCode, User2, LogOut } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { Wordmark } from "./Logo";
import { cn } from "@/lib/cn";
import { useSoulpass } from "@/hooks/useSoulpass";

const NAV = [
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/scan", label: "Scan", icon: QrCode },
  { href: "/events/new", label: "Create", icon: Plus },
  { href: "/profile", label: "Profile", icon: User2 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout } = usePrivy();
  const router = useRouter();
  const { data } = useSoulpass();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-bg)]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link href="/discover" className="flex items-center gap-2">
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => {
              const active = pathname?.startsWith(n.href);
              const Icon = n.icon;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition",
                    active
                      ? "bg-white text-black"
                      : "text-white/60 hover:text-white hover:bg-white/5",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3">
            {data?.meta && (
              <Link href="/profile" className="hidden items-center gap-2 sm:flex">
                <img
                  src={data.meta.avatar}
                  alt=""
                  className="h-8 w-8 rounded-full bg-[var(--color-surface-2)] ring-2 ring-[var(--color-border)]"
                />
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold">{data.meta.name}</span>
                  <span className="font-mono text-[10px] text-[var(--color-muted)]">
                    {data.authority.slice(0, 4)}…{data.authority.slice(-4)}
                  </span>
                </div>
              </Link>
            )}
            <button
              onClick={async () => {
                await logout();
                router.push("/");
              }}
              className="rounded-full bg-white/5 p-2 text-white/60 hover:bg-white/10 hover:text-white"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-32 pt-6">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/90 p-1.5 backdrop-blur-xl shadow-xl shadow-black/40 md:hidden">
        {NAV.map((n) => {
          const active = pathname?.startsWith(n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "flex h-11 items-center gap-2 rounded-full px-4 text-xs font-semibold transition",
                active ? "bg-[var(--color-accent)] text-black" : "text-white/60 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{n.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
