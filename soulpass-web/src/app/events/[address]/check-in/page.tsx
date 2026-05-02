"use client";

export const dynamic = "force-dynamic";


import { useEffect, useMemo, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ScanLine, ArrowLeft, AlertTriangle, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button, Card, Pill } from "@/components/ui";
import QRScanner from "@/components/QRScanner";
import { QRCode } from "@/components/QRCode";
import { useSoulpass } from "@/hooks/useSoulpass";
import { useGaslessTransaction } from "@/hooks/useGaslessTransaction";
import { ixCheckIn, decodeEvent, type EventAccount } from "@/lib/program";
import { connection } from "@/lib/solana";
import { PublicKey } from "@solana/web3.js";

type Toast = { kind: "ok" | "err"; text: string } | null;

export default function CheckInPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = usePromise(params);
  const router = useRouter();
  const { ready, authenticated, isOnboarded, wallet } = useSoulpass();
  const { send } = useGaslessTransaction();

  const [event, setEvent] = useState<EventAccount | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) router.push("/");
    else if (!isOnboarded) router.push("/onboarding");
  }, [ready, authenticated, isOnboarded, router]);

  useEffect(() => {
    (async () => {
      const acct = await connection.getAccountInfo(new PublicKey(address));
      setEvent(acct ? decodeEvent(acct.data) : null);
    })();
  }, [address]);

  const isOrganizer = useMemo(
    () => !!(event && wallet && event.organizer.toBase58() === wallet.address),
    [event, wallet],
  );

  const handleScan = async (data: string) => {
    setScannerOpen(false);
    if (!wallet || !event) return;

    let attendee: PublicKey;
    try {
      // QR encodes either "soulpass:<base58>" or just a raw pubkey.
      const cleaned = data.startsWith("soulpass:") ? data.slice("soulpass:".length) : data;
      attendee = new PublicKey(cleaned.trim());
    } catch {
      setToast({ kind: "err", text: "That doesn't look like a SoulPass QR." });
      return;
    }

    setBusy(true);
    try {
      const ix = ixCheckIn({
        attendee,
        organizer: new PublicKey(wallet.address),
        eventAddr: new PublicKey(address),
      });
      await send({ instructions: [ix], walletAddress: wallet.address, walletProvider: wallet });
      setToast({ kind: "ok", text: `${attendee.toBase58().slice(0, 4)}…${attendee.toBase58().slice(-4)} checked in. +10 rep` });
      // Refresh event counts
      const acct = await connection.getAccountInfo(new PublicKey(address));
      setEvent(acct ? decodeEvent(acct.data) : null);
    } catch (e) {
      const msg = (e as Error).message;
      setToast({ kind: "err", text: msg.includes("AlreadyCheckedIn") ? "Already checked in." : msg });
    } finally {
      setBusy(false);
    }
  };

  if (!ready || !authenticated) return null;

  if (event && !isOrganizer) {
    return (
      <AppShell>
        <Card className="text-center py-14">
          <AlertTriangle className="mx-auto h-8 w-8 text-[var(--color-warn)]" />
          <p className="mt-3 font-display text-lg font-bold">Only the organizer can check people in.</p>
          <Link href={`/events/${address}`} className="mt-4 inline-block">
            <Button variant="secondary">
              <ArrowLeft className="h-4 w-4" />
              Back to event
            </Button>
          </Link>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <Link href={`/events/${address}`} className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to event
        </Link>
        <Pill tone="accent">
          <Sparkles className="h-3 w-3" />
          Live
        </Pill>
      </div>

      <h1 className="font-display text-3xl font-bold tracking-tight">
        {event ? event.title : "Check-in"}
      </h1>
      <p className="mt-1 text-white/60">Scan an attendee's profile QR to check them in.</p>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 flex flex-col items-center gap-4 py-12">
          <Button onClick={() => setScannerOpen(true)} loading={busy} size="lg">
            <ScanLine className="h-5 w-5" />
            Open scanner
          </Button>
          <p className="text-center text-sm text-white/50">
            Each scan mints a Proof-of-Presence on-chain in ~400ms. We pay the gas.
          </p>

          {event && (
            <div className="mt-4 grid w-full max-w-sm grid-cols-3 gap-3">
              <Stat n={event.attendeeCount} label="Reg" />
              <Stat n={event.checkedInCount} label="In" tone="accent" />
              <Stat
                n={event.attendeeCount > 0 ? Math.round((event.checkedInCount / event.attendeeCount) * 100) + "%" : "0%"}
                label="Rate"
              />
            </div>
          )}
        </Card>

        <Card>
          <span className="font-display text-xs font-bold uppercase tracking-widest text-white/50">
            Or — let attendees scan you
          </span>
          <p className="mt-2 text-sm text-white/70">
            They open SoulPass on their phone, scan this code, and they're in.
          </p>
          <div className="mt-4 flex justify-center rounded-2xl border border-[var(--color-border)] bg-white p-4">
            <QRCode value={`soulpass-event:${address}`} fg="#08090A" bg="#FFFFFF" />
          </div>
        </Card>
      </div>

      <QRScanner
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        title="Check in attendee"
        hint="Aim at the attendee's profile QR"
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            onAnimationComplete={() => setTimeout(() => setToast(null), 2400)}
            className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2"
          >
            <div
              className={
                "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold " +
                (toast.kind === "ok"
                  ? "border-[var(--color-positive)]/40 bg-[var(--color-positive)]/15 text-[var(--color-positive)]"
                  : "border-[var(--color-danger)]/40 bg-[var(--color-danger)]/15 text-[var(--color-danger)]")
              }
            >
              {toast.kind === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {toast.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}

function Stat({ n, label, tone }: { n: number | string; label: string; tone?: "accent" }) {
  return (
    <div
      className={
        "rounded-2xl border px-3 py-2.5 text-center " +
        (tone === "accent"
          ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-black"
          : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-white")
      }
    >
      <div className="font-display text-2xl font-bold tabular-nums">{n}</div>
      <div className={"text-[10px] font-bold uppercase tracking-wider " + (tone === "accent" ? "text-black/60" : "text-white/40")}>
        {label}
      </div>
    </div>
  );
}
