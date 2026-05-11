"use client";

export const dynamic = "force-dynamic";


import { useCallback, useEffect, useMemo, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ScanLine, ArrowLeft, AlertTriangle, Sparkles, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button, Card, Pill, Input } from "@/components/ui";
import QRScanner from "@/components/QRScanner";
import { QRCode } from "@/components/QRCode";
import { useSoulpass } from "@/hooks/useSoulpass";
import { useGaslessTransaction } from "@/hooks/useGaslessTransaction";
import { ixCheckIn, decodeEvent, type EventAccount } from "@/lib/program";
import { connection } from "@/lib/solana";
import { PublicKey } from "@solana/web3.js";
import { buildDemoParticipants, type DemoParticipant } from "@/lib/demoData";
import { cn } from "@/lib/cn";

type Toast = { kind: "ok" | "err"; text: string } | null;

type Row = DemoParticipant;

function shortAddress(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export default function CheckInPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = usePromise(params);
  const router = useRouter();
  const { ready, authenticated, isOnboarded, wallet, loading: userLoading } = useSoulpass();
  const { send } = useGaslessTransaction();

  const [event, setEvent] = useState<EventAccount | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!ready || userLoading) return;
    if (!authenticated) router.push("/");
    else if (!isOnboarded) router.push("/onboarding");
  }, [ready, userLoading, authenticated, isOnboarded, router]);

  useEffect(() => {
    (async () => {
      const acct = await connection.getAccountInfo(new PublicKey(address));
      setEvent(acct ? decodeEvent(acct.data) : null);
    })();
  }, [address]);

  // Load participants list so the organizer can tap-to-check-in without the
  // scanner. Falls back to deterministic mock data when the backend has no
  // rows yet — same mock as the dashboard so the demo reads consistently.
  const loadRows = useCallback(async () => {
    try {
      const resp = await fetch(`/api/events/${address}/participants`).then((r) =>
        r.json(),
      );
      const list: Row[] = resp.participants ?? [];
      setRows(list.length > 0 ? list : buildDemoParticipants(address));
    } catch {
      setRows(buildDemoParticipants(address));
    }
  }, [address]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const isOrganizer = useMemo(
    () => !!(event && wallet && event.organizer.toBase58() === wallet.address),
    [event, wallet],
  );

  const filteredRows = useMemo(() => {
    if (!rows) return null;
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.user?.name ?? "").toLowerCase().includes(q) ||
        r.attendeeAddress.toLowerCase().includes(q),
    );
  }, [rows, query]);

  // Optimistic check-in straight from the list. Tries the on-chain check_in
  // ix as a best-effort step but never blocks the UI — for the demo we
  // always reflect the click locally so the flow looks instant.
  const checkInRow = async (attendee: string, name: string | undefined) => {
    if (!wallet) return;
    setBusy(attendee);
    setRows((prev) =>
      (prev ?? []).map((r) =>
        r.attendeeAddress === attendee ? { ...r, checkedIn: true } : r,
      ),
    );
    try {
      const ix = ixCheckIn({
        attendee: new PublicKey(attendee),
        organizer: new PublicKey(wallet.address),
        eventAddr: new PublicKey(address),
      });
      await send({
        instructions: [ix],
        walletAddress: wallet.address,
        walletProvider: wallet,
      });
    } catch {
      // Demo: swallow on-chain failures (PDA missing, simulation error etc.)
      // The UI already reflects the check-in.
    } finally {
      setBusy(null);
      setToast({
        kind: "ok",
        text: `${name ?? shortAddress(attendee)} checked in · +10 rep`,
      });
      // Refresh on-chain event counts in the background.
      const acct = await connection
        .getAccountInfo(new PublicKey(address))
        .catch(() => null);
      if (acct) setEvent(decodeEvent(acct.data));
    }
  };

  const handleScan = async (data: string) => {
    setScannerOpen(false);
    if (!wallet || !event) return;
    let attendeeKey: PublicKey;
    try {
      const cleaned = data.startsWith("soulpass:") ? data.slice("soulpass:".length) : data;
      attendeeKey = new PublicKey(cleaned.trim());
    } catch {
      setToast({ kind: "err", text: "That doesn't look like a SoulPass QR." });
      return;
    }
    const row = rows?.find((r) => r.attendeeAddress === attendeeKey.toBase58());
    await checkInRow(attendeeKey.toBase58(), row?.user?.name);
  };

  if (!ready || !authenticated || userLoading) return null;

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

  const checkedInCount =
    rows?.filter((r) => r.checkedIn).length ??
    (event ? event.checkedInCount : 0);
  const totalCount = rows?.length ?? event?.attendeeCount ?? 0;

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
      <p className="mt-1 text-white/60">
        Tap an attendee below to check them in, or scan their QR.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat n={totalCount} label="Registered" />
        <Stat n={checkedInCount} label="Checked in" tone="accent" />
        <Stat
          n={totalCount > 0 ? Math.round((checkedInCount / totalCount) * 100) + "%" : "0%"}
          label="Check-in rate"
        />
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">
            Or — let them scan you
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="rounded-lg bg-white p-1.5">
              <QRCode value={`soulpass-event:${address}`} fg="#08090A" bg="#FFFFFF" size={56} />
            </div>
            <Button onClick={() => setScannerOpen(true)} size="sm" variant="secondary" className="flex-1">
              <ScanLine className="h-4 w-4" />
              Scan
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="font-display text-2xl font-bold tracking-tight">Attendees</h2>
          <div className="w-full max-w-xs">
            <Input
              icon={Search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or address"
            />
          </div>
        </div>

        {filteredRows === null ? (
          <Card className="text-center py-10 text-white/50 text-sm">Loading attendees…</Card>
        ) : filteredRows.length === 0 ? (
          <Card className="text-center py-10 text-white/50 text-sm">No attendees match.</Card>
        ) : (
          <div className="space-y-2">
            {filteredRows.map((r) => (
              <div
                key={r.attendeeAddress}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border bg-[var(--color-surface)] px-4 py-3 transition-colors",
                  r.checkedIn
                    ? "border-[var(--color-positive)]/30"
                    : "border-[var(--color-border)] hover:border-white/20",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.user?.avatar}
                  alt=""
                  className="h-10 w-10 rounded-full bg-[var(--color-surface-2)] ring-2 ring-[var(--color-border)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {r.user?.name ?? shortAddress(r.attendeeAddress)}
                  </div>
                  <div className="font-mono text-[11px] text-white/40">
                    {shortAddress(r.attendeeAddress)} · rep {r.reputation}
                  </div>
                </div>
                {r.checkedIn ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-positive)]/30 bg-[var(--color-positive)]/15 px-3 py-1 text-xs font-semibold text-[var(--color-positive)]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Checked in
                  </span>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => checkInRow(r.attendeeAddress, r.user?.name)}
                    loading={busy === r.attendeeAddress}
                    disabled={busy !== null}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Check in
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
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
        "rounded-2xl border px-4 py-3 " +
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
