import { promises as fs } from "node:fs";
import path from "node:path";

export type MatchSchemaConfig = {
  enabled: boolean;
  templateId: string | null; // one of MATCH_TEMPLATES keys when enabled
};

export type EventMetadata = {
  address: string;            // Event PDA (base58), or `draft:<organizer>:<eventId>` for drafts
  organizer: string;
  eventId: string;            // Stored as decimal string (BigInt-safe)
  title: string;
  description: string;
  cover: string;              // gateway URL of the event cover image (Arweave-pinned when uploaded)
  coverArUri?: string;        // ar://<txId> — durable reference for the cover
  venueImage?: string;        // gateway URL of the venue / room photo
  venueImageArUri?: string;   // ar://<txId> for venue image
  metadataUri?: string;       // ar://<txId> of the full metadata JSON (matches on-chain Event.metadataUri)
  location: string;
  startTs: number;
  endTs: number;
  capacity: number;
  tags: string[];
  questions: string[];        // registration questions, in order
  contactFields: string[];    // contact/social ids the attendee must fill (e.g. "email", "twitter")
  minReputation: number | null; // null when no gate
  matchSchema?: MatchSchemaConfig;
  status: "draft" | "published";
  createdAt: number;
};

// Persistent trait values for matchmaking. Keyed by wallet authority + traitKey.
// Values use the same union as TraitValue in matchEngine, but stored as plain JSON.
export type StoredTraitValue = string | string[] | number | [number, number];

export type UserTraitEntry = {
  value: StoredTraitValue;
  source: "user" | "previous_event" | "reputation_bucket" | "badge_mix" | "bio_keywords";
  updatedAt: number;
};

export type UserTraits = Record<string, UserTraitEntry>; // traitKey -> entry

export type UserMetadata = {
  authority: string;
  name: string;
  avatar: string;          // gateway URL (Arweave-pinned when uploaded)
  avatarArUri?: string;    // ar://<txId> — durable reference
  email?: string;
  bio?: string;
  createdAt: number;
};

export type RegistrationStatus = "pending" | "approved" | "declined";

export type RegistrationMetadata = {
  eventAddress: string;
  attendeeAddress: string;
  status: RegistrationStatus;
  registeredAt: number;
  decidedAt?: number;
  answers?: Record<string, string>;
  contact?: Record<string, string>;
};

function regKey(eventAddress: string, attendeeAddress: string) {
  return `${eventAddress}::${attendeeAddress}`;
}

type Store = {
  events: Record<string, EventMetadata>;
  users: Record<string, UserMetadata>;
  registrations: Record<string, RegistrationMetadata>;
  traits: Record<string, UserTraits>; // wallet authority -> traits
};

const STORE_FILE = path.join(process.cwd(), ".soulpass-store.json");

let cache: Store | null = null;

async function readStore(): Promise<Store> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(STORE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Store>;
    cache = {
      events: parsed.events ?? {},
      users: parsed.users ?? {},
      registrations: parsed.registrations ?? {},
      traits: parsed.traits ?? {},
    };
  } catch {
    cache = { events: {}, users: {}, registrations: {}, traits: {} };
  }
  return cache!;
}

async function writeStore(s: Store) {
  cache = s;
  await fs.writeFile(STORE_FILE, JSON.stringify(s, null, 2), "utf-8");
}

export async function listEvents(opts?: { includeDrafts?: boolean; organizer?: string }): Promise<EventMetadata[]> {
  const s = await readStore();
  let events = Object.values(s.events);
  if (!opts?.includeDrafts) {
    events = events.filter((e) => e.status !== "draft");
  }
  if (opts?.organizer) {
    events = events.filter((e) => e.organizer === opts.organizer);
  }
  return events.sort((a, b) => a.startTs - b.startTs);
}

export async function getEvent(address: string): Promise<EventMetadata | null> {
  const s = await readStore();
  return s.events[address] ?? null;
}

export async function upsertEvent(meta: EventMetadata): Promise<void> {
  const s = await readStore();
  s.events[meta.address] = meta;
  await writeStore(s);
}

export async function getUser(authority: string): Promise<UserMetadata | null> {
  const s = await readStore();
  return s.users[authority] ?? null;
}

export async function upsertUser(meta: UserMetadata): Promise<void> {
  const s = await readStore();
  s.users[meta.authority] = meta;
  await writeStore(s);
}

export async function listRegistrations(eventAddress: string): Promise<RegistrationMetadata[]> {
  const s = await readStore();
  return Object.values(s.registrations)
    .filter((r) => r.eventAddress === eventAddress)
    .sort((a, b) => b.registeredAt - a.registeredAt);
}

export async function getRegistration(
  eventAddress: string,
  attendeeAddress: string,
): Promise<RegistrationMetadata | null> {
  const s = await readStore();
  return s.registrations[regKey(eventAddress, attendeeAddress)] ?? null;
}

export async function upsertRegistration(meta: RegistrationMetadata): Promise<void> {
  const s = await readStore();
  s.registrations[regKey(meta.eventAddress, meta.attendeeAddress)] = meta;
  await writeStore(s);
}

export async function getUserTraits(authority: string): Promise<UserTraits> {
  const s = await readStore();
  return s.traits[authority] ?? {};
}

export async function setUserTraits(
  authority: string,
  patch: Record<string, { value: StoredTraitValue; source: UserTraitEntry["source"] }>,
): Promise<UserTraits> {
  const s = await readStore();
  const current = s.traits[authority] ?? {};
  const now = Date.now();
  for (const [k, v] of Object.entries(patch)) {
    current[k] = { value: v.value, source: v.source, updatedAt: now };
  }
  s.traits[authority] = current;
  await writeStore(s);
  return current;
}

export async function listAllTraits(authorities: string[]): Promise<Record<string, UserTraits>> {
  const s = await readStore();
  const out: Record<string, UserTraits> = {};
  for (const a of authorities) out[a] = s.traits[a] ?? {};
  return out;
}
