"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, Star, Heart, RefreshCw } from "lucide-react";
import { Button, Card, Pill } from "./ui";
import { cn } from "@/lib/cn";
import { getTemplate } from "@/lib/matchTemplates";

type MatchCandidate = {
  wallet: string;
  user: { name: string; avatar: string; bio?: string } | null;
  profile: { reputation: number; eventsAttended: number; connectionsMade: number; badgesEarned: number } | null;
  score: number;
  topReasons: string[];
  breakdown: Array<{ label: string; rule: string; weight: number; score: number; note: string }>;
  checkedIn: boolean;
};

type ApiPayload = {
  templateId: string;
  templateName: string;
  intentApplied: string;
  viewerCheckedIn: boolean;
  candidates: MatchCandidate[];
  topMutual: boolean;
};

type Props = {
  eventAddress: string;
  templateId: string;
  walletAddress: string;
};

const POLL_MS = 8000;

export function PerfectMatchCard({ eventAddress, templateId, walletAddress }: Props) {
  const [data, setData] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [intent, setIntent] = useState<string>("default");
  const [showAll, setShowAll] = useState(false);

  const template = getTemplate(templateId);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchOnce = async () => {
      try {
        const res = await fetch(
          `/api/events/${eventAddress}/matches?for=${walletAddress}&intent=${intent}&limit=10`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? "Failed to load matches");
        }
        const json = (await res.json()) as ApiPayload;
        if (cancelled) return;
        setData(json);
        setErr(null);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = setTimeout(fetchOnce, POLL_MS);
        }
      }
    };

    void fetchOnce();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [eventAddress, walletAddress, intent]);

  const top = data?.candidates[0];
  const others = data?.candidates.slice(1) ?? [];

  return (
    <Card className="overflow-hidden p-0">
      <div className="bg-gradient-to-br from-[var(--color-accent)]/15 via-transparent to-transparent p-5 border-b border-[var(--color-border)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--color-accent)]" />
              <span className="font-display text-xs font-bold uppercase tracking-widest text-[var(--color-accent)]">
                Your perfect next match
              </span>
            </div>
            <p className="mt-1 text-xs text-white/55">
              {data?.templateName ?? "Live"} • re-ranks every {POLL_MS / 1000}s
            </p>
          </div>
          {top && data?.topMutual && (
            <Pill tone="accent">
              <Heart className="h-3 w-3" />
              They picked you too
            </Pill>
          )}
        </div>

        {/* Intent override pills */}
        {template && template.intents.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {template.intents.map((i) => {
              const active = intent === i.id;
              return (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setIntent(i.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors",
                    active
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                      : "border-[var(--color-border)] bg-[var(--color-bg)] text-white/60 hover:border-white/20",
                  )}
                >
                  {i.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-5">
        {loading && !data && <p className="text-sm text-white/55">Looking for matches…</p>}
        {err && (
          <div className="rounded-2xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
            {err}
          </div>
        )}
        {!loading && data && data.candidates.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-white">No matches in the room yet.</p>
            <p className="text-xs text-white/55">
              We&apos;ll re-check every few seconds as more people check in.
            </p>
          </div>
        )}

        {top && (
          <AnimatePresence mode="wait">
            <motion.div
              key={top.wallet + intent}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-start gap-4">
                {top.user?.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={top.user.avatar}
                    alt=""
                    className="h-16 w-16 rounded-2xl border border-[var(--color-border)] object-cover"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-2xl bg-[var(--color-surface)]" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-2xl font-bold text-white">
                      {top.user?.name ?? top.wallet.slice(0, 6) + "…"}
                    </h3>
                    <span className="rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-[10px] font-bold text-black">
                      {Math.round(top.score * 100)}% match
                    </span>
                  </div>
                  {top.profile && (
                    <div className="mt-1 flex items-center gap-3 text-xs text-white/55">
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3 w-3 text-[var(--color-accent)]" />
                        {top.profile.reputation} rep
                      </span>
                      <span>{top.profile.connectionsMade} connections</span>
                      <span>{top.profile.badgesEarned} badges</span>
                    </div>
                  )}
                  {top.user?.bio && (
                    <p className="mt-2 line-clamp-2 text-sm text-white/70">{top.user.bio}</p>
                  )}
                </div>
              </div>

              {top.topReasons.length > 0 && (
                <div className="mt-4 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                    Why
                  </p>
                  {top.topReasons.map((r, i) => (
                    <p key={i} className="text-sm text-white/85">
                      • {r}
                    </p>
                  ))}
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                <Link href={`/u/${top.wallet}`} className="flex-1">
                  <Button className="w-full">
                    See profile
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Button variant="secondary" onClick={() => setShowAll((v) => !v)}>
                  <RefreshCw className="h-4 w-4" />
                  {showAll ? "Hide other matches" : `${others.length} more`}
                </Button>
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {showAll && others.length > 0 && (
          <div className="mt-5 space-y-2 border-t border-[var(--color-border)] pt-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
              Other matches
            </p>
            {others.map((c) => (
              <Link
                href={`/u/${c.wallet}`}
                key={c.wallet}
                className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 hover:border-white/20"
              >
                {c.user?.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.user.avatar} alt="" className="h-9 w-9 rounded-xl object-cover" />
                ) : (
                  <div className="h-9 w-9 rounded-xl bg-[var(--color-surface)]" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">
                    {c.user?.name ?? c.wallet.slice(0, 6) + "…"}
                  </p>
                  {c.topReasons[0] && (
                    <p className="text-xs text-white/55">{c.topReasons[0]}</p>
                  )}
                </div>
                <span className="text-xs font-bold text-[var(--color-accent)]">
                  {Math.round(c.score * 100)}%
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
