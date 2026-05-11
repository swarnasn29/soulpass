"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ChevronDown,
  Search,
  Check,
  X as XIcon,
  ScanLine,
  Users,
  Calendar,
  MapPin,
  Crown,
  Plus,
  ShieldCheck,
  Sparkles,
  Tag,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button, Input, Section, Textarea } from "@/components/ui";
import { ImageUpload, type ImageUploadValue } from "@/components/ImageUpload";
import { cn } from "@/lib/cn";
import { useSoulpass } from "@/hooks/useSoulpass";
import { useApi } from "@/hooks/useApi";
import { connection } from "@/lib/solana";
import { decodeUserProfile } from "@/lib/program";
import { userPda } from "@/lib/pda";
import { listTemplates } from "@/lib/matchTemplates";
import { PublicKey } from "@solana/web3.js";
import type {
  EventMetadata,
  RegistrationMetadata,
  RegistrationStatus,
  UserMetadata,
} from "@/lib/eventMetaStore";

type Participant = RegistrationMetadata & {
  user: UserMetadata | null;
  reputation?: number;
  checkedIn?: boolean;
  checkedInAt?: number;
};

type SortKey = "recent" | "reputation" | "name";

const TABS = ["Overview", "Hosts", "Participants", "Settings"] as const;
type Tab = (typeof TABS)[number];

function StatusPill({ status }: { status: RegistrationStatus }) {
  const map: Record<RegistrationStatus, string> = {
    pending: "bg-[var(--color-warn)]/15 text-[var(--color-warn)] border-[var(--color-warn)]/30",
    approved: "bg-[var(--color-positive)]/15 text-[var(--color-positive)] border-[var(--color-positive)]/30",
    declined: "bg-[var(--color-danger)]/15 text-[var(--color-danger)] border-[var(--color-danger)]/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold capitalize",
        map[status],
      )}
    >
      {status}
    </span>
  );
}

function ReputationBars({ value }: { value: number | undefined }) {
  const filled = value == null ? 0 : Math.max(0, Math.min(5, Math.floor(value / 200) + (value > 0 ? 1 : 0)));
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={cn(
            "h-4 w-3 rounded-[2px]",
            i < filled ? "bg-[var(--color-positive)]" : "bg-white/10",
          )}
        />
      ))}
    </div>
  );
}

function shortAddress(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function formatRegisteredAt(ts: number) {
  const d = new Date(ts);
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${d
    .toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const { ready, authenticated, isOnboarded, wallet, loading: userLoading } = useSoulpass();
  const { apiFetch } = useApi();

  const [events, setEvents] = useState<EventMetadata[] | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Participants");

  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [participantsLoading, setParticipantsLoading] = useState(false);

  const [eventMenuOpen, setEventMenuOpen] = useState(false);
  const eventMenuRef = useRef<HTMLDivElement | null>(null);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      router.push("/");
      return;
    }
    if (!userLoading && !isOnboarded) router.push("/onboarding");
  }, [ready, authenticated, userLoading, isOnboarded, router]);

  useEffect(() => {
    if (!eventMenuOpen && !sortMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (eventMenuOpen && !eventMenuRef.current?.contains(e.target as Node)) {
        setEventMenuOpen(false);
      }
      if (sortMenuOpen && !sortMenuRef.current?.contains(e.target as Node)) {
        setSortMenuOpen(false);
      }
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setEventMenuOpen(false);
        setSortMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [eventMenuOpen, sortMenuOpen]);

  // Load organizer's events
  useEffect(() => {
    if (!authenticated || !wallet) return;
    fetch(`/api/events?organizer=${wallet.address}&includeDrafts=1`)
      .then((r) => r.json())
      .then((j) => setEvents(j.events ?? []))
      .catch(() => setEvents([]));
  }, [authenticated, wallet]);

  // Auto-select event from ?event= param or first event
  useEffect(() => {
    if (selectedAddress || !events) return;
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("event");
    if (requested && events.some((e) => e.address === requested)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedAddress(requested);
    } else if (events.length > 0) {
      setSelectedAddress(events[0].address);
    }
  }, [events, selectedAddress]);

  const selectedEvent = useMemo(
    () => events?.find((e) => e.address === selectedAddress) ?? null,
    [events, selectedAddress],
  );

  const loadParticipants = useCallback(async (addr: string) => {
    setParticipantsLoading(true);
    setSelected(new Set());
    try {
      const resp = await fetch(`/api/events/${addr}/participants`).then((r) => r.json());
      const base: Participant[] = resp.participants ?? [];
      setParticipants(base);

      const enriched = await Promise.all(
        base.map(async (p) => {
          try {
            const [pda] = userPda(new PublicKey(p.attendeeAddress));
            const acct = await connection.getAccountInfo(pda);
            const profile = acct ? decodeUserProfile(acct.data) : null;
            return { ...p, reputation: profile ? Number(profile.reputation) : 0 };
          } catch {
            return { ...p, reputation: 0 };
          }
        }),
      );
      setParticipants(enriched);
    } catch {
      setParticipants([]);
    } finally {
      setParticipantsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedAddress) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setParticipants(null);
      return;
    }
    void loadParticipants(selectedAddress);
  }, [selectedAddress, loadParticipants]);

  const counts = useMemo(() => {
    const list = participants ?? [];
    return {
      approved: list.filter((p) => p.status === "approved").length,
      pending: list.filter((p) => p.status === "pending").length,
      declined: list.filter((p) => p.status === "declined").length,
      total: list.length,
    };
  }, [participants]);

  const visibleParticipants = useMemo(() => {
    if (!participants) return null;
    const term = search.trim().toLowerCase();
    let out = participants.filter((p) => {
      if (!term) return true;
      const name = p.user?.name?.toLowerCase() ?? "";
      const addr = p.attendeeAddress.toLowerCase();
      return name.includes(term) || addr.includes(term);
    });
    if (sort === "recent") {
      out = [...out].sort((a, b) => b.registeredAt - a.registeredAt);
    } else if (sort === "name") {
      out = [...out].sort((a, b) =>
        (a.user?.name ?? a.attendeeAddress).localeCompare(b.user?.name ?? b.attendeeAddress),
      );
    } else if (sort === "reputation") {
      out = [...out].sort((a, b) => (b.reputation ?? 0) - (a.reputation ?? 0));
    }
    return out;
  }, [participants, search, sort]);

  const setStatus = async (attendee: string, status: RegistrationStatus) => {
    if (!selectedAddress) return;
    setBusy(`${attendee}:${status}`);
    setErr(null);
    try {
      await apiFetch(
        `/api/events/${selectedAddress}/participants/${attendee}`,
        {
          method: "POST",
          body: JSON.stringify({ status }),
        },
      );
      setParticipants((prev) =>
        (prev ?? []).map((p) =>
          p.attendeeAddress === attendee
            ? { ...p, status, decidedAt: Date.now() }
            : p,
        ),
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const bulkSet = async (status: RegistrationStatus) => {
    if (!selectedAddress || selected.size === 0) return;
    setBusy(`bulk:${status}`);
    setErr(null);
    try {
      await Promise.all(
        Array.from(selected).map((addr) =>
          apiFetch(`/api/events/${selectedAddress}/participants/${addr}`, {
            method: "POST",
            body: JSON.stringify({ status }),
          }),
        ),
      );
      setParticipants((prev) =>
        (prev ?? []).map((p) =>
          selected.has(p.attendeeAddress)
            ? { ...p, status, decidedAt: Date.now() }
            : p,
        ),
      );
      setSelected(new Set());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const toggleAllVisible = () => {
    if (!visibleParticipants) return;
    if (selected.size === visibleParticipants.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleParticipants.map((p) => p.attendeeAddress)));
    }
  };

  const toggleOne = (addr: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(addr)) next.delete(addr);
      else next.add(addr);
      return next;
    });
  };

  if (!ready || !authenticated || userLoading || !isOnboarded) return null;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">
            Organizer Dashboard
          </h1>
          <p className="mt-2 text-white/60">
            Manage your events and view participation
          </p>
        </motion.header>

        {/* Event selector */}
        <div ref={eventMenuRef} className="relative mt-8">
          <button
            type="button"
            onClick={() => setEventMenuOpen((v) => !v)}
            disabled={!events}
            aria-haspopup="listbox"
            aria-expanded={eventMenuOpen}
            className="flex h-12 w-full items-center justify-between rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 text-sm text-white/80 transition-colors hover:border-white/20 disabled:opacity-50"
          >
            <span>
              {selectedEvent?.title ??
                (events && events.length === 0 ? "No events yet" : "Select Event")}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-white/50 transition-transform",
                eventMenuOpen && "rotate-180",
              )}
            />
          </button>
          {eventMenuOpen && events && events.length > 0 && (
            <div
              role="listbox"
              className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-72 overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-xl"
            >
              {events.map((e) => (
                <button
                  key={e.address}
                  type="button"
                  role="option"
                  aria-selected={e.address === selectedAddress}
                  onClick={() => {
                    setSelectedAddress(e.address);
                    setEventMenuOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                    e.address === selectedAddress
                      ? "bg-[var(--color-accent)]/10 text-white"
                      : "text-white/80 hover:bg-white/5",
                  )}
                >
                  <span className="flex-1">
                    <span className="block font-medium">{e.title}</span>
                    <span className="mt-0.5 block text-xs text-white/40">
                      {new Date(e.startTs * 1000).toLocaleDateString()} ·{" "}
                      {e.location || "Online"}
                      {e.status === "draft" && " · draft"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {events && events.length === 0 ? (
          <Section title="No events to manage" className="mt-8">
            <p className="text-sm text-white/60">
              You haven&apos;t created any events yet.
            </p>
            <Link href="/events/new" className="mt-4 inline-block">
              <Button>
                <Plus className="h-4 w-4" />
                Create event
              </Button>
            </Link>
          </Section>
        ) : selectedEvent ? (
          <section className="mt-8 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-6 sm:p-8">
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              {selectedEvent.title}
            </h2>

            {/* Tabs */}
            <div className="mt-6 flex gap-6 border-b border-[var(--color-border)]">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "relative pb-3 text-sm font-semibold transition-colors",
                    tab === t
                      ? "text-[var(--color-accent)]"
                      : "text-white/60 hover:text-white",
                  )}
                >
                  {t}
                  {tab === t && (
                    <span className="absolute -bottom-px left-0 right-0 h-[2px] rounded-full bg-[var(--color-accent)]" />
                  )}
                </button>
              ))}
            </div>

            <div className="mt-6">
              {tab === "Overview" && (
                <OverviewTab event={selectedEvent} counts={counts} />
              )}
              {tab === "Hosts" && (
                <HostsTab organizerAddress={selectedEvent.organizer} />
              )}
              {tab === "Settings" && (
                <SettingsTab
                  event={selectedEvent}
                  onSaved={(updated) =>
                    setEvents((prev) =>
                      (prev ?? []).map((e) => (e.address === updated.address ? updated : e)),
                    )
                  }
                />
              )}
              {tab === "Participants" && (
                <>
                  <div className="space-y-1.5 text-[15px]">
                    <p>
                      <span className="text-white/70">Approved Participants:</span>{" "}
                      <span className="font-semibold">
                        {counts.approved}/{selectedEvent.capacity}
                      </span>
                    </p>
                    <p>
                      <span className="text-white/70">Pending Approval:</span>{" "}
                      <span className="font-semibold">{counts.pending}</span>
                    </p>
                  </div>

                  <div className="my-5 h-px bg-[var(--color-border)]" />

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="sm:max-w-md sm:flex-1">
                      <Input
                        icon={Search}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search Participants"
                      />
                    </div>
                    <div ref={sortMenuRef} className="relative">
                      <button
                        type="button"
                        onClick={() => setSortMenuOpen((v) => !v)}
                        aria-haspopup="listbox"
                        aria-expanded={sortMenuOpen}
                        className="flex h-12 w-full items-center justify-between gap-3 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 text-sm text-white/80 transition-colors hover:border-white/20 sm:w-auto"
                      >
                        <span>
                          Sort By:{" "}
                          <span className="text-white">
                            {sort === "recent"
                              ? "Recent"
                              : sort === "reputation"
                                ? "Reputation"
                                : "Name"}
                          </span>
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-white/50 transition-transform",
                            sortMenuOpen && "rotate-180",
                          )}
                        />
                      </button>
                      {sortMenuOpen && (
                        <div
                          role="listbox"
                          className="absolute right-0 top-[calc(100%+6px)] z-20 w-48 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-xl"
                        >
                          {(
                            [
                              ["recent", "Recent"],
                              ["reputation", "Reputation"],
                              ["name", "Name (A-Z)"],
                            ] as const
                          ).map(([key, label]) => (
                            <button
                              key={key}
                              type="button"
                              role="option"
                              aria-selected={sort === key}
                              onClick={() => {
                                setSort(key);
                                setSortMenuOpen(false);
                              }}
                              className={cn(
                                "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors",
                                sort === key
                                  ? "bg-[var(--color-accent)]/10 text-white"
                                  : "text-white/80 hover:bg-white/5",
                              )}
                            >
                              {label}
                              {sort === key && (
                                <Check className="h-4 w-4 text-[var(--color-accent)]" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {selected.size > 0 && (
                    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm">
                      <span className="text-white/70">
                        {selected.size} selected
                      </span>
                      <div className="ml-auto flex gap-2">
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => bulkSet("declined")}
                          loading={busy === "bulk:declined"}
                          disabled={busy !== null}
                        >
                          Decline
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => bulkSet("approved")}
                          loading={busy === "bulk:approved"}
                          disabled={busy !== null}
                        >
                          Approve
                        </Button>
                      </div>
                    </div>
                  )}

                  <ParticipantsTable
                    participants={visibleParticipants}
                    loading={participantsLoading}
                    selected={selected}
                    onToggleOne={toggleOne}
                    onToggleAll={toggleAllVisible}
                    onApprove={(addr) => setStatus(addr, "approved")}
                    onDecline={(addr) => setStatus(addr, "declined")}
                    busyKey={busy}
                  />
                </>
              )}
            </div>
          </section>
        ) : (
          events && (
            <Section title="Pick an event" className="mt-8">
              <p className="text-sm text-white/60">
                Choose an event from the dropdown above to manage it.
              </p>
            </Section>
          )
        )}

        {err && (
          <p className="mt-4 rounded-2xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
            {err}
          </p>
        )}
      </div>
    </AppShell>
  );
}

function ParticipantsTable({
  participants,
  loading,
  selected,
  onToggleOne,
  onToggleAll,
  onApprove,
  onDecline,
  busyKey,
}: {
  participants: Participant[] | null;
  loading: boolean;
  selected: Set<string>;
  onToggleOne: (addr: string) => void;
  onToggleAll: () => void;
  onApprove: (addr: string) => void;
  onDecline: (addr: string) => void;
  busyKey: string | null;
}) {
  const allChecked =
    participants !== null &&
    participants.length > 0 &&
    selected.size === participants.length;

  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-xs font-semibold uppercase tracking-wider text-white/50">
            <th className="px-2 py-3 font-semibold">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={onToggleAll}
                  disabled={!participants || participants.length === 0}
                  className="h-4 w-4 cursor-pointer accent-[var(--color-accent)]"
                  aria-label="Select all guests"
                />
                <span className="text-white/70">Select All Guests</span>
              </label>
            </th>
            <th className="px-2 py-3 font-semibold">Status</th>
            <th className="px-2 py-3 font-semibold">Reputation</th>
            <th className="px-2 py-3 font-semibold">Registration Date</th>
            <th className="px-2 py-3 text-right font-semibold">Action</th>
          </tr>
        </thead>
        <tbody>
          {loading && (!participants || participants.length === 0) ? (
            <tr>
              <td colSpan={5} className="px-2 py-12 text-center text-sm text-white/40">
                Loading participants…
              </td>
            </tr>
          ) : !participants || participants.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-2 py-12 text-center text-sm text-white/40">
                No participants yet.
              </td>
            </tr>
          ) : (
            participants.map((p) => (
              <tr
                key={p.attendeeAddress}
                className="border-b border-[var(--color-border)]/60 last:border-b-0"
              >
                <td className="px-2 py-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(p.attendeeAddress)}
                      onChange={() => onToggleOne(p.attendeeAddress)}
                      className="h-4 w-4 cursor-pointer accent-[var(--color-accent)]"
                      aria-label={`Select ${p.user?.name ?? p.attendeeAddress}`}
                    />
                    <img
                      src={
                        p.user?.avatar ??
                        `https://api.dicebear.com/7.x/notionists-neutral/svg?seed=${p.attendeeAddress}&backgroundColor=B5FF1A`
                      }
                      alt=""
                      className="h-9 w-9 rounded-full bg-[var(--color-surface-2)] ring-2 ring-[var(--color-border)]"
                    />
                    <div className="leading-tight">
                      <div className="font-semibold">
                        {p.user?.name ?? shortAddress(p.attendeeAddress)}
                      </div>
                      <div className="font-mono text-[11px] text-white/40">
                        {shortAddress(p.attendeeAddress)}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusPill status={p.status} />
                    {p.checkedIn && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-positive)]/30 bg-[var(--color-positive)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-positive)]">
                        <Check className="h-3 w-3" />
                        Checked in
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-4">
                  <ReputationBars value={p.reputation} />
                </td>
                <td className="px-2 py-4 text-white/70">
                  {formatRegisteredAt(p.registeredAt)}
                </td>
                <td className="px-2 py-4">
                  <div className="flex justify-end gap-2">
                    {p.status === "pending" ? (
                      <>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => onDecline(p.attendeeAddress)}
                          loading={busyKey === `${p.attendeeAddress}:declined`}
                          disabled={busyKey !== null}
                        >
                          <XIcon className="h-3.5 w-3.5" />
                          Decline
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => onApprove(p.attendeeAddress)}
                          loading={busyKey === `${p.attendeeAddress}:approved`}
                          disabled={busyKey !== null}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Approve
                        </Button>
                      </>
                    ) : p.status === "approved" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDecline(p.attendeeAddress)}
                        loading={busyKey === `${p.attendeeAddress}:declined`}
                        disabled={busyKey !== null}
                      >
                        Revoke
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onApprove(p.attendeeAddress)}
                        loading={busyKey === `${p.attendeeAddress}:approved`}
                        disabled={busyKey !== null}
                      >
                        Restore
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function OverviewTab({
  event,
  counts,
}: {
  event: EventMetadata;
  counts: { approved: number; pending: number; declined: number; total: number };
}) {
  const start = new Date(event.startTs * 1000);
  const end = new Date(event.endTs * 1000);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Capacity" value={event.capacity} />
        <Stat label="Approved" value={`${counts.approved}/${event.capacity}`} highlight />
        <Stat label="Pending" value={counts.pending} />
        <Stat label="Declined" value={counts.declined} />
      </div>
      <div className="space-y-2 text-sm text-white/70">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-white/40" />
          {start.toLocaleString()} → {end.toLocaleString()}
        </div>
        {event.location && (
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-white/40" />
            {event.location}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-white/40" />
          {counts.total} total registrations
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <Link href={`/events/${event.address}`}>
          <Button variant="secondary" size="sm">
            View public page
          </Button>
        </Link>
        <Link href={`/events/${event.address}/check-in`}>
          <Button size="sm">
            <ScanLine className="h-4 w-4" />
            Open check-in
          </Button>
        </Link>
      </div>
    </div>
  );
}

function HostsTab({ organizerAddress }: { organizerAddress: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <Crown className="h-4 w-4 text-[var(--color-accent)]" />
        <div className="flex-1">
          <div className="text-sm font-semibold">Primary host</div>
          <div className="font-mono text-xs text-white/50">
            {shortAddress(organizerAddress)}
          </div>
        </div>
      </div>
      <p className="text-xs text-white/50">
        Invite co-hosts to help manage this event — coming soon.
      </p>
    </div>
  );
}

function SettingsTab({
  event,
  onSaved,
}: {
  event: EventMetadata;
  onSaved: (updated: EventMetadata) => void;
}) {
  const { apiFetch } = useApi();

  const [description, setDescription] = useState(event.description);
  const [location, setLocation] = useState(event.location);
  const [cover, setCover] = useState<ImageUploadValue | null>(
    event.cover ? { url: event.cover, arUri: event.coverArUri ?? "", txId: "" } : null,
  );
  const [venueImage, setVenueImage] = useState<ImageUploadValue | null>(
    event.venueImage
      ? { url: event.venueImage, arUri: event.venueImageArUri ?? "", txId: "" }
      : null,
  );
  const [tags, setTags] = useState<string[]>(event.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [questions, setQuestions] = useState<string[]>(event.questions);
  const [questionDraft, setQuestionDraft] = useState("");
  const [contactFields, setContactFields] = useState<string[]>(event.contactFields);
  const [gateRep, setGateRep] = useState<boolean>(event.minReputation != null);
  const [minRep, setMinRep] = useState<string>(
    event.minReputation != null ? String(event.minReputation) : "600",
  );
  const [matchEnabled, setMatchEnabled] = useState<boolean>(!!event.matchSchema?.enabled);
  const [matchTemplate, setMatchTemplate] = useState<string>(
    event.matchSchema?.templateId ?? "tech",
  );
  const [status, setStatus] = useState<EventMetadata["status"]>(event.status);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  // When the user switches to a different event, reset the form to that
  // event's values so we're not editing stale state.
  useEffect(() => {
    setDescription(event.description);
    setLocation(event.location);
    setCover(event.cover ? { url: event.cover, arUri: event.coverArUri ?? "", txId: "" } : null);
    setVenueImage(
      event.venueImage
        ? { url: event.venueImage, arUri: event.venueImageArUri ?? "", txId: "" }
        : null,
    );
    setTags(event.tags);
    setQuestions(event.questions);
    setContactFields(event.contactFields);
    setGateRep(event.minReputation != null);
    setMinRep(event.minReputation != null ? String(event.minReputation) : "600");
    setMatchEnabled(!!event.matchSchema?.enabled);
    setMatchTemplate(event.matchSchema?.templateId ?? "tech");
    setStatus(event.status);
    setErr(null);
    setOk(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.address]);

  const addTag = () => {
    const t = tagDraft.trim().toLowerCase().replace(/^#+/, "");
    if (!t || tags.includes(t) || tags.length >= 12) {
      setTagDraft("");
      return;
    }
    setTags([...tags, t]);
    setTagDraft("");
  };
  const addQuestion = () => {
    const q = questionDraft.trim();
    if (!q || questions.length >= 10) return;
    setQuestions([...questions, q]);
    setQuestionDraft("");
  };
  const toggleContact = (id: string) =>
    setContactFields((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const save = async () => {
    setErr(null);
    setOk(false);
    setSaving(true);
    try {
      const body: Partial<EventMetadata> = {
        address: event.address,
        description,
        location,
        cover: cover?.url ?? "",
        coverArUri: cover?.arUri || undefined,
        venueImage: venueImage?.url ?? "",
        venueImageArUri: venueImage?.arUri || undefined,
        tags,
        questions,
        contactFields,
        minReputation: gateRep
          ? Math.max(0, Math.min(100_000, parseInt(minRep || "0", 10) || 0))
          : null,
        matchSchema: {
          enabled: matchEnabled,
          templateId: matchEnabled ? matchTemplate : null,
        },
        status,
      };
      const res = await apiFetch("/api/events", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { event: EventMetadata };
      onSaved(j.event);
      setOk(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = () => setStatus((s) => (s === "published" ? "draft" : "published"));

  return (
    <div className="space-y-6">
      {/* Immutable on-chain fields — show but disable editing */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/50">
          <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-accent)]" />
          Locked on-chain
        </div>
        <p className="mt-2 text-xs text-white/50">
          Title, dates, and capacity are stored on Solana and can&apos;t be edited.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">
              Title
            </div>
            <div className="truncate">{event.title}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">
              Capacity
            </div>
            <div>{event.capacity}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">
              Starts
            </div>
            <div>{new Date(event.startTs * 1000).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">
              Ends
            </div>
            <div>{new Date(event.endTs * 1000).toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/40">
          Status
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold capitalize",
              status === "published"
                ? "border-[var(--color-positive)]/30 bg-[var(--color-positive)]/15 text-[var(--color-positive)]"
                : "border-[var(--color-warn)]/30 bg-[var(--color-warn)]/15 text-[var(--color-warn)]",
            )}
          >
            {status}
          </span>
          <Button variant="secondary" size="sm" onClick={togglePublish}>
            {status === "published" ? "Move to Draft" : "Publish"}
          </Button>
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/40">
          Description
        </div>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={480}
          rows={4}
        />
      </div>

      {/* Location */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/40">
          Location
        </div>
        <Input
          icon={MapPin}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </div>

      {/* Cover */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/40">
          Cover image
        </div>
        <ImageUpload
          value={cover}
          onChange={setCover}
          aspect="video"
          kind="event-cover"
          owner={event.organizer}
          eventAddress={event.address}
        />
      </div>

      {/* Venue image */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/40">
          Venue photo
        </div>
        <ImageUpload
          value={venueImage}
          onChange={setVenueImage}
          aspect="wide"
          kind="event-venue"
          owner={event.organizer}
          eventAddress={event.address}
        />
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/40">
          Tags
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-1 text-xs font-semibold text-[var(--color-accent)]"
              >
                #{t}
                <button
                  type="button"
                  onClick={() => setTags(tags.filter((x) => x !== t))}
                  className="rounded-full hover:bg-white/10"
                  aria-label={`Remove ${t}`}
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            icon={Tag}
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="Add a tag"
            className="flex-1"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addTag}
            disabled={!tagDraft.trim() || tags.length >= 12}
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </div>

      {/* Registration questions */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/40">
          Registration questions
        </div>
        {questions.length > 0 && (
          <ul className="space-y-2">
            {questions.map((q, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3"
              >
                <span className="mt-0.5 text-xs font-bold text-white/40">{i + 1}.</span>
                <span className="flex-1 text-sm text-white/85">{q}</span>
                <button
                  type="button"
                  onClick={() => setQuestions(questions.filter((_, idx) => idx !== i))}
                  className="text-white/40 hover:text-[var(--color-danger)]"
                  aria-label={`Remove question ${i + 1}`}
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input
            value={questionDraft}
            onChange={(e) => setQuestionDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addQuestion();
              }
            }}
            placeholder="A question to ask attendees"
            className="flex-1"
            maxLength={200}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addQuestion}
            disabled={!questionDraft.trim() || questions.length >= 10}
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </div>

      {/* Contact fields */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/40">
          Contact info to collect
        </div>
        <div className="flex flex-wrap gap-2">
          {(["email", "phone", "twitter", "telegram", "discord", "linkedin", "github", "instagram", "website"] as const).map(
            (id) => {
              const active = contactFields.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleContact(id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                    active
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-black"
                      : "border-[var(--color-border)] bg-[var(--color-surface)] text-white/80 hover:border-white/20",
                  )}
                >
                  {id}
                </button>
              );
            },
          )}
        </div>
      </div>

      {/* Min reputation gate */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/40">
          Reputation gate
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            checked={gateRep}
            onChange={(e) => setGateRep(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-[var(--color-accent)]"
          />
          Require minimum reputation to register
        </label>
        {gateRep && (
          <Input
            type="number"
            min={0}
            max={100000}
            value={minRep}
            onChange={(e) => setMinRep(e.target.value)}
            placeholder="600"
          />
        )}
      </div>

      {/* Matchmaking */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/40">
          AI matchmaking
        </div>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-white/70">
          <input
            type="checkbox"
            checked={matchEnabled}
            onChange={(e) => setMatchEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 cursor-pointer accent-[var(--color-accent)]"
          />
          <span className="flex-1">
            <span className="inline-flex items-center gap-1.5 font-semibold text-white">
              <Sparkles className="h-3.5 w-3.5 text-[var(--color-accent)]" />
              Surface perfect-match for each attendee
            </span>
          </span>
        </label>
        {matchEnabled && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {listTemplates().map((tpl) => {
              const active = matchTemplate === tpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => setMatchTemplate(tpl.id)}
                  className={cn(
                    "rounded-2xl border p-3 text-left transition-colors",
                    active
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                      : "border-[var(--color-border)] bg-[var(--color-bg)] hover:border-white/20",
                  )}
                >
                  <div className="font-display text-sm font-bold text-white">{tpl.name}</div>
                  <div className="mt-0.5 text-[11px] text-white/55">{tpl.tagline}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {err && (
        <p className="rounded-2xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
          {err}
        </p>
      )}
      {ok && !err && (
        <p className="rounded-2xl border border-[var(--color-positive)]/40 bg-[var(--color-positive)]/10 p-3 text-sm text-[var(--color-positive)]">
          Saved.
        </p>
      )}

      <div className="flex justify-end pt-2">
        <Button onClick={save} loading={saving} disabled={saving}>
          Save changes
        </Button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        highlight
          ? "border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10"
          : "border-[var(--color-border)] bg-[var(--color-surface)]",
      )}
    >
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/50">
        {label}
      </div>
      <div className="mt-1 font-display text-2xl font-bold tabular-nums leading-none">
        {value}
      </div>
    </div>
  );
}
