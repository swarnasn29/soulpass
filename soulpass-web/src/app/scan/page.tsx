"use client";

export const dynamic = "force-dynamic";


import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ScanLine, AlertTriangle, Sparkles, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button, Card } from "@/components/ui";
import QRScanner from "@/components/QRScanner";
import { QRCode } from "@/components/QRCode";
import { useSoulpass } from "@/hooks/useSoulpass";
import { useGaslessTransaction } from "@/hooks/useGaslessTransaction";
import { ixRecordConnection, decodeRegistration } from "@/lib/program";
import { connection, FEE_PAYER_PUBKEY } from "@/lib/solana";
import { registrationPda } from "@/lib/pda";
import { PublicKey } from "@solana/web3.js";

type Toast = { kind: "ok" | "err"; text: string } | null;

export default function ScanPage() {
  const router = useRouter();
  const { ready, authenticated, isOnboarded, wallet, refresh, data, loading: userLoading } = useSoulpass();
  const { send } = useGaslessTransaction();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      router.push("/");
      return;
    }
    if (!userLoading && !isOnboarded) router.push("/onboarding");
  }, [ready, authenticated, userLoading, isOnboarded, router]);

  const onScan = async (data: string) => {
    setOpen(false);
    if (!wallet) return;
    setBusy(true);
    try {
      // Two QR formats supported:
      //   "soulpass-user:<authority>"
      //   "soulpass-event:<eventAddress>"
      let kind: "user" | "event";
      let value: string;
      if (data.startsWith("soulpass-user:")) {
        kind = "user";
        value = data.slice("soulpass-user:".length);
      } else if (data.startsWith("soulpass-event:")) {
        kind = "event";
        value = data.slice("soulpass-event:".length);
      } else {
        kind = "user";
        value = data;
      }
      const target = new PublicKey(value.trim());

      if (kind === "event") {
        // Bounce to the event page so attendees can register/cancel/check status.
        router.push(`/events/${target.toBase58()}`);
        return;
      }

      // User → record connection. We need a checked-in event in common.
      const me = new PublicKey(wallet.address);
      const myRegs = await connection.getProgramAccounts(
        new PublicKey(process.env.NEXT_PUBLIC_SOULPASS_PROGRAM_ID || "6oxNy4uApzwXVKAREsgxSGCSfjpCkRYFCz5aitVTkTyi"),
        {
          filters: [
            { dataSize: 91 }, // 8 + 32 + 32 + 8 + 1 + 8 + 1 + 1
            { memcmp: { offset: 8, bytes: me.toBase58() } },
          ],
        },
      );

      let event: PublicKey | null = null;
      for (const r of myRegs) {
        const decoded = decodeRegistration(r.account.data);
        if (!decoded || !decoded.checkedIn) continue;
        // Check the other party also has a checked-in registration for the same event
        const [theirReg] = registrationPda(decoded.event, target);
        const theirAcct = await connection.getAccountInfo(theirReg);
        if (theirAcct) {
          const dec = decodeRegistration(theirAcct.data);
          if (dec?.checkedIn) {
            event = decoded.event;
            break;
          }
        }
      }

      if (!event) {
        setToast({
          kind: "err",
          text: "You both need to be checked into the same event before you can connect.",
        });
        return;
      }

      const ix = ixRecordConnection({
        scanner: me,
        other: target,
        feePayer: FEE_PAYER_PUBKEY,
        eventAddr: event,
      });
      await send({ instructions: [ix], walletAddress: wallet.address, walletProvider: wallet });
      setToast({ kind: "ok", text: "Connected. +5 rep for both of you." });
      await refresh();
    } catch (e) {
      const msg = (e as Error).message;
      setToast({ kind: "err", text: msg.includes("custom program error") ? "On-chain rejection — likely already connected." : msg });
    } finally {
      setBusy(false);
    }
  };

  if (!ready || !authenticated || userLoading || !isOnboarded || !wallet) return null;

  const myQR = `soulpass-user:${wallet.address}`;

  return (
    <AppShell>
      <h1 className="font-display text-4xl font-bold tracking-tight">Connect</h1>
      <p className="mt-1 text-white/60">
        At an event? Scan someone&apos;s QR to record an on-chain handshake.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="flex flex-col items-center justify-center gap-5 py-12">
          <Button size="lg" onClick={() => setOpen(true)} loading={busy}>
            <ScanLine className="h-5 w-5" />
            Scan someone
          </Button>
          <p className="px-8 text-center text-sm text-white/50">
            We&apos;ll find an event you&apos;ve both checked into and record the connection.
            +5 rep for each of you.
          </p>
        </Card>

        <Card>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[var(--color-accent)]" />
            <span className="font-display text-xs font-bold uppercase tracking-widest text-white/60">
              Your code
            </span>
          </div>
          <div className="mt-4 flex justify-center rounded-2xl border border-[var(--color-border)] bg-white p-6">
            <QRCode value={myQR} size={220} fg="#08090A" bg="#FFFFFF" />
          </div>
          <div className="mt-4 text-center">
            <div className="font-display text-lg font-bold">{data?.meta?.name ?? "you"}</div>
            <div className="font-mono text-xs text-white/40">
              {wallet.address.slice(0, 8)}…{wallet.address.slice(-8)}
            </div>
          </div>
        </Card>
      </div>

      <QRScanner
        isOpen={open}
        onClose={() => setOpen(false)}
        onScan={onScan}
        title="Connect with someone"
        hint="Aim at their SoulPass profile QR"
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            onAnimationComplete={() => setTimeout(() => setToast(null), 2600)}
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
              {toast.kind === "ok" ? <Sparkles className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {toast.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}
