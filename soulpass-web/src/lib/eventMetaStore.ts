import "server-only";
import { getSupabase } from "./supabase";

export type MatchSchemaConfig = {
  enabled: boolean;
  templateId: string | null;
};

export type EventMetadata = {
  address: string;
  organizer: string;
  eventId: string;
  title: string;
  description: string;
  cover: string;
  coverArUri?: string;
  venueImage?: string;
  venueImageArUri?: string;
  metadataUri?: string;
  location: string;
  startTs: number;
  endTs: number;
  capacity: number;
  tags: string[];
  questions: string[];
  contactFields: string[];
  minReputation: number | null;
  matchSchema?: MatchSchemaConfig;
  status: "draft" | "published";
  createdAt: number;
};

export type StoredTraitValue = string | string[] | number | [number, number];

export type UserTraitEntry = {
  value: StoredTraitValue;
  source: "user" | "previous_event" | "reputation_bucket" | "badge_mix" | "bio_keywords";
  updatedAt: number;
};

export type UserTraits = Record<string, UserTraitEntry>;

export type UserMetadata = {
  authority: string;
  name: string;
  avatar: string;
  avatarArUri?: string;
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

// --- snake_case ↔ camelCase mappers ---------------------------------------

type EventRow = {
  address: string;
  organizer: string;
  event_id: string;
  title: string;
  description: string;
  cover: string;
  cover_ar_uri: string | null;
  venue_image: string;
  venue_image_ar_uri: string | null;
  metadata_uri: string | null;
  location: string;
  start_ts: number;
  end_ts: number;
  capacity: number;
  tags: string[];
  questions: string[];
  contact_fields: string[];
  min_reputation: number | null;
  match_schema: MatchSchemaConfig | null;
  status: "draft" | "published";
  created_at: number;
};

function rowToEvent(r: EventRow): EventMetadata {
  return {
    address: r.address,
    organizer: r.organizer,
    eventId: r.event_id,
    title: r.title,
    description: r.description,
    cover: r.cover,
    coverArUri: r.cover_ar_uri ?? undefined,
    venueImage: r.venue_image,
    venueImageArUri: r.venue_image_ar_uri ?? undefined,
    metadataUri: r.metadata_uri ?? undefined,
    location: r.location,
    startTs: Number(r.start_ts),
    endTs: Number(r.end_ts),
    capacity: r.capacity,
    tags: r.tags ?? [],
    questions: r.questions ?? [],
    contactFields: r.contact_fields ?? [],
    minReputation: r.min_reputation,
    matchSchema: r.match_schema ?? undefined,
    status: r.status,
    createdAt: Number(r.created_at),
  };
}

function eventToRow(e: EventMetadata): EventRow {
  return {
    address: e.address,
    organizer: e.organizer,
    event_id: e.eventId,
    title: e.title,
    description: e.description,
    cover: e.cover,
    cover_ar_uri: e.coverArUri ?? null,
    venue_image: e.venueImage ?? "",
    venue_image_ar_uri: e.venueImageArUri ?? null,
    metadata_uri: e.metadataUri ?? null,
    location: e.location,
    start_ts: e.startTs,
    end_ts: e.endTs,
    capacity: e.capacity,
    tags: e.tags,
    questions: e.questions,
    contact_fields: e.contactFields,
    min_reputation: e.minReputation,
    match_schema: e.matchSchema ?? null,
    status: e.status,
    created_at: e.createdAt,
  };
}

type UserRow = {
  authority: string;
  name: string;
  avatar: string;
  avatar_ar_uri: string | null;
  email: string | null;
  bio: string | null;
  created_at: number;
};

function rowToUser(r: UserRow): UserMetadata {
  return {
    authority: r.authority,
    name: r.name,
    avatar: r.avatar,
    avatarArUri: r.avatar_ar_uri ?? undefined,
    email: r.email ?? undefined,
    bio: r.bio ?? undefined,
    createdAt: Number(r.created_at),
  };
}

type RegRow = {
  event_address: string;
  attendee_address: string;
  status: RegistrationStatus;
  registered_at: number;
  decided_at: number | null;
  answers: Record<string, string> | null;
  contact: Record<string, string> | null;
};

function rowToReg(r: RegRow): RegistrationMetadata {
  return {
    eventAddress: r.event_address,
    attendeeAddress: r.attendee_address,
    status: r.status,
    registeredAt: Number(r.registered_at),
    decidedAt: r.decided_at != null ? Number(r.decided_at) : undefined,
    answers: r.answers ?? undefined,
    contact: r.contact ?? undefined,
  };
}

// --- Events ---------------------------------------------------------------

export async function listEvents(opts?: {
  includeDrafts?: boolean;
  organizer?: string;
}): Promise<EventMetadata[]> {
  const sb = getSupabase();
  let q = sb.from("events").select("*").order("start_ts", { ascending: true });
  if (!opts?.includeDrafts) q = q.eq("status", "published");
  if (opts?.organizer) q = q.eq("organizer", opts.organizer);
  const { data, error } = await q;
  if (error) throw new Error(`listEvents: ${error.message}`);
  return (data ?? []).map((r) => rowToEvent(r as EventRow));
}

export async function getEvent(address: string): Promise<EventMetadata | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from("events").select("*").eq("address", address).maybeSingle();
  if (error) throw new Error(`getEvent: ${error.message}`);
  return data ? rowToEvent(data as EventRow) : null;
}

export async function upsertEvent(meta: EventMetadata): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("events").upsert(eventToRow(meta), { onConflict: "address" });
  if (error) throw new Error(`upsertEvent: ${error.message}`);
}

// --- Users ----------------------------------------------------------------

export async function getUser(authority: string): Promise<UserMetadata | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from("users").select("*").eq("authority", authority).maybeSingle();
  if (error) throw new Error(`getUser: ${error.message}`);
  return data ? rowToUser(data as UserRow) : null;
}

export async function getUsers(authorities: string[]): Promise<Map<string, UserMetadata>> {
  if (authorities.length === 0) return new Map();
  const sb = getSupabase();
  const { data, error } = await sb.from("users").select("*").in("authority", authorities);
  if (error) throw new Error(`getUsers: ${error.message}`);
  const map = new Map<string, UserMetadata>();
  for (const row of data ?? []) map.set((row as UserRow).authority, rowToUser(row as UserRow));
  return map;
}

export async function upsertRegistrations(metas: RegistrationMetadata[]): Promise<void> {
  if (metas.length === 0) return;
  const sb = getSupabase();
  const rows: RegRow[] = metas.map((m) => ({
    event_address: m.eventAddress,
    attendee_address: m.attendeeAddress,
    status: m.status,
    registered_at: m.registeredAt,
    decided_at: m.decidedAt ?? null,
    answers: m.answers ?? null,
    contact: m.contact ?? null,
  }));
  const { error } = await sb
    .from("registrations")
    .upsert(rows, { onConflict: "event_address,attendee_address" });
  if (error) throw new Error(`upsertRegistrations: ${error.message}`);
}

export async function upsertUser(meta: UserMetadata): Promise<void> {
  const sb = getSupabase();
  const row: UserRow = {
    authority: meta.authority,
    name: meta.name,
    avatar: meta.avatar,
    avatar_ar_uri: meta.avatarArUri ?? null,
    email: meta.email ?? null,
    bio: meta.bio ?? null,
    created_at: meta.createdAt,
  };
  const { error } = await sb.from("users").upsert(row, { onConflict: "authority" });
  if (error) throw new Error(`upsertUser: ${error.message}`);
}

// --- Registrations --------------------------------------------------------

export async function listRegistrations(eventAddress: string): Promise<RegistrationMetadata[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("registrations")
    .select("*")
    .eq("event_address", eventAddress)
    .order("registered_at", { ascending: false });
  if (error) throw new Error(`listRegistrations: ${error.message}`);
  return (data ?? []).map((r) => rowToReg(r as RegRow));
}

export async function getRegistration(
  eventAddress: string,
  attendeeAddress: string,
): Promise<RegistrationMetadata | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("registrations")
    .select("*")
    .eq("event_address", eventAddress)
    .eq("attendee_address", attendeeAddress)
    .maybeSingle();
  if (error) throw new Error(`getRegistration: ${error.message}`);
  return data ? rowToReg(data as RegRow) : null;
}

export async function upsertRegistration(meta: RegistrationMetadata): Promise<void> {
  const sb = getSupabase();
  const row: RegRow = {
    event_address: meta.eventAddress,
    attendee_address: meta.attendeeAddress,
    status: meta.status,
    registered_at: meta.registeredAt,
    decided_at: meta.decidedAt ?? null,
    answers: meta.answers ?? null,
    contact: meta.contact ?? null,
  };
  const { error } = await sb
    .from("registrations")
    .upsert(row, { onConflict: "event_address,attendee_address" });
  if (error) throw new Error(`upsertRegistration: ${error.message}`);
}

// --- Traits ---------------------------------------------------------------

export async function getUserTraits(authority: string): Promise<UserTraits> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("user_traits")
    .select("data")
    .eq("authority", authority)
    .maybeSingle();
  if (error) throw new Error(`getUserTraits: ${error.message}`);
  return (data?.data as UserTraits) ?? {};
}

export async function setUserTraits(
  authority: string,
  patch: Record<string, { value: StoredTraitValue; source: UserTraitEntry["source"] }>,
): Promise<UserTraits> {
  const sb = getSupabase();
  const current = await getUserTraits(authority);
  const now = Date.now();
  for (const [k, v] of Object.entries(patch)) {
    current[k] = { value: v.value, source: v.source, updatedAt: now };
  }
  const { error } = await sb
    .from("user_traits")
    .upsert({ authority, data: current, updated_at: now }, { onConflict: "authority" });
  if (error) throw new Error(`setUserTraits: ${error.message}`);
  return current;
}

export async function listAllTraits(authorities: string[]): Promise<Record<string, UserTraits>> {
  const sb = getSupabase();
  if (authorities.length === 0) return {};
  const { data, error } = await sb
    .from("user_traits")
    .select("authority, data")
    .in("authority", authorities);
  if (error) throw new Error(`listAllTraits: ${error.message}`);
  const out: Record<string, UserTraits> = {};
  for (const a of authorities) out[a] = {};
  for (const row of data ?? []) {
    out[(row as { authority: string }).authority] = (row as { data: UserTraits }).data ?? {};
  }
  return out;
}
