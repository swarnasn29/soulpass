"use client";

export const dynamic = "force-dynamic";


import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { Wordmark } from "@/components/Logo";
import { useSoulpass } from "@/hooks/useSoulpass";
import { useGaslessTransaction } from "@/hooks/useGaslessTransaction";
import { ixInitializeUser } from "@/lib/program";
import { FEE_PAYER_PUBKEY } from "@/lib/solana";
import { PublicKey } from "@solana/web3.js";

export default function OnboardingPage() {
  const router = useRouter();
  const { ready, authenticated, wallet, data, isOnboarded, refresh } = useSoulpass();
  const { send } = useGaslessTransaction();

  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) router.push("/");
  }, [ready, authenticated, router]);

  useEffect(() => {
    if (isOnboarded) router.push("/discover");
  }, [isOnboarded, router]);

  // Pre-fill from privy email — defer to next tick to avoid in-effect setState lint
  useEffect(() => {
    if (!data?.privyEmail || name) return;
    const id = setTimeout(() => setName(data.privyEmail!.split("@")[0] ?? ""), 0);
    return () => clearTimeout(id);
  }, [data?.privyEmail, name]);

  const submit = async () => {
    if (!wallet) return;
    if (!name.trim()) return;
    setSubmitting(true);
    setErr(null);
    try {
      const authority = new PublicKey(wallet.address);
      const avatar = `https://api.dicebear.com/7.x/notionists-neutral/svg?seed=${wallet.address}&backgroundColor=B5FF1A`;

      // 1) Save off-chain metadata
      await fetch(`/api/users/${wallet.address}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          avatar,
          email: data?.privyEmail,
        }),
      });

      // 2) On-chain UserProfile (gasless)
      const ix = ixInitializeUser(authority, FEE_PAYER_PUBKEY, name.trim(), avatar);
      await send({
        instructions: [ix],
        walletAddress: wallet.address,
        walletProvider: wallet,
      });

      await refresh();
      router.push("/discover");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!ready || !authenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-white/60">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Wordmark />
        <span className="font-mono text-[11px] text-white/40">
          {wallet?.address.slice(0, 4)}…{wallet?.address.slice(-4)}
        </span>
      </header>

      <main className="mx-auto max-w-md px-5 pb-24 pt-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="mx-auto inline-flex items-center justify-center rounded-2xl bg-[var(--color-accent)]/10 p-3 text-[var(--color-accent)]">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="mt-4 font-display text-3xl font-bold">Pick your handle</h1>
          <p className="mt-2 text-white/60">
            This is how organizers will see you. You can change it anytime.
          </p>
        </motion.div>

        <div className="mt-8 space-y-4">
          <Input
            label="Display name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="alex.eth"
            maxLength={48}
            autoFocus
          />

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center gap-3">
              <img
                src={`https://api.dicebear.com/7.x/notionists-neutral/svg?seed=${wallet?.address}&backgroundColor=B5FF1A`}
                alt=""
                className="h-12 w-12 rounded-full bg-[var(--color-surface-2)]"
              />
              <div>
                <div className="font-display font-semibold">{name || "Your name"}</div>
                <div className="font-mono text-[11px] text-white/40">
                  {wallet?.address.slice(0, 6)}…{wallet?.address.slice(-6)}
                </div>
              </div>
            </div>
          </div>

          {err && (
            <p className="rounded-xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
              {err}
            </p>
          )}

          <Button
            onClick={submit}
            loading={submitting}
            disabled={!name.trim()}
            className="w-full"
            size="lg"
          >
            Create my SoulPass
            <ArrowRight className="h-5 w-5" />
          </Button>

          <p className="text-center text-xs text-white/40">
            Starting reputation: 500 · No SOL needed · We pay the gas
          </p>
        </div>
      </main>
    </div>
  );
}
