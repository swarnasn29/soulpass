"use client";

export const dynamic = "force-dynamic";


import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Calendar,
  Camera,
  ExternalLink,
  Loader2,
  MapPin,
  Pencil,
  Share2,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button, Card, Pill, Textarea } from "@/components/ui";
import { QRCode } from "@/components/QRCode";
import { useSoulpass } from "@/hooks/useSoulpass";
import { useApi } from "@/hooks/useApi";
import { connection, explorer } from "@/lib/solana";
import { BADGE_KIND, decodeRegistration } from "@/lib/program";
import { registrationPda } from "@/lib/pda";
import { PublicKey } from "@solana/web3.js";
import type { EventMetadata } from "@/lib/eventMetaStore";

const BADGES: Array<{
  key: keyof typeof BADGE_KIND;
  label: string;
  hint: string;
  icon: string;
}> = [
  { key: "FirstStep", label: "First Step", hint: "Attended your first event", icon: "👣" },
  { key: "Connector", label: "Connector", hint: "Hit 50% of attendees", icon: "🤝" },
  { key: "FullHouse", label: "Full House", hint: "Connected with everyone", icon: "🏠" },
  { key: "Streak3", label: "Streak 3", hint: "3 events in a row", icon: "🔥" },
  { key: "Streak10", label: "Streak 10", hint: "10 events attended", icon: "⚡" },
  { key: "Networker", label: "Networker", hint: "25+ lifetime connections", icon: "🕸️" },
  { key: "Reliable", label: "Reliable", hint: "10 attendances, zero no-shows", icon: "🛡️" },
  { key: "Organizer", label: "Organizer", hint: "Hosted your first event", icon: "👑" },
];

type Attended = EventMetadata & { checkedIn: boolean };

export default function ProfilePage() {
  const router = useRouter();
  const { ready, authenticated, isOnboarded, data, loading, refresh } = useSoulpass();
  const { apiFetch } = useApi();

  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [savingBio, setSavingBio] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarErr, setAvatarErr] = useState<string | null>(null);

  const onAvatarChange = async (file: File | null) => {
    if (!file || !data?.authority) return;
    if (!file.type.startsWith("image/")) {
      setAvatarErr("Avatar must be an image.");
      return;
    }
    setAvatarBusy(true);
    setAvatarErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "avatar");
      fd.append("owner", data.authority);
      const res = await apiFetch("/api/upload", { method: "POST", body: fd });
      const j = (await res.json()) as { url: string; arUri: string };
      await apiFetch(`/api/users/${data.authority}`, {
        method: "POST",
        body: JSON.stringify({ avatar: j.url, avatarArUri: j.arUri }),
      });
      await refresh();
    } catch (e) {
      setAvatarErr((e as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  };

  const [organized, setOrganized] = useState<EventMetadata[] | null>(null);
  const [attended, setAttended] = useState<Attended[] | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      router.push("/");
      return;
    }
    if (!loading && !isOnboarded) router.push("/onboarding");
  }, [ready, authenticated, loading, isOnboarded, router]);

  useEffect(() => {
    // Reset the editor draft whenever the saved bio changes (e.g. on first
    // load, or after a save round-trips). Direct setState in effect is the
    // intentional pattern here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBioDraft(data?.meta?.bio ?? "");
  }, [data?.meta?.bio]);

  useEffect(() => {
    if (!data?.authority) return;
    let cancelled = false;
    const authority = data.authority;

    (async () => {
      try {
        const [orgResp, allResp] = await Promise.all([
          fetch(`/api/events?organizer=${authority}&includeDrafts=1`).then((r) => r.json()),
          fetch(`/api/events`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        const orgList = (orgResp.events ?? []) as EventMetadata[];
        const allEvents = (allResp.events ?? []) as EventMetadata[];
        setOrganized(orgList);

        // Filter out events the user is organizing — for "attended" we want the
        // ones they registered for as an attendee.
        const others = allEvents.filter((e) => e.organizer !== authority);
        if (others.length === 0) {
          setAttended([]);
          return;
        }
        const me = new PublicKey(authority);
        const regPdas = others.map((e) => registrationPda(new PublicKey(e.address), me)[0]);
        // getMultipleAccountsInfo accepts up to 100 keys per call.
        const chunks: PublicKey[][] = [];
        for (let i = 0; i < regPdas.length; i += 100) chunks.push(regPdas.slice(i, i + 100));
        const infos = (
          await Promise.all(chunks.map((c) => connection.getMultipleAccountsInfo(c)))
        ).flat();

        const list: Attended[] = [];
        infos.forEach((info, idx) => {
          if (!info) return;
          const reg = decodeRegistration(info.data as Buffer);
          if (!reg) return;
          list.push({ ...others[idx], checkedIn: reg.checkedIn });
        });
        list.sort((a, b) => b.startTs - a.startTs);
        if (!cancelled) setAttended(list);
      } catch {
        if (!cancelled) {
          setOrganized((cur) => cur ?? []);
          setAttended((cur) => cur ?? []);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data?.authority]);

  const saveBio = async () => {
    if (!data?.authority) return;
    setSavingBio(true);
    try {
      await apiFetch(`/api/users/${data.authority}`, {
        method: "POST",
        body: JSON.stringify({ bio: bioDraft.slice(0, 280) }),
      });
      await refresh();
      setEditingBio(false);
    } finally {
      setSavingBio(false);
    }
  };

  if (!ready || loading || !data) {
    return (
      <AppShell>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  const rep = Number(data.onchain?.reputation ?? 500);
  const profileUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/u/${data.authority}`
      : `/u/${data.authority}`;
  const badgesEarned = data.onchain?.badgesEarned ?? 0;
  const bio = data.meta?.bio ?? "";

  return (
    <AppShell>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="relative overflow-hidden">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[auto_1fr_auto]">
            <div className="flex flex-col items-start gap-1.5">
              <label className="group relative h-28 w-28 cursor-pointer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.meta?.avatar}
                  alt=""
                  className="h-28 w-28 rounded-3xl bg-[var(--color-surface-2)] object-cover ring-2 ring-[var(--color-border)]"
                />
                <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">
                  {avatarBusy ? (
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-white">
                      <Camera className="h-5 w-5" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Change</span>
                    </div>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                  className="hidden"
                  onChange={(e) => onAvatarChange(e.target.files?.[0] ?? null)}
                  disabled={avatarBusy}
                />
              </label>
              {data.meta?.avatarArUri && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-accent)]">
                  <Sparkles className="h-3 w-3" />
                  On Arweave
                </span>
              )}
              {avatarErr && (
                <span className="text-[10px] text-[var(--color-danger)]">{avatarErr}</span>
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-3xl font-bold sm:text-4xl">
                  {data.meta?.name ?? "—"}
                </h1>
                <Pill tone="accent">
                  <Sparkles className="h-3 w-3" />
                  {rep >= 1000 ? "Top Networker" : rep >= 600 ? "Rising" : "Starter"}
                </Pill>
              </div>
              <div className="mt-1 font-mono text-xs text-white/40 break-all">{data.authority}</div>
              <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
                <Stat label="Reputation" value={rep} highlight />
                <Stat label="Events" value={data.onchain?.eventsAttended ?? 0} />
                <Stat label="Connections" value={data.onchain?.connectionsMade ?? 0} />
                <Stat label="Badges" value={badgesEarned} />
                <Stat label="No-shows" value={data.onchain?.noShows ?? 0} />
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="rounded-2xl border border-[var(--color-border)] bg-white p-3">
                <QRCode value={`soulpass-user:${data.authority}`} fg="#08090A" bg="#FFFFFF" size={140} />
              </div>
              <button
                onClick={() => navigator.clipboard?.writeText(profileUrl)}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-2)] px-3 py-1.5 text-xs text-white/60 hover:text-white"
              >
                <Share2 className="h-3 w-3" />
                Copy profile link
              </button>
              <Link
                href="/profile/matching"
                className="inline-flex items-center gap-1.5 text-xs text-[var(--color-accent)] hover:underline"
              >
                <Sparkles className="h-3 w-3" />
                Matching profile
              </Link>
              <Link
                href={explorer(data.authority)}
                target="_blank"
                className="inline-flex items-center gap-1.5 text-xs text-[var(--color-accent)] hover:underline"
              >
                On-chain
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* About / Bio */}
      <section className="mt-6">
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold uppercase tracking-widest text-white/70">
              About
            </h2>
            {!editingBio && (
              <button
                onClick={() => {
                  setBioDraft(bio);
                  setEditingBio(true);
                }}
                className="inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white"
              >
                <Pencil className="h-3 w-3" />
                {bio ? "Edit" : "Add bio"}
              </button>
            )}
          </div>

          {!editingBio ? (
            bio ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">{bio}</p>
            ) : (
              <p className="text-sm text-white/40">
                Tell people what you build, what you care about, or how to reach you.
              </p>
            )
          ) : (
            <div className="space-y-3">
              <Textarea
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value)}
                maxLength={280}
                placeholder="Builder. Coffee enthusiast. Building x at y."
                rows={3}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">{bioDraft.length}/280</span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingBio(false);
                      setBioDraft(bio);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={saveBio} loading={savingBio}>
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </section>

      {/* Badges — single row */}
      <section className="mt-10">
        <h2 className="font-display text-2xl font-bold tracking-tight">Badges</h2>
        <p className="mt-1 text-sm text-white/60">
          Soul-bound collectibles. They live with your wallet, forever.
        </p>
        <div className="-mx-1 mt-5 flex gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
          {BADGES.map((b, i) => {
            const earned = badgesEarned > i;
            return (
              <div
                key={b.key}
                className={
                  "flex w-32 shrink-0 flex-col items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center transition-colors " +
                  (earned ? "" : "opacity-40")
                }
              >
                <div className="text-3xl">{b.icon}</div>
                <div className="mt-2 font-display text-xs font-bold leading-tight">{b.label}</div>
                <div className="mt-1 text-[10px] text-white/50 leading-tight">{b.hint}</div>
                {earned && (
                  <Pill tone="accent" className="mt-2">
                    <Trophy className="h-3 w-3" />
                    Earned
                  </Pill>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Events organized */}
      <section className="mt-10">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight">Events organized</h2>
            <p className="mt-1 text-sm text-white/60">Events you&apos;ve hosted — published and drafts.</p>
          </div>
          <Link
            href="/events/new"
            className="text-xs font-semibold text-[var(--color-accent)] hover:underline"
          >
            Create new
          </Link>
        </div>
        <EventGrid
          events={organized}
          empty={
            <Empty
              title="No events yet"
              hint="Host your first event and start building your network."
              cta={{ href: "/events/new", label: "Create event" }}
            />
          }
          showStatus
        />
      </section>

      {/* Events attended */}
      <section className="mt-10">
        <h2 className="font-display text-2xl font-bold tracking-tight">Events attended</h2>
        <p className="mt-1 text-sm text-white/60">Events you&apos;ve registered for or checked into.</p>
        <EventGrid
          events={attended}
          empty={
            <Empty
              title="No events yet"
              hint="Register for an event from Discover to see it here."
              cta={{ href: "/discover", label: "Discover events" }}
            />
          }
        />
      </section>
    </AppShell>
  );
}

function EventGrid({
  events,
  empty,
  showStatus,
}: {
  events: (EventMetadata | Attended)[] | null;
  empty: React.ReactNode;
  showStatus?: boolean;
}) {
  if (events === null) {
    return (
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-2)]"
          />
        ))}
      </div>
    );
  }
  if (events.length === 0) return <div className="mt-5">{empty}</div>;
  return (
    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {events.map((e) => (
        <EventCardCompact key={e.address} event={e} showStatus={showStatus} />
      ))}
    </div>
  );
}

function EventCardCompact({
  event,
  showStatus,
}: {
  event: EventMetadata | Attended;
  showStatus?: boolean;
}) {
  const isDraft = event.status === "draft";
  const checkedIn = "checkedIn" in event && event.checkedIn;
  const href = isDraft ? "/events/new" : `/events/${event.address}`;
  return (
    <Link href={href} className="group block">
      <Card className="overflow-hidden p-0 transition-colors hover:border-[var(--color-accent)]/40">
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-[var(--color-surface-2)]">
          {event.cover ? (
            <img
              src={event.cover}
              alt=""
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="font-display text-2xl font-bold text-white/30">
                {event.title.slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}
          <div className="absolute right-3 top-3 flex gap-1.5">
            {showStatus && isDraft && <Pill tone="warn">Draft</Pill>}
            {checkedIn && <Pill tone="positive">Checked in</Pill>}
          </div>
        </div>
        <div className="p-4">
          <h3 className="line-clamp-1 font-display text-lg font-bold">{event.title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/50">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(event.startTs * 1000).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
            {event.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {event.location}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {event.capacity}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function Empty({
  title,
  hint,
  cta,
}: {
  title: string;
  hint: string;
  cta: { href: string; label: string };
}) {
  return (
    <Card className="text-center">
      <p className="font-display text-base font-semibold">{title}</p>
      <p className="mt-1 text-sm text-white/60">{hint}</p>
      <Link href={cta.href} className="mt-3 inline-block">
        <Button size="sm" variant="secondary">
          {cta.label}
        </Button>
      </Link>
    </Card>
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
