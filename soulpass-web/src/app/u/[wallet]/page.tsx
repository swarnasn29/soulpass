import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Sparkles } from "lucide-react";
import { Card, Pill } from "@/components/ui";
import { Wordmark } from "@/components/Logo";
import { explorer, RPC_URL } from "@/lib/solana";
import { userPda } from "@/lib/pda";
import { decodeUserProfile } from "@/lib/program";
import { PublicKey, Connection } from "@solana/web3.js";
import { getUser } from "@/lib/eventMetaStore";

export const revalidate = 30;

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ wallet: string }>;
}) {
  const { wallet } = await params;

  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(wallet);
  } catch {
    notFound();
  }

  const conn = new Connection(RPC_URL, "confirmed");
  const [profilePda] = userPda(pubkey);
  const [acct, meta] = await Promise.all([
    conn.getAccountInfo(profilePda),
    getUser(wallet),
  ]);
  const onchain = acct ? decodeUserProfile(acct.data) : null;

  if (!onchain && !meta) notFound();

  const rep = Number(onchain?.reputation ?? 500);

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Link href="/">
          <Wordmark />
        </Link>
        <Link
          href="/discover"
          className="rounded-full bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-white/70 hover:text-white"
        >
          Open SoulPass
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-24">
        <Card className="relative overflow-hidden">
          <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[auto_1fr]">
            <img
              src={meta?.avatar ?? `https://api.dicebear.com/7.x/notionists-neutral/svg?seed=${wallet}&backgroundColor=B5FF1A`}
              alt=""
              className="h-28 w-28 rounded-3xl bg-[var(--color-surface-2)] ring-2 ring-[var(--color-border)]"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-3xl font-bold sm:text-4xl">
                  {meta?.name ?? onchain?.name ?? "SoulPass user"}
                </h1>
                <Pill tone="accent">
                  <Sparkles className="h-3 w-3" />
                  {rep >= 1000 ? "Top Networker" : rep >= 600 ? "Rising" : "Starter"}
                </Pill>
              </div>
              <div className="mt-1 font-mono text-xs text-white/40 break-all">{wallet}</div>
              {meta?.bio && (
                <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-white/80">
                  {meta.bio}
                </p>
              )}
              <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Reputation" value={rep} highlight />
                <Stat label="Events" value={onchain?.eventsAttended ?? 0} />
                <Stat label="Connections" value={onchain?.connectionsMade ?? 0} />
                <Stat label="Badges" value={onchain?.badgesEarned ?? 0} />
              </div>
              <div className="mt-5">
                <Link
                  href={explorer(profilePda.toBase58())}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 text-xs text-[var(--color-accent)] hover:underline"
                >
                  View on-chain
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        </Card>

        <p className="mt-6 text-center text-sm text-white/50">
          {onchain
            ? `On-chain since ${new Date(Number(onchain.createdAt) * 1000).toLocaleDateString()}.`
            : "Off-chain profile only — has not yet initialized on-chain."}
        </p>
      </main>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">{label}</div>
      <div
        className={
          "font-display font-bold tabular-nums " +
          (highlight ? "text-3xl text-[var(--color-accent)]" : "text-xl")
        }
      >
        {value}
      </div>
    </div>
  );
}
