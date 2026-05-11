"use client";

export const dynamic = "force-dynamic";


import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Calendar, MapPin, ArrowRight, CheckCircle2, ExternalLink, ScanLine, Crown, Sparkles, ShieldCheck, Image as ImageIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button, Card, Pill, StatTile } from "@/components/ui";
import { useSoulpass } from "@/hooks/useSoulpass";
import { useGaslessTransaction } from "@/hooks/useGaslessTransaction";
import { useApi } from "@/hooks/useApi";
import { ixRegisterForEvent, ixCancelRegistration, decodeEvent, decodeRegistration } from "@/lib/program";
import { connection, FEE_PAYER_PUBKEY, explorer } from "@/lib/solana";
import { registrationPda } from "@/lib/pda";
import { PublicKey } from "@solana/web3.js";
import type { EventAccount, RegistrationAccount } from "@/lib/program";
import type { EventMetadata } from "@/lib/eventMetaStore";
import { MatchmakingForm } from "@/components/MatchmakingForm";
import { PerfectMatchCard } from "@/components/PerfectMatchCard";
import { AIMatchPanel } from "@/components/AIMatchPanel";

function formatRange(start: number, end: number) {
  const s = new Date(start * 1000);
  const e = new Date(end * 1000);
  const sameDay = s.toDateString() === e.toDateString();
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  const time: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  if (sameDay) {
    return `${s.toLocaleDateString(undefined, opts)} · ${s.toLocaleTimeString(undefined, time)} – ${e.toLocaleTimeString(undefined, time)}`;
  }
  return `${s.toLocaleString(undefined, { ...opts, ...time })} → ${e.toLocaleString(undefined, { ...opts, ...time })}`;
}

export default function EventDetailPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = usePromise(params);
  const router = useRouter();
  const { ready, authenticated, isOnboarded, wallet, loading: userLoading } = useSoulpass();
  const { send } = useGaslessTransaction();
  const { apiFetch } = useApi();

  const [meta, setMeta] = useState<EventMetadata | null>(null);
  const [onchain, setOnchain] = useState<EventAccount | null>(null);
  const [reg, setReg] = useState<RegistrationAccount | null>(null);
  const [busy, setBusy] = useState<"register" | "cancel" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [registerPhase, setRegisterPhase] = useState<"idle" | "traits">("idle");

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      router.push("/");
      return;
    }
    if (!userLoading && !isOnboarded) router.push("/onboarding");
  }, [ready, authenticated, userLoading, isOnboarded, router]);

  const refresh = async () => {
    const eventKey = new PublicKey(address);
    const [metaResp, eventAcct] = await Promise.all([
      fetch(`/api/events/${address}`).then((r) => (r.ok ? r.json() : { event: null })),
      connection.getAccountInfo(eventKey),
    ]);
    setMeta(metaResp.event);
    setOnchain(eventAcct ? decodeEvent(eventAcct.data) : null);

    if (wallet) {
      const [regKey] = registrationPda(eventKey, new PublicKey(wallet.address));
      const regAcct = await connection.getAccountInfo(regKey);
      const decoded = regAcct ? decodeRegistration(regAcct.data) : null;
      setReg(decoded);

      // Backfill the off-chain participant row for any attendee whose on-chain
      // registration predates the Supabase mirror. The endpoint is idempotent
      // (upsert), so calling on every visit is safe and keeps the organizer
      // dashboard in sync even on RPCs that don't allow getProgramAccounts.
      if (decoded) {
        void apiFetch(`/api/events/${address}/participants`, {
          method: "POST",
          body: JSON.stringify({
            attendeeAddress: wallet.address,
            registeredAt: Number(decoded.registeredAt) * 1000,
          }),
        }).catch(() => {
          // Non-fatal — backfill will retry on next page visit.
        });
      }
    }
  };

  useEffect(() => {
    if (!authenticated) return;
    // refresh() updates state internally; this is the intended sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, authenticated, wallet?.address]);

  const isOrganizer = wallet && onchain && wallet.address === onchain.organizer.toBase58();
  // Off-chain metadata is the live display source — organizers can reschedule
  // (the on-chain timestamps stay as the permanent original).
  const startTs = meta?.startTs ?? (onchain ? Number(onchain.startTs) : 0);
  const endTs = meta?.endTs ?? (onchain ? Number(onchain.endTs) : 0);
  const isFull = onchain ? onchain.attendeeCount >= onchain.capacity : false;
  // eslint-disable-next-line react-hooks/purity
  const eventStarted = Math.floor(Date.now() / 1000) >= startTs;

  const onClickRegister = () => {
    if (meta?.matchSchema?.enabled && meta.matchSchema.templateId) {
      setRegisterPhase("traits");
      return;
    }
    void register();
  };

  const register = async () => {
    if (!wallet) return;
    setErr(null);
    setBusy("register");
    try {
      const eventKey = new PublicKey(address);
      const attendeeKey = new PublicKey(wallet.address);

      // If a Registration PDA already exists, re-sending register_for_event
      // fails with "account already in use" (system Allocate 0x0). Skip the
      // on-chain tx in that case and just sync the off-chain participant row.
      const [regKey] = registrationPda(eventKey, attendeeKey);
      const existingReg = await connection.getAccountInfo(regKey);

      if (!existingReg) {
        const ix = ixRegisterForEvent({
          attendee: attendeeKey,
          feePayer: FEE_PAYER_PUBKEY,
          eventAddr: eventKey,
        });
        await send({ instructions: [ix], walletAddress: wallet.address, walletProvider: wallet });
      }

      // Off-chain participant row — surface any failure so the organizer
      // dashboard stays consistent with on-chain state.
      await apiFetch(`/api/events/${address}/participants`, {
        method: "POST",
        body: JSON.stringify({ attendeeAddress: wallet.address }),
      });
      setRegisterPhase("idle");
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    if (!wallet) return;
    setErr(null);
    setBusy("cancel");
    try {
      const ix = ixCancelRegistration({
        attendee: new PublicKey(wallet.address),
        feePayer: FEE_PAYER_PUBKEY,
        eventAddr: new PublicKey(address),
      });
      await send({ instructions: [ix], walletAddress: wallet.address, walletProvider: wallet });
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!ready || !authenticated || userLoading || !isOnboarded) return null;

  const cover = meta?.cover;
  const venueImage = meta?.venueImage;
  const arweaveBacked = Boolean(meta?.metadataUri || meta?.coverArUri);
  const arweaveTxId = meta?.metadataUri?.startsWith("ar://")
    ? meta.metadataUri.slice(5)
    : meta?.coverArUri?.startsWith("ar://")
    ? meta.coverArUri.slice(5)
    : "";

  return (
    <AppShell>
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="overflow-hidden p-0">
          <div className="relative aspect-[21/8] w-full overflow-hidden bg-[var(--color-surface-2)]">
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" className="h-full w-full object-cover" />
            )}
            <div className="absolute right-4 top-4 flex gap-2">
              {isOrganizer && (
                <Pill tone="accent">
                  <Crown className="h-3 w-3" />
                  You&apos;re hosting
                </Pill>
              )}
              {onchain && <Pill>{onchain.status}</Pill>}
            </div>
            {arweaveBacked && (
              <div className="absolute left-4 bottom-4">
                <Pill tone="accent">
                  <ShieldCheck className="h-3 w-3" />
                  Permanent on Arweave
                </Pill>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_320px]">
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {meta?.title ?? onchain?.title ?? "Event"}
              </h1>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-white/60">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  {startTs ? formatRange(startTs, endTs) : "—"}
                </span>
                {meta?.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {meta.location}
                  </span>
                )}
              </div>
              <p className="mt-5 whitespace-pre-line text-white/80 leading-relaxed">
                {meta?.description ?? onchain?.description ?? ""}
              </p>

              <div className="mt-8 grid grid-cols-3 gap-3">
                <StatTile label="Registered" value={onchain?.attendeeCount ?? 0} />
                <StatTile label="Checked in" value={onchain?.checkedInCount ?? 0} accent />
                <StatTile label="Connections" value={onchain?.connectionCount ?? 0} />
              </div>

              {venueImage && (
                <div className="mt-8">
                  <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/50">
                    <ImageIcon className="h-3.5 w-3.5" />
                    The venue
                  </div>
                  <div className="relative aspect-[21/9] w-full overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={venueImage}
                      alt={`${meta?.title ?? "Event"} venue`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
              )}
            </div>

            <aside className="space-y-3">
              <Card className="space-y-3 border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5">
                {reg ? (
                  <RegisteredState
                    reg={reg}
                    onCancel={cancel}
                    busy={busy === "cancel"}
                    canCancel={!eventStarted && !reg.checkedIn}
                  />
                ) : isOrganizer ? (
                  <div>
                    <span className="font-display text-xs font-bold uppercase tracking-widest text-white/60">
                      Organizer tools
                    </span>
                    <p className="mt-2 text-sm text-white/70">
                      Manage participants and check guests in.
                    </p>
                    <Link href={`/dashboard?event=${address}`} className="mt-4 block">
                      <Button className="w-full">
                        Manage event
                      </Button>
                    </Link>
                    <Link href={`/events/${address}/check-in`} className="mt-2 block">
                      <Button variant="secondary" className="w-full">
                        <ScanLine className="h-4 w-4" />
                        Open check-in
                      </Button>
                    </Link>
                  </div>
                ) : registerPhase === "traits" && meta?.matchSchema?.enabled && meta.matchSchema.templateId && wallet ? (
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[var(--color-accent)]" />
                      <span className="font-display text-xs font-bold uppercase tracking-widest text-[var(--color-accent)]">
                        Quick matchmaking questions
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-white/60">
                      Helps us point you at the right person to meet at the event.
                    </p>
                    <div className="mt-4">
                      <MatchmakingForm
                        templateId={meta.matchSchema.templateId}
                        walletAddress={wallet.address}
                        submitLabel="Save & register"
                        onSubmitted={() => register()}
                      />
                    </div>
                    <button
                      onClick={() => setRegisterPhase("idle")}
                      className="mt-3 w-full text-center text-xs text-white/40 hover:text-white/70"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div>
                    <span className="font-display text-xs font-bold uppercase tracking-widest text-white/60">
                      Registration
                    </span>
                    <div className="mt-2 text-sm text-white/70">
                      {isFull
                        ? "This event is at capacity."
                        : eventStarted
                        ? "Registration closed."
                        : meta?.matchSchema?.enabled
                        ? "Free to attend. A few quick questions help us match you."
                        : "Free to attend. We pay the gas."}
                    </div>
                    <Button
                      onClick={onClickRegister}
                      loading={busy === "register"}
                      disabled={isFull || eventStarted}
                      className="mt-4 w-full"
                    >
                      Register
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </Card>

              <Card className="text-xs text-white/50">
                <div className="font-display text-[10px] font-bold uppercase tracking-widest text-white/40">
                  On-chain
                </div>
                <div className="mt-2 break-all font-mono">{address}</div>
                <Link
                  href={explorer(address)}
                  target="_blank"
                  className="mt-2 inline-flex items-center gap-1 text-[var(--color-accent)] hover:underline"
                >
                  View on Solana Explorer
                  <ExternalLink className="h-3 w-3" />
                </Link>
                {arweaveTxId && (
                  <>
                    <div className="mt-4 font-display text-[10px] font-bold uppercase tracking-widest text-white/40">
                      Permanent metadata
                    </div>
                    <div className="mt-2 break-all font-mono">
                      ar://{arweaveTxId.slice(0, 10)}…{arweaveTxId.slice(-6)}
                    </div>
                    <Link
                      href={`${process.env.NEXT_PUBLIC_IRYS_GATEWAY ?? "https://devnet.irys.xyz"}/${arweaveTxId}`}
                      target="_blank"
                      className="mt-2 inline-flex items-center gap-1 text-[var(--color-accent)] hover:underline"
                    >
                      View permanent metadata
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </>
                )}
              </Card>
            </aside>
          </div>
        </Card>
      </motion.div>

      {meta?.matchSchema?.enabled && meta.matchSchema.templateId && reg?.checkedIn && wallet && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <AIMatchPanel
            eventAddress={address}
            viewerWallet={wallet.address}
            intent="default"
          />
          <PerfectMatchCard
            eventAddress={address}
            templateId={meta.matchSchema.templateId}
            walletAddress={wallet.address}
          />
        </div>
      )}

      {err && (
        <p className="mt-4 rounded-2xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
          {err}
        </p>
      )}
    </AppShell>
  );
}

function RegisteredState({
  reg,
  onCancel,
  busy,
  canCancel,
}: {
  reg: RegistrationAccount;
  onCancel: () => void;
  busy: boolean;
  canCancel: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[var(--color-accent)]">
        <CheckCircle2 className="h-5 w-5" />
        <span className="font-display text-sm font-bold uppercase tracking-widest">
          {reg.checkedIn ? "Checked in" : "You're in"}
        </span>
      </div>
      <p className="mt-2 text-sm text-white/70">
        {reg.checkedIn
          ? "Welcome to the room. Scan attendees to record connections."
          : "We'll remind you the day before. Reputation is on the line."}
      </p>
      {canCancel && (
        <Button onClick={onCancel} loading={busy} variant="secondary" className="mt-4 w-full">
          Cancel registration
        </Button>
      )}
    </div>
  );
}
