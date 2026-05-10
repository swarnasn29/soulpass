"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useRef,
  useState,
  KeyboardEvent,
  SVGProps,
} from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Star,
  X,
  Plus,
  ShieldCheck,
  Mail,
  Send as TelegramIcon,
  MessageCircle,
  Globe,
  Phone,
  AtSign,
  ChevronDown,
  Tag,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button, Input, Textarea, Section } from "@/components/ui";
import { ImageUpload, type ImageUploadValue } from "@/components/ImageUpload";
import { cn } from "@/lib/cn";
import { useSoulpass } from "@/hooks/useSoulpass";
import { useGaslessTransaction } from "@/hooks/useGaslessTransaction";
import { ixCreateEvent } from "@/lib/program";
import { FEE_PAYER_PUBKEY } from "@/lib/solana";
import { PublicKey } from "@solana/web3.js";
import { listTemplates } from "@/lib/matchTemplates";

function BrandSvg({ children, ...rest }: SVGProps<SVGSVGElement> & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...rest}>
      {children}
    </svg>
  );
}
const Twitter = (props: SVGProps<SVGSVGElement>) => (
  <BrandSvg {...props}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
  </BrandSvg>
);
const Github = (props: SVGProps<SVGSVGElement>) => (
  <BrandSvg {...props}>
    <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.16c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.34.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.71 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.44-2.7 5.41-5.27 5.7.41.35.78 1.05.78 2.12v3.14c0 .31.21.67.8.55C20.22 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
  </BrandSvg>
);
const Linkedin = (props: SVGProps<SVGSVGElement>) => (
  <BrandSvg {...props}>
    <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0Z" />
  </BrandSvg>
);
const Instagram = (props: SVGProps<SVGSVGElement>) => (
  <BrandSvg
    {...props}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </BrandSvg>
);

type ContactOption = {
  id: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
};
const CONTACT_OPTIONS: ContactOption[] = [
  { id: "email", label: "Email", Icon: Mail },
  { id: "phone", label: "Phone", Icon: Phone },
  { id: "twitter", label: "Twitter / X", Icon: Twitter },
  { id: "telegram", label: "Telegram", Icon: TelegramIcon },
  { id: "discord", label: "Discord", Icon: MessageCircle },
  { id: "linkedin", label: "LinkedIn", Icon: Linkedin },
  { id: "github", label: "GitHub", Icon: Github },
  { id: "instagram", label: "Instagram", Icon: Instagram },
  { id: "website", label: "Website", Icon: Globe },
];

function nowPlusHours(h: number) {
  const d = new Date(Date.now() + h * 3600 * 1000);
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

export default function NewEventPage() {
  const router = useRouter();
  const { ready, authenticated, isOnboarded, wallet, loading: userLoading } = useSoulpass();
  const { send } = useGaslessTransaction();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [cover, setCover] = useState<ImageUploadValue | null>(null);
  const [venueImage, setVenueImage] = useState<ImageUploadValue | null>(null);
  const [startAt, setStartAt] = useState(nowPlusHours(24));
  const [endAt, setEndAt] = useState(nowPlusHours(28));
  const [capacity, setCapacity] = useState("50");

  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");

  const [questions, setQuestions] = useState<string[]>([]);
  const [questionDraft, setQuestionDraft] = useState("");

  const [contactFields, setContactFields] = useState<string[]>([]);
  const [contactMenuOpen, setContactMenuOpen] = useState(false);
  const contactMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!contactMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!contactMenuRef.current?.contains(e.target as Node)) {
        setContactMenuOpen(false);
      }
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setContactMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [contactMenuOpen]);

  const [gateReputation, setGateReputation] = useState(false);
  const [minReputation, setMinReputation] = useState("600");

  const [matchmakingEnabled, setMatchmakingEnabled] = useState(false);
  const [matchTemplateId, setMatchTemplateId] = useState<string>("tech");

  const [submitting, setSubmitting] = useState<null | "publish" | "draft">(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      router.push("/");
      return;
    }
    if (!userLoading && !isOnboarded) router.push("/onboarding");
  }, [ready, authenticated, userLoading, isOnboarded, router]);

  const addTag = () => {
    const t = tagDraft.trim().toLowerCase().replace(/^#+/, "");
    if (!t) return;
    if (tags.includes(t)) {
      setTagDraft("");
      return;
    }
    if (tags.length >= 12) return;
    setTags([...tags, t]);
    setTagDraft("");
  };
  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));
  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && !tagDraft && tags.length) {
      setTags(tags.slice(0, -1));
    }
  };

  const addQuestion = () => {
    const q = questionDraft.trim();
    if (!q) return;
    if (questions.length >= 10) return;
    setQuestions([...questions, q]);
    setQuestionDraft("");
  };
  const removeQuestion = (i: number) =>
    setQuestions(questions.filter((_, idx) => idx !== i));

  const buildPayload = (eventId: bigint, address: string, status: "draft" | "published") => {
    const startTs = BigInt(Math.floor(new Date(startAt).getTime() / 1000));
    const endTs = BigInt(Math.floor(new Date(endAt).getTime() / 1000));
    const cap = Math.max(1, Math.min(100_000, parseInt(capacity || "50", 10)));
    const minRep = gateReputation
      ? Math.max(0, Math.min(100_000, parseInt(minReputation || "0", 10) || 0))
      : null;
    return {
      address,
      organizer: wallet!.address,
      eventId: eventId.toString(),
      title: title.trim(),
      description: description.trim(),
      cover: cover?.url ?? "",
      coverArUri: cover?.arUri,
      venueImage: venueImage?.url ?? "",
      venueImageArUri: venueImage?.arUri,
      location: location.trim(),
      startTs: Number(startTs),
      endTs: Number(endTs),
      capacity: cap,
      tags,
      questions,
      contactFields,
      minReputation: minRep,
      matchSchema: {
        enabled: matchmakingEnabled,
        templateId: matchmakingEnabled ? matchTemplateId : null,
      },
      status,
    };
  };

  const toggleContact = (id: string) => {
    setContactFields((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const validate = (requireDates: boolean) => {
    if (!title.trim()) throw new Error("Title is required.");
    if (requireDates) {
      const startTs = Math.floor(new Date(startAt).getTime() / 1000);
      const endTs = Math.floor(new Date(endAt).getTime() / 1000);
      if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) {
        throw new Error("Start and end times are required.");
      }
      if (endTs <= startTs) throw new Error("End must be after start.");
    }
    if (gateReputation) {
      const n = parseInt(minReputation || "0", 10);
      if (!Number.isFinite(n) || n < 0) throw new Error("Minimum reputation must be a positive number.");
    }
  };

  const publish = async () => {
    if (!wallet) return;
    setErr(null);
    setSubmitting("publish");
    try {
      validate(true);
      const organizer = new PublicKey(wallet.address);
      const eventId = BigInt(Date.now());
      const startTs = BigInt(Math.floor(new Date(startAt).getTime() / 1000));
      const endTs = BigInt(Math.floor(new Date(endAt).getTime() / 1000));
      const cap = Math.max(1, Math.min(100_000, parseInt(capacity || "50", 10)));

      // Pre-pin canonical event metadata to Arweave so the on-chain Event.metadataUri
      // points at a permanent, gateway-agnostic ar:// reference. Best-effort — falls
      // back to empty string so a transient Arweave failure never blocks publishing.
      let metadataUri = "";
      try {
        const prepRes = await fetch("/api/events/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizer: wallet.address,
            eventId: eventId.toString(),
            title: title.trim(),
            description: description.trim(),
            cover: cover?.url ?? "",
            coverArUri: cover?.arUri,
            venueImage: venueImage?.url ?? "",
            venueImageArUri: venueImage?.arUri,
            location: location.trim(),
            startTs: Number(startTs),
            endTs: Number(endTs),
            capacity: cap,
            tags,
            questions,
            contactFields,
            minReputation: gateReputation
              ? Math.max(0, Math.min(100_000, parseInt(minReputation || "0", 10) || 0))
              : null,
            matchSchema: {
              enabled: matchmakingEnabled,
              templateId: matchmakingEnabled ? matchTemplateId : null,
            },
          }),
        });
        if (prepRes.ok) {
          const prep = (await prepRes.json()) as { arUri?: string };
          if (prep.arUri) metadataUri = prep.arUri;
        }
      } catch {
        // Non-fatal — we still publish; /api/events will retry the pin.
      }

      const { eventAddr, instruction } = ixCreateEvent({
        organizer,
        feePayer: FEE_PAYER_PUBKEY,
        eventId,
        title: title.slice(0, 80),
        description: description.slice(0, 480),
        metadataUri: metadataUri.slice(0, 200),
        startTs,
        endTs,
        capacity: cap,
      });

      await send({
        instructions: [instruction],
        walletAddress: wallet.address,
        walletProvider: wallet,
      });

      const payload = buildPayload(eventId, eventAddr.toBase58(), "published");
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, metadataUri: metadataUri || undefined }),
      });

      router.push(`/events/${eventAddr.toBase58()}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(null);
    }
  };

  const saveDraft = async () => {
    if (!wallet) return;
    setErr(null);
    setSubmitting("draft");
    try {
      validate(false);
      const eventId = BigInt(Date.now());
      const address = `draft:${wallet.address}:${eventId.toString()}`;
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(eventId, address, "draft")),
      });
      if (!res.ok) throw new Error("Failed to save draft.");
      router.push("/profile");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(null);
    }
  };

  if (!ready || !authenticated || userLoading || !isOnboarded) {
    return null;
  }

  const ActionButtons = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Button
        variant="secondary"
        onClick={saveDraft}
        loading={submitting === "draft"}
        disabled={submitting !== null}
      >
        Save as Draft
      </Button>
      <Button
        onClick={publish}
        loading={submitting === "publish"}
        disabled={submitting !== null}
      >
        Publish Event
      </Button>
    </div>
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between"
        >
          <div>
            <h1 className="font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">
              Create Event
            </h1>
            <p className="mt-2 text-white/60">
              Bring the community together with your event
            </p>
          </div>
          <div className="sm:flex-shrink-0">{ActionButtons}</div>
        </motion.header>

        <div className="mt-8 space-y-6">
          {/* Basic Information */}
          <Section title="Basic Information">
            <div className="space-y-4">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                placeholder="Event Title"
                autoFocus
              />
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={480}
                placeholder="Description"
                rows={5}
              />
              <ImageUpload
                value={cover}
                onChange={setCover}
                label="Cover image"
                aspect="video"
                kind="event-cover"
                owner={wallet?.address}
                hint="Hero image shown on the event page and in shares. Pinned permanently to Arweave."
              />
            </div>
          </Section>

          {/* Date & Location */}
          <Section title="Date & Location">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  icon={Calendar}
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  aria-label="Starts"
                />
                <Input
                  icon={Clock}
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  aria-label="Ends"
                />
              </div>
              <Input
                icon={MapPin}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Location"
              />
              <ImageUpload
                value={venueImage}
                onChange={setVenueImage}
                label="Venue photo (optional)"
                aspect="wide"
                kind="event-venue"
                owner={wallet?.address}
                hint="Help attendees recognize the room — entrance, stage, lobby. Stored permanently on Arweave."
              />
            </div>
          </Section>

          {/* Capacity & Requirements */}
          <Section title="Capacity & Requirements">
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  icon={Users}
                  type="number"
                  min={1}
                  max={100000}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="Maximum Capacity"
                />
                <Input
                  icon={Star}
                  type="number"
                  min={0}
                  max={100000}
                  value={gateReputation ? minReputation : ""}
                  onChange={(e) => {
                    setMinReputation(e.target.value);
                    if (!gateReputation && e.target.value) setGateReputation(true);
                  }}
                  placeholder="Minimum Reputation"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2.5 pl-1 pt-1">
                <input
                  type="checkbox"
                  checked={gateReputation}
                  onChange={(e) => setGateReputation(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-[var(--color-accent)]"
                />
                <span className="flex items-center gap-2 text-xs text-white/60">
                  <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                  Gate registration by minimum reputation
                </span>
              </label>
            </div>
          </Section>

          {/* Tags */}
          <Section title="Tags">
            <div className="space-y-3">
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
                        onClick={() => removeTag(t)}
                        className="rounded-full hover:bg-white/10"
                        aria-label={`Remove ${t}`}
                      >
                        <X className="h-3 w-3" />
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
                  onKeyDown={onTagKey}
                  placeholder="Tags"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addTag}
                  disabled={!tagDraft.trim() || tags.length >= 12}
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
              <p className="text-xs text-white/40">
                Press Enter or comma to add. Up to 12 tags.
              </p>
            </div>
          </Section>

          {/* Registration questions */}
          <Section title="Registration Questions">
            <div className="space-y-3">
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
                        onClick={() => removeQuestion(i)}
                        className="text-white/40 hover:text-[var(--color-danger)]"
                        aria-label={`Remove question ${i + 1}`}
                      >
                        <X className="h-4 w-4" />
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
                  placeholder="What are you hoping to ship this weekend?"
                  className="flex-1"
                  maxLength={200}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addQuestion}
                  disabled={!questionDraft.trim() || questions.length >= 10}
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
              <p className="text-xs text-white/40">
                Optional. Attendees answer these when they register. Up to 10.
              </p>
            </div>
          </Section>

          {/* Contact info to collect */}
          <Section title="Contact Info to Collect">
            <div className="space-y-3">
              {contactFields.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {contactFields.map((id) => {
                    const opt = CONTACT_OPTIONS.find((o) => o.id === id);
                    if (!opt) return null;
                    const Icon = opt.Icon;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-1 text-xs font-semibold text-[var(--color-accent)]"
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {opt.label}
                        <button
                          type="button"
                          onClick={() => toggleContact(id)}
                          className="rounded-full hover:bg-white/10"
                          aria-label={`Remove ${opt.label}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              <div ref={contactMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setContactMenuOpen((v) => !v)}
                  aria-haspopup="listbox"
                  aria-expanded={contactMenuOpen}
                  className="flex h-12 w-full items-center justify-between rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-4 text-sm text-white/80 transition-colors hover:border-white/20"
                >
                  <span className="flex items-center gap-2.5">
                    <AtSign className="h-4 w-4 text-white/40" />
                    {contactFields.length === 0
                      ? "Add contact fields"
                      : `${contactFields.length} selected`}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-white/50 transition-transform",
                      contactMenuOpen && "rotate-180",
                    )}
                  />
                </button>
                {contactMenuOpen && (
                  <div
                    role="listbox"
                    className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-72 overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-xl"
                  >
                    {CONTACT_OPTIONS.map(({ id, label, Icon }) => {
                      const active = contactFields.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => toggleContact(id)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                            active
                              ? "bg-[var(--color-accent)]/10 text-white"
                              : "text-white/80 hover:bg-white/5",
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-4 w-4",
                              active ? "text-[var(--color-accent)]" : "text-white/50",
                            )}
                          />
                          <span className="flex-1">{label}</span>
                          <span
                            className={cn(
                              "inline-flex h-4 w-4 items-center justify-center rounded-full border",
                              active
                                ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-black"
                                : "border-white/20",
                            )}
                            aria-hidden
                          >
                            {active && (
                              <span className="text-[10px] font-bold leading-none">✓</span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <p className="text-xs text-white/40">
                Selected fields are required at registration.
              </p>
            </div>
          </Section>

          {/* AI matchmaking */}
          <Section title="AI Matchmaking">
            <div className="space-y-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={matchmakingEnabled}
                  onChange={(e) => setMatchmakingEnabled(e.target.checked)}
                  className="mt-1 h-4 w-4 cursor-pointer accent-[var(--color-accent)]"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[var(--color-accent)]" />
                    <span className="text-sm font-semibold text-white">
                      Surface a perfect-match for each attendee in real time
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-white/50">
                    During the event, every checked-in attendee sees their best next person to meet,
                    based on reputation, badges, and the questions you choose below.
                  </p>
                </div>
              </label>

              {matchmakingEnabled && (
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-white/50">
                    Pick a template
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {listTemplates().map((tpl) => {
                      const active = matchTemplateId === tpl.id;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => setMatchTemplateId(tpl.id)}
                          className={cn(
                            "rounded-2xl border p-4 text-left transition-colors",
                            active
                              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                              : "border-[var(--color-border)] bg-[var(--color-bg)] hover:border-white/20",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-display text-base font-bold text-white">
                              {tpl.name}
                            </div>
                            {active && (
                              <span className="rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black">
                                Selected
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-white/55">{tpl.tagline}</p>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {tpl.dimensions.slice(0, 4).map((d) => (
                              <span
                                key={d.traitKey}
                                className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/60"
                              >
                                {d.label}
                              </span>
                            ))}
                            {tpl.dimensions.length > 4 && (
                              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/40">
                                +{tpl.dimensions.length - 4}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-white/40">
                    Attendees will be asked a few short questions when they register — anything we
                    already know from their profile is filled in automatically.
                  </p>
                </div>
              )}
            </div>
          </Section>

          {err && (
            <p className="rounded-2xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
              {err}
            </p>
          )}

          <div className="flex justify-end pt-2">{ActionButtons}</div>
        </div>
      </div>
    </AppShell>
  );
}
