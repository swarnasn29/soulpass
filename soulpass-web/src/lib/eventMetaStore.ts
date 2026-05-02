import { promises as fs } from "node:fs";
import path from "node:path";

export type EventMetadata = {
  address: string;            // Event PDA (base58), or `draft:<organizer>:<eventId>` for drafts
  organizer: string;
  eventId: string;            // Stored as decimal string (BigInt-safe)
  title: string;
  description: string;
  cover: string;              // image URL
  location: string;
  startTs: number;
  endTs: number;
  capacity: number;
  tags: string[];
  questions: string[];        // registration questions, in order
  contactFields: string[];    // contact/social ids the attendee must fill (e.g. "email", "twitter")
  minReputation: number | null; // null when no gate
  status: "draft" | "published";
  createdAt: number;
};

export type UserMetadata = {
  authority: string;
  name: string;
  avatar: string;
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
    };
  } catch {
    cache = { events: {}, users: {}, registrations: {} };
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
