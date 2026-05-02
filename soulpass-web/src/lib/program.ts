import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { instructionDiscriminator, accountDiscriminator } from "./discriminator";
import { Writer, Reader } from "./borsh";
import {
  userPda,
  eventPda,
  registrationPda,
  connectionPda,
  ratingPda,
  lifetimeBadgePda,
} from "./pda";
import { SOULPASS_PROGRAM_ID } from "./solana";

// ---------- Badge enum (must match program order) ----------
export const BADGE_KIND = {
  FirstStep: 0,
  Connector: 1,
  FullHouse: 2,
  Streak3: 3,
  Streak10: 4,
  Networker: 5,
  Reliable: 6,
  Organizer: 7,
} as const;
export type BadgeKindKey = keyof typeof BADGE_KIND;

// ---------- builders ----------

function ix(
  name: string,
  keys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>,
  args: Uint8Array,
) {
  const w = new Writer();
  w.bytes(instructionDiscriminator(name));
  w.bytes(args);
  return new TransactionInstruction({
    programId: SOULPASS_PROGRAM_ID,
    keys,
    data: Buffer.from(w.out()),
  });
}

export function ixInitializeUser(
  authority: PublicKey,
  feePayer: PublicKey,
  name: string,
  metadataUri: string,
) {
  const [profile] = userPda(authority);
  const args = new Writer();
  args.string(name);
  args.string(metadataUri);
  return ix(
    "initialize_user",
    [
      { pubkey: profile, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: feePayer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    args.out(),
  );
}

export function ixUpdateProfile(
  authority: PublicKey,
  name: string | null,
  metadataUri: string | null,
) {
  const [profile] = userPda(authority);
  const args = new Writer();
  args.optionString(name);
  args.optionString(metadataUri);
  return ix(
    "update_user_profile",
    [
      { pubkey: profile, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    args.out(),
  );
}

export function ixCreateEvent(params: {
  organizer: PublicKey;
  feePayer: PublicKey;
  eventId: bigint;
  title: string;
  description: string;
  metadataUri: string;
  startTs: bigint;
  endTs: bigint;
  capacity: number;
}) {
  const [eventAddr] = eventPda(params.organizer, params.eventId);
  const args = new Writer();
  args.u64(params.eventId);
  args.string(params.title);
  args.string(params.description);
  args.string(params.metadataUri);
  args.i64(params.startTs);
  args.i64(params.endTs);
  args.u32(params.capacity);
  return {
    eventAddr,
    instruction: ix(
      "create_event",
      [
        { pubkey: eventAddr, isSigner: false, isWritable: true },
        { pubkey: params.organizer, isSigner: true, isWritable: false },
        { pubkey: params.feePayer, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      args.out(),
    ),
  };
}

export function ixRegisterForEvent(params: {
  attendee: PublicKey;
  feePayer: PublicKey;
  eventAddr: PublicKey;
}) {
  const [reg] = registrationPda(params.eventAddr, params.attendee);
  return ix(
    "register_for_event",
    [
      { pubkey: reg, isSigner: false, isWritable: true },
      { pubkey: params.eventAddr, isSigner: false, isWritable: true },
      { pubkey: params.attendee, isSigner: true, isWritable: false },
      { pubkey: params.feePayer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    new Uint8Array(),
  );
}

export function ixCancelRegistration(params: {
  attendee: PublicKey;
  feePayer: PublicKey;
  eventAddr: PublicKey;
}) {
  const [reg] = registrationPda(params.eventAddr, params.attendee);
  return ix(
    "cancel_registration",
    [
      { pubkey: reg, isSigner: false, isWritable: true },
      { pubkey: params.eventAddr, isSigner: false, isWritable: true },
      { pubkey: params.attendee, isSigner: true, isWritable: false },
      { pubkey: params.feePayer, isSigner: true, isWritable: true },
    ],
    new Uint8Array(),
  );
}

export function ixCheckIn(params: {
  attendee: PublicKey;
  organizer: PublicKey;
  eventAddr: PublicKey;
}) {
  const [reg] = registrationPda(params.eventAddr, params.attendee);
  const [profile] = userPda(params.attendee);
  return ix(
    "check_in",
    [
      { pubkey: reg, isSigner: false, isWritable: true },
      { pubkey: params.eventAddr, isSigner: false, isWritable: true },
      { pubkey: profile, isSigner: false, isWritable: true },
      { pubkey: params.attendee, isSigner: false, isWritable: false },
      { pubkey: params.organizer, isSigner: true, isWritable: false },
    ],
    new Uint8Array(),
  );
}

export function ixRecordConnection(params: {
  scanner: PublicKey;
  other: PublicKey;
  feePayer: PublicKey;
  eventAddr: PublicKey;
}) {
  const { pda, lo, hi } = connectionPda(params.eventAddr, params.scanner, params.other);
  const [regLo] = registrationPda(params.eventAddr, lo);
  const [regHi] = registrationPda(params.eventAddr, hi);
  const [profileLo] = userPda(lo);
  const [profileHi] = userPda(hi);
  return ix(
    "record_connection",
    [
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: params.eventAddr, isSigner: false, isWritable: true },
      { pubkey: regLo, isSigner: false, isWritable: false },
      { pubkey: regHi, isSigner: false, isWritable: false },
      { pubkey: profileLo, isSigner: false, isWritable: true },
      { pubkey: profileHi, isSigner: false, isWritable: true },
      { pubkey: lo, isSigner: false, isWritable: false },
      { pubkey: hi, isSigner: false, isWritable: false },
      { pubkey: params.scanner, isSigner: true, isWritable: false },
      { pubkey: params.feePayer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    new Uint8Array(),
  );
}

export function ixSubmitRating(params: {
  rater: PublicKey;
  ratee: PublicKey;
  feePayer: PublicKey;
  eventAddr: PublicKey;
  helpfulness: number;
  knowledge: number;
  vibe: number;
  reliability: number;
}) {
  const [rating] = ratingPda(params.eventAddr, params.rater, params.ratee);
  const [regRater] = registrationPda(params.eventAddr, params.rater);
  const [regRatee] = registrationPda(params.eventAddr, params.ratee);
  const [profileRatee] = userPda(params.ratee);
  const args = new Writer();
  args.u8(params.helpfulness);
  args.u8(params.knowledge);
  args.u8(params.vibe);
  args.u8(params.reliability);
  return ix(
    "submit_rating",
    [
      { pubkey: rating, isSigner: false, isWritable: true },
      { pubkey: params.eventAddr, isSigner: false, isWritable: false },
      { pubkey: regRater, isSigner: false, isWritable: false },
      { pubkey: regRatee, isSigner: false, isWritable: false },
      { pubkey: profileRatee, isSigner: false, isWritable: true },
      { pubkey: params.rater, isSigner: true, isWritable: false },
      { pubkey: params.ratee, isSigner: false, isWritable: false },
      { pubkey: params.feePayer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    args.out(),
  );
}

export function ixAwardLifetimeBadge(params: {
  owner: PublicKey;
  authority: PublicKey;
  feePayer: PublicKey;
  kind: number;
}) {
  const [badge] = lifetimeBadgePda(params.owner, params.kind);
  const [profile] = userPda(params.owner);
  const args = new Writer();
  args.u8(params.kind);
  return ix(
    "award_lifetime_badge",
    [
      { pubkey: badge, isSigner: false, isWritable: true },
      { pubkey: profile, isSigner: false, isWritable: true },
      { pubkey: params.owner, isSigner: false, isWritable: false },
      { pubkey: params.authority, isSigner: true, isWritable: false },
      { pubkey: params.feePayer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    args.out(),
  );
}

// ---------- decoders ----------

const USER_DISC = accountDiscriminator("UserProfile");
const EVENT_DISC = accountDiscriminator("Event");
const REG_DISC = accountDiscriminator("Registration");
const BADGE_DISC = accountDiscriminator("Badge");

function discMatches(buf: Buffer, disc: Uint8Array) {
  for (let i = 0; i < 8; i++) if (buf[i] !== disc[i]) return false;
  return true;
}

export type UserProfile = {
  authority: PublicKey;
  name: string;
  metadataUri: string;
  reputation: bigint;
  eventsAttended: number;
  connectionsMade: number;
  badgesEarned: number;
  noShows: number;
  createdAt: bigint;
  bump: number;
};

export function decodeUserProfile(data: Buffer): UserProfile | null {
  if (!discMatches(data, USER_DISC)) return null;
  const r = new Reader(data);
  r.off = 8;
  const authority = new PublicKey(r.pubkey());
  const name = r.string();
  const metadataUri = r.string();
  const reputation = r.i64();
  const eventsAttended = r.u32();
  const connectionsMade = r.u32();
  const badgesEarned = r.u32();
  const noShows = r.u32();
  const createdAt = r.i64();
  const bump = r.u8();
  return { authority, name, metadataUri, reputation, eventsAttended, connectionsMade, badgesEarned, noShows, createdAt, bump };
}

export type EventStatus = "Draft" | "Open" | "Closed";

export type EventAccount = {
  organizer: PublicKey;
  eventId: bigint;
  title: string;
  description: string;
  metadataUri: string;
  startTs: bigint;
  endTs: bigint;
  capacity: number;
  attendeeCount: number;
  checkedInCount: number;
  connectionCount: number;
  status: EventStatus;
  bump: number;
};

const EVENT_STATUS: EventStatus[] = ["Draft", "Open", "Closed"];

export function decodeEvent(data: Buffer): EventAccount | null {
  if (!discMatches(data, EVENT_DISC)) return null;
  const r = new Reader(data);
  r.off = 8;
  const organizer = new PublicKey(r.pubkey());
  const eventId = r.u64();
  const title = r.string();
  const description = r.string();
  const metadataUri = r.string();
  const startTs = r.i64();
  const endTs = r.i64();
  const capacity = r.u32();
  const attendeeCount = r.u32();
  const checkedInCount = r.u32();
  const connectionCount = r.u32();
  const status = EVENT_STATUS[r.u8()] ?? "Draft";
  const bump = r.u8();
  return { organizer, eventId, title, description, metadataUri, startTs, endTs, capacity, attendeeCount, checkedInCount, connectionCount, status, bump };
}

export type RegistrationAccount = {
  attendee: PublicKey;
  event: PublicKey;
  registeredAt: bigint;
  checkedIn: boolean;
  checkedInAt: bigint;
  noShowProcessed: boolean;
  bump: number;
};

export function decodeRegistration(data: Buffer): RegistrationAccount | null {
  if (!discMatches(data, REG_DISC)) return null;
  const r = new Reader(data);
  r.off = 8;
  const attendee = new PublicKey(r.pubkey());
  const event = new PublicKey(r.pubkey());
  const registeredAt = r.i64();
  const checkedIn = r.bool();
  const checkedInAt = r.i64();
  const noShowProcessed = r.bool();
  const bump = r.u8();
  return { attendee, event, registeredAt, checkedIn, checkedInAt, noShowProcessed, bump };
}

export type BadgeAccount = {
  owner: PublicKey;
  kind: number;
  event: PublicKey;
  earnedAt: bigint;
  bump: number;
};

export function decodeBadge(data: Buffer): BadgeAccount | null {
  if (!discMatches(data, BADGE_DISC)) return null;
  const r = new Reader(data);
  r.off = 8;
  const owner = new PublicKey(r.pubkey());
  const kind = r.u8();
  const event = new PublicKey(r.pubkey());
  const earnedAt = r.i64();
  const bump = r.u8();
  return { owner, kind, event, earnedAt, bump };
}

export const ACCOUNT_DISCRIMINATORS = {
  user: USER_DISC,
  event: EVENT_DISC,
  registration: REG_DISC,
  badge: BADGE_DISC,
};
