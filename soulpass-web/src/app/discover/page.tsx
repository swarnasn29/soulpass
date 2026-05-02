"use client";

export const dynamic = "force-dynamic";


import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Calendar, MapPin, Users, Sparkles, Plus, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button, Card, Pill, Input } from "@/components/ui";
import { useSoulpass } from "@/hooks/useSoulpass";
import type { EventMetadata } from "@/lib/eventMetaStore";

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DiscoverPage() {
  const router = useRouter();
  const { ready, authenticated, isOnboarded, loading: userLoading, data } = useSoulpass();
  const [events, setEvents] = useState<EventMetadata[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      router.push("/");
      return;
    }
    if (!userLoading && !isOnboarded) {
      router.push("/onboarding");
      return;
    }
  }, [ready, authenticated, userLoading, isOnboarded, router]);

  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((j) => setEvents(j.events ?? []))
      .catch(() => setEvents([]));
  }, []);

  const filtered = useMemo(() => {
    if (!events) return null;
    const q = query.trim().toLowerCase().replace(/^#+/, "");
    if (!q) return events;
    return events.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        (e.tags ?? []).some((t) => t.toLowerCase().includes(q)),
    );
  }, [events, query]);

  if (!ready || !authenticated || userLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-white/60">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
      </div>
    );
  }

  const reputation = Number(data?.onchain?.reputation ?? 500);

  return (
    <AppShell>
      {/* Hero rep card */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 gap-4 md:grid-cols-3"
      >
        <Card className="md:col-span-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-display text-xs font-bold uppercase tracking-widest text-white/50">
                Your rep
              </span>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="font-display text-6xl font-bold text-[var(--color-accent)] tabular-nums">
                  {reputation}
                </span>
                <span className="text-sm text-white/60">
                  {reputation > 500 ? `+${reputation - 500} since launch` : "starter"}
                </span>
              </div>
            </div>
            <Pill tone="accent">
              <Sparkles className="h-3 w-3" />
              {reputation >= 1000 ? "Top Networker" : reputation >= 600 ? "Rising" : "Starter"}
            </Pill>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-2">
            <Mini label="Events" value={data?.onchain?.eventsAttended ?? 0} />
            <Mini label="Connections" value={data?.onchain?.connectionsMade ?? 0} />
            <Mini label="Badges" value={data?.onchain?.badgesEarned ?? 0} />
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <div>
            <span className="font-display text-xs font-bold uppercase tracking-widest text-white/50">
              Host an event
            </span>
            <p className="mt-2 text-sm text-white/70">
              Approve attendees by reputation. Watch no-shows drop to single digits.
            </p>
          </div>
          <Link href="/events/new" className="mt-4">
            <Button className="w-full">
              <Plus className="h-4 w-4" />
              Create event
            </Button>
          </Link>
        </Card>
      </motion.section>

      <section className="mt-10">
        <div className="mb-5 flex items-end justify-between gap-4">
          <h2 className="font-display text-3xl font-bold tracking-tight">Discover</h2>
          <div className="w-full max-w-xs">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search events, places…"
              className="h-10"
            />
          </div>
        </div>

        {filtered === null ? (
          <SkeletonGrid />
        ) : filtered.length === 0 ? (
          <Empty />
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((e) => (
              <EventCard key={e.address} event={e} />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function Mini({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">{label}</div>
      <div className="font-display text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function EventCard({ event }: { event: EventMetadata }) {
  return (
    <Link href={`/events/${event.address}`} className="group block">
      <Card className="overflow-hidden p-0 transition-colors hover:border-[var(--color-accent)]/40">
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-[var(--color-surface-2)]">
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
          <div className="absolute right-3 top-3">
            <Pill tone="accent">+10 rep</Pill>
          </div>
        </div>
        <div className="p-5">
          <h3 className="line-clamp-1 font-display text-xl font-bold">{event.title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/50">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(event.startTs)}
            </span>
            {event.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {event.location}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {event.capacity} seats
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="p-0">
          <div className="aspect-[16/10] animate-pulse bg-[var(--color-surface-2)] rounded-t-3xl" />
          <div className="p-5">
            <div className="h-5 w-3/4 rounded bg-[var(--color-surface-2)] animate-pulse" />
            <div className="mt-3 h-3 w-1/2 rounded bg-[var(--color-surface-2)] animate-pulse" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function Empty() {
  return (
    <Card className="text-center py-14">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
        <Search className="h-5 w-5" />
      </div>
      <p className="font-display text-lg font-semibold">No events yet</p>
      <p className="mt-1 text-sm text-white/60">Be the first to host one for your community.</p>
      <Link href="/events/new" className="mt-5 inline-block">
        <Button>
          <Plus className="h-4 w-4" />
          Create the first event
        </Button>
      </Link>
    </Card>
  );
}
