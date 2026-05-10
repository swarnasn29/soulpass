"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Brain,
  ChevronDown,
  Cpu,
  RefreshCw,
  Sparkles,
  Star,
} from "lucide-react";
import { Button, Card, Pill } from "./ui";
import { cn } from "@/lib/cn";
import { useAIMatch, type AIMatchCandidate } from "@/hooks/useAIMatch";

type Props = {
  eventAddress: string;
  viewerWallet: string;
  intent: string;
};

export function AIMatchPanel({ eventAddress, viewerWallet, intent }: Props) {
  const { phase, meta, thinking, result, error, refresh } = useAIMatch({
    eventAddress,
    viewerWallet,
    intent,
  });
  // Derived: open while streaming, auto-closed on done — unless the user
  // manually overrode it (then we honor their choice).
  const [userOverride, setUserOverride] = useState<boolean | null>(null);
  const thinkingOpen = userOverride ?? phase !== "done";
  const toggleThinking = () => setUserOverride(!thinkingOpen);
  const thinkingScrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the thinking pane as new tokens arrive so the latest reasoning is visible.
  useEffect(() => {
    if (!thinkingScrollRef.current) return;
    thinkingScrollRef.current.scrollTop = thinkingScrollRef.current.scrollHeight;
  }, [thinking]);

  const candidates = result?.candidates ?? meta?.candidates ?? [];
  const byWallet = new Map(candidates.map((c) => [c.wallet, c]));
  const primaryCandidate = result?.primary ? byWallet.get(result.primary.wallet) : null;
  const alternateCandidates = (result?.alternates ?? [])
    .map((a) => ({ ...a, candidate: byWallet.get(a.wallet) ?? null }))
    .filter((a): a is { wallet: string; reason: string; candidate: AIMatchCandidate } => !!a.candidate);

  const phaseLabel: Record<typeof phase, string> = {
    idle: "Booting agent…",
    thinking: "Reasoning…",
    writing: "Picking your match…",
    done: "Recommendation ready",
    error: "Agent error",
  };

  const isLive = phase === "thinking" || phase === "writing";

  return (
    <Card className="overflow-hidden p-0">
      {/* Header */}
      <div className="relative border-b border-[var(--color-border)] bg-gradient-to-br from-[var(--color-accent)]/15 via-transparent to-transparent p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="relative inline-flex h-7 w-7 items-center justify-center rounded-xl bg-[var(--color-accent)]/15">
                <Sparkles className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                {isLive && (
                  <span className="absolute -right-0.5 -top-0.5 inline-flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-accent)] opacity-70" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-accent)]" />
                  </span>
                )}
              </div>
              <span className="font-display text-xs font-bold uppercase tracking-widest text-[var(--color-accent)]">
                AI Matchmaker
              </span>
              {meta?.model && (
                <Pill className="hidden text-[10px] sm:inline-flex">
                  <Cpu className="h-3 w-3" />
                  {prettyModel(meta.model)}
                </Pill>
              )}
            </div>
            <p className="mt-1 truncate text-xs text-white/55">{phaseLabel[phase]}</p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={isLive}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[11px] font-semibold text-white/70 transition-colors hover:text-white",
              isLive && "opacity-50",
            )}
            aria-label="Refresh AI match"
          >
            <RefreshCw className={cn("h-3 w-3", isLive && "animate-spin")} />
            Re-run
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-4 p-5">
        {/* Reasoning panel — shown while thinking and collapsible after */}
        {(thinking || phase === "thinking" || phase === "writing") && (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)]">
            <button
              type="button"
              onClick={toggleThinking}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
              aria-expanded={thinkingOpen}
            >
              <div className="flex items-center gap-2">
                <Brain className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                <span className="font-display text-[10px] font-bold uppercase tracking-widest text-white/70">
                  Agent reasoning
                </span>
                {isLive && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-white/40">
                    <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-[var(--color-accent)]" />
                    live
                  </span>
                )}
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-white/40 transition-transform",
                  thinkingOpen && "rotate-180",
                )}
              />
            </button>
            <AnimatePresence initial={false}>
              {thinkingOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div
                    ref={thinkingScrollRef}
                    className="max-h-48 overflow-y-auto border-t border-[var(--color-border)] px-4 py-3 font-mono text-[11px] leading-relaxed text-white/60"
                  >
                    {thinking ? (
                      <span className="whitespace-pre-wrap">{thinking}</span>
                    ) : (
                      <ThinkingDots />
                    )}
                    {isLive && thinking && (
                      <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-[var(--color-accent)] align-middle" />
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        )}

        {/* Primary match card */}
        <AnimatePresence mode="wait">
          {result?.primary && primaryCandidate && (
            <motion.div
              key={result.primary.wallet}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl border border-[var(--color-accent)]/40 bg-gradient-to-br from-[var(--color-accent)]/8 via-[var(--color-bg)] to-[var(--color-bg)] p-4"
            >
              <div className="flex items-start gap-3">
                {primaryCandidate.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={primaryCandidate.avatar}
                    alt=""
                    className="h-14 w-14 rounded-2xl border border-[var(--color-border)] object-cover"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-2xl bg-[var(--color-surface)]" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-display text-xl font-bold text-white">
                      {primaryCandidate.name ?? shortAddr(primaryCandidate.wallet)}
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black">
                      <Sparkles className="h-3 w-3" />
                      AI pick
                    </span>
                  </div>
                  {primaryCandidate.reputation != null && (
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/55">
                      <Star className="h-3 w-3 text-[var(--color-accent)]" />
                      {primaryCandidate.reputation} rep
                    </div>
                  )}
                </div>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-white/90">
                <span className="font-display text-[10px] font-bold uppercase tracking-widest text-[var(--color-accent)]">
                  Why
                </span>
                <br />
                {result.primary.reason}
              </p>

              {primaryCandidate.preRankReasons[0] && (
                <p className="mt-2 text-[11px] text-white/45">
                  Engine signal · {primaryCandidate.preRankReasons[0]}
                </p>
              )}

              <Link
                href={`/u/${primaryCandidate.wallet}`}
                className="mt-4 block"
              >
                <Button className="w-full">
                  Walk over to {firstName(primaryCandidate.name) ?? "them"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>

              {result.fallback && (
                <p className="mt-2 text-[10px] uppercase tracking-wider text-white/35">
                  agent unavailable — engine fallback
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Skeleton while waiting for the first result */}
        {!result?.primary && !error && phase !== "idle" && (
          <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-6 text-center">
            <p className="text-sm text-white/55">
              Reading {meta?.candidateCount ?? 0} attendee{(meta?.candidateCount ?? 0) === 1 ? "" : "s"}…
            </p>
          </div>
        )}

        {result && result.primary === null && (
          <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-6 text-center">
            <p className="text-sm font-semibold text-white">
              No checked-in attendees to match yet.
            </p>
            <p className="mt-1 text-xs text-white/55">
              Re-run as more people show up.
            </p>
          </div>
        )}

        {/* Alternates */}
        {alternateCandidates.length > 0 && (
          <div className="space-y-2">
            <p className="font-display text-[10px] font-bold uppercase tracking-widest text-white/40">
              Other strong matches
            </p>
            {alternateCandidates.map((a) => (
              <Link
                key={a.wallet}
                href={`/u/${a.wallet}`}
                className="flex items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 transition-colors hover:border-white/20"
              >
                {a.candidate.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.candidate.avatar}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded-xl bg-[var(--color-surface)]" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {a.candidate.name ?? shortAddr(a.wallet)}
                  </p>
                  <p className="line-clamp-2 text-xs text-white/60">{a.reason}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-accent)]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-accent)] [animation-delay:120ms]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-accent)] [animation-delay:240ms]" />
      <span className="ml-2 text-white/45">connecting to NVIDIA NIM…</span>
    </span>
  );
}

function shortAddr(a: string): string {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

function firstName(name: string | null | undefined): string | null {
  if (!name) return null;
  return name.split(/[\s.@]/)[0] || null;
}

function prettyModel(id: string): string {
  // "nvidia/llama-3.3-nemotron-super-49b-v1.5" → "Nemotron Super 49B"
  const tail = id.split("/").pop() ?? id;
  if (/nemotron-super/i.test(tail)) return "Nemotron Super 49B";
  if (/nemotron/i.test(tail)) return "Nemotron";
  if (/llama-?4/i.test(tail)) return "Llama 4";
  if (/llama-?3\.3/i.test(tail)) return "Llama 3.3";
  return tail;
}
