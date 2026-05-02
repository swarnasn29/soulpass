"use client";

export const dynamic = "force-dynamic";


import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Zap, ShieldCheck, Award } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui";
import { Wordmark } from "@/components/Logo";

export default function LandingPage() {
  const { login, authenticated, ready } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && authenticated) router.push("/discover");
  }, [ready, authenticated, router]);

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Wordmark />
        <div className="hidden items-center gap-2 sm:flex">
          <Link
            href="/discover"
            className="rounded-full px-4 py-2 text-sm font-semibold text-white/60 hover:text-white"
          >
            Explore
          </Link>
          <Button onClick={login} size="sm">
            Sign in
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-24 pt-12 sm:pt-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="mx-auto max-w-3xl text-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white/70">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            Built on Solana · Free to use
          </span>

          <h1 className="mt-6 font-display text-5xl font-bold tracking-tight sm:text-7xl">
            Show up.{" "}
            <span className="text-[var(--color-accent)]">Build a soul.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg text-white/70 sm:text-xl">
            SoulPass turns every event you attend and every connection you make into
            permanent on-chain proof of who you are as a networker.
            <span className="block text-white/50 mt-2">
              No wallets. No gas. No popups. Just sign in with Google.
            </span>
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button onClick={login} size="lg" className="w-full sm:w-auto">
              Join with Google
              <ArrowRight className="h-5 w-5" />
            </Button>
            <Link href="/discover">
              <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                Browse events
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs uppercase tracking-wider text-white/40">
            Or sign in with email · Apple · or connect Phantom
          </p>
        </motion.div>

        <div className="mt-24 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Feature
            icon={<Zap className="h-5 w-5" />}
            title="Zero friction"
            body="Login with Google, no seed phrase. Privy invisibly creates your wallet."
          />
          <Feature
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Soul-bound rep"
            body="Every check-in, every handshake — permanently on-chain. Can't be faked."
          />
          <Feature
            icon={<Award className="h-5 w-5" />}
            title="Earn badges"
            body="Connector, Full House, Streak — gamified collectibles for showing up."
          />
        </div>

        <section className="mt-28 grid grid-cols-1 items-center gap-12 md:grid-cols-2">
          <div>
            <span className="font-display text-xs font-bold uppercase tracking-widest text-[var(--color-accent)]">
              For organizers
            </span>
            <h2 className="mt-3 font-display text-4xl font-bold leading-tight">
              Stop planning for
              <br />
              <span className="text-[var(--color-muted)] line-through">50</span>{" "}
              when only 20 show up.
            </h2>
            <p className="mt-4 text-white/60">
              Approve attendees by their on-chain reputation. Speakers and sponsors get
              the room they were promised. No-shows lose rep — automatically.
            </p>
            <div className="mt-6">
              <Link href="/events/new">
                <Button>
                  <Sparkles className="h-4 w-4" />
                  Host an event
                </Button>
              </Link>
            </div>
          </div>
          <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                Live attendance · Tonight
              </span>
              <span className="rounded-full bg-[var(--color-accent)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--color-accent)]">
                92%
              </span>
            </div>
            <div className="mt-6 flex items-end gap-1.5">
              {[24, 41, 58, 70, 78, 84, 88, 92].map((v, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-md bg-[var(--color-accent)]"
                  style={{ height: `${v}%`, opacity: 0.4 + i * 0.08 }}
                />
              ))}
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3">
              <Stat label="Reg" value="48" />
              <Stat label="Checked in" value="44" tone="accent" />
              <Stat label="Connections" value="119" />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--color-border)]">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-5 py-8 text-sm text-white/50 sm:flex-row sm:items-center">
          <Wordmark />
          <div className="font-mono text-xs uppercase tracking-widest text-white/40">
            Colosseum Frontier 2026 · Built on Solana · Powered by Privy + Helius
          </div>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
    >
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
        {icon}
      </div>
      <h3 className="mt-4 font-display text-lg font-bold">{title}</h3>
      <p className="mt-1 text-sm text-white/60">{body}</p>
    </motion.div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "accent" }) {
  return (
    <div
      className={
        "rounded-xl border px-3 py-2 " +
        (tone === "accent"
          ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-black"
          : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-white")
      }
    >
      <div
        className={
          "text-[10px] font-bold uppercase tracking-wider " +
          (tone === "accent" ? "text-black/60" : "text-white/40")
        }
      >
        {label}
      </div>
      <div className="font-display text-xl font-bold">{value}</div>
    </div>
  );
}
