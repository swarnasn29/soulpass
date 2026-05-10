"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui";
import { useSoulpass } from "@/hooks/useSoulpass";
import { listTemplates } from "@/lib/matchTemplates";
import { MatchmakingForm } from "@/components/MatchmakingForm";
import { cn } from "@/lib/cn";

export default function MatchingProfilePage() {
  const router = useRouter();
  const { ready, authenticated, isOnboarded, wallet, loading } = useSoulpass();
  const [templateId, setTemplateId] = useState<string>("tech");

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      router.push("/");
      return;
    }
    if (!loading && !isOnboarded) router.push("/onboarding");
  }, [ready, authenticated, loading, isOnboarded, router]);

  if (!ready || !authenticated || loading || !isOnboarded || !wallet) return null;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Link
            href="/profile"
            className="inline-flex items-center gap-1.5 text-sm text-white/55 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to profile
          </Link>
          <div className="mt-3 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--color-accent)]" />
            <h1 className="font-display text-3xl font-bold tracking-tight">Matching profile</h1>
          </div>
          <p className="mt-2 text-sm text-white/60">
            What we use to match you at events. Anything you fill in here auto-fills future events.
          </p>
        </motion.header>

        <Card className="mt-6 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-white/50">Pick a context</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {listTemplates().map((tpl) => {
              const active = templateId === tpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => setTemplateId(tpl.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    active
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                      : "border-[var(--color-border)] bg-[var(--color-bg)] text-white/70 hover:border-white/20",
                  )}
                >
                  {tpl.name}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-white/40">
            Each context asks a slightly different set of questions. Answers are shared where the
            same question shows up in multiple contexts.
          </p>
        </Card>

        <div className="mt-6">
          <MatchmakingForm
            key={templateId}
            templateId={templateId}
            walletAddress={wallet.address}
            mode="all"
            enforceRequired={false}
            submitLabel="Save changes"
          />
        </div>
      </div>
    </AppShell>
  );
}
