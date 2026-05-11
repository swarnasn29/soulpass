import { NextRequest, NextResponse } from "next/server";
import bs58 from "bs58";
import {
  getEvent,
  getRegistration,
  getUsers,
  listRegistrations,
  upsertRegistration,
  upsertRegistrations,
  type RegistrationMetadata,
  type RegistrationStatus,
  type UserMetadata,
} from "@/lib/eventMetaStore";
import { authErrorResponse, requireWallet } from "@/lib/auth";
import { connection, SOULPASS_PROGRAM_ID } from "@/lib/solana";
import { ACCOUNT_DISCRIMINATORS, decodeRegistration } from "@/lib/program";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ParticipantPayload = RegistrationMetadata & {
  user: UserMetadata | null;
  checkedIn?: boolean;
  checkedInAt?: number;
};

const REG_DISCRIMINATOR_B58 = bs58.encode(ACCOUNT_DISCRIMINATORS.registration);
// Registration layout: [8 disc][32 attendee][32 event][...] — the event pubkey
// starts at byte 40, which is what we filter on to fetch only this event's regs.
const EVENT_FIELD_OFFSET = 40;

type OnchainReg = {
  attendee: string;
  registeredAt: number; // ms
  checkedIn: boolean;
  checkedInAt: number; // ms
};

async function fetchOnchainRegistrations(eventAddress: string): Promise<OnchainReg[]> {
  try {
    const accounts = await connection.getProgramAccounts(SOULPASS_PROGRAM_ID, {
      commitment: "confirmed",
      filters: [
        { memcmp: { offset: 0, bytes: REG_DISCRIMINATOR_B58 } },
        { memcmp: { offset: EVENT_FIELD_OFFSET, bytes: eventAddress } },
      ],
    });
    const out: OnchainReg[] = [];
    for (const a of accounts) {
      const dec = decodeRegistration(a.account.data as Buffer);
      if (!dec) continue;
      out.push({
        attendee: dec.attendee.toBase58(),
        registeredAt: Number(dec.registeredAt) * 1000,
        checkedIn: dec.checkedIn,
        checkedInAt: Number(dec.checkedInAt) * 1000,
      });
    }
    return out;
  } catch (e) {
    // Public RPC may rate-limit getProgramAccounts. Fall back to off-chain
    // rows only — better partial data than a 500.
    console.warn("[participants] getProgramAccounts failed:", (e as Error).message);
    return [];
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  const event = await getEvent(address);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // On-chain Registration PDAs are the source of truth. The off-chain
  // registrations table is a mirror (with extra fields: approval status,
  // answers, contact). Some users may have registered on-chain before the
  // off-chain row was wired up; this endpoint reconciles them.
  const [onchain, offchain] = await Promise.all([
    fetchOnchainRegistrations(address),
    listRegistrations(address),
  ]);

  const offchainMap = new Map(offchain.map((r) => [r.attendeeAddress, r]));
  const defaultStatus: RegistrationStatus =
    event.minReputation == null ? "approved" : "pending";

  // Backfill missing supabase rows so the organizer dashboard stays
  // consistent and approve/decline actions have something to write to.
  const toBackfill: RegistrationMetadata[] = [];
  for (const oc of onchain) {
    if (offchainMap.has(oc.attendee)) continue;
    const reg: RegistrationMetadata = {
      eventAddress: address,
      attendeeAddress: oc.attendee,
      status: defaultStatus,
      registeredAt: oc.registeredAt || Date.now(),
    };
    offchainMap.set(oc.attendee, reg);
    toBackfill.push(reg);
  }
  if (toBackfill.length) {
    try {
      await upsertRegistrations(toBackfill);
    } catch (e) {
      console.warn("[participants] backfill failed:", (e as Error).message);
    }
  }

  // Batch-fetch user metadata for everyone we're about to return.
  const onchainKeys = new Set(onchain.map((o) => o.attendee));
  const attendeeSet = new Set<string>(onchainKeys);
  for (const r of offchain) attendeeSet.add(r.attendeeAddress);
  const users = await getUsers([...attendeeSet]);

  const checkedInMap = new Map(onchain.map((o) => [o.attendee, o]));
  const participants: ParticipantPayload[] = [];

  // Emit on-chain registrants first (these are authoritative).
  for (const oc of onchain) {
    const off = offchainMap.get(oc.attendee)!;
    participants.push({
      ...off,
      user: users.get(oc.attendee) ?? null,
      checkedIn: oc.checkedIn,
      checkedInAt: oc.checkedInAt,
    });
  }
  // Any off-chain rows without on-chain backing (e.g. cancelled registrations
  // not yet purged) — still surface them so the organizer can clean up.
  for (const off of offchain) {
    if (onchainKeys.has(off.attendeeAddress)) continue;
    const oc = checkedInMap.get(off.attendeeAddress);
    participants.push({
      ...off,
      user: users.get(off.attendeeAddress) ?? null,
      checkedIn: oc?.checkedIn ?? false,
      checkedInAt: oc?.checkedInAt,
    });
  }

  return NextResponse.json({ event, participants });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  const event = await getEvent(address);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const body = (await req.json()) as Partial<RegistrationMetadata>;
  if (!body.attendeeAddress) {
    return NextResponse.json({ error: "attendeeAddress required" }, { status: 400 });
  }

  // Caller must be the wallet they're registering — no impersonation.
  try {
    await requireWallet(req, body.attendeeAddress);
  } catch (e) {
    const resp = authErrorResponse(e);
    if (resp) return resp;
    throw e;
  }

  const existing = await getRegistration(address, body.attendeeAddress);
  const status: RegistrationStatus =
    body.status ?? existing?.status ?? (event.minReputation == null ? "approved" : "pending");
  const meta: RegistrationMetadata = {
    eventAddress: address,
    attendeeAddress: body.attendeeAddress,
    status,
    registeredAt: existing?.registeredAt ?? body.registeredAt ?? Date.now(),
    decidedAt:
      status !== (existing?.status ?? "pending")
        ? Date.now()
        : existing?.decidedAt,
    answers: body.answers ?? existing?.answers,
    contact: body.contact ?? existing?.contact,
  };
  await upsertRegistration(meta);
  return NextResponse.json({ registration: meta });
}
