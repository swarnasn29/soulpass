import { NextRequest, NextResponse } from "next/server";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
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
import { instructionDiscriminator } from "@/lib/discriminator";
import { registrationPda } from "@/lib/pda";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ParticipantPayload = RegistrationMetadata & {
  user: UserMetadata | null;
  checkedIn?: boolean;
  checkedInAt?: number;
};

const REG_DISCRIMINATOR_B58 = bs58.encode(ACCOUNT_DISCRIMINATORS.registration);
const REGISTER_IX_DISCRIMINATOR = instructionDiscriminator("register_for_event");
// Registration layout: [8 disc][32 attendee][32 event][...] — the event pubkey
// starts at byte 40, which is what we filter on to fetch only this event's regs.
const EVENT_FIELD_OFFSET = 40;
// Per ixRegisterForEvent: keys are [reg, eventAddr, attendee, feePayer, sys].
// The attendee account sits at index 2 in the instruction's account keys.
const REGISTER_ATTENDEE_INDEX = 2;

type OnchainReg = {
  attendee: string;
  registeredAt: number; // ms
  checkedIn: boolean;
  checkedInAt: number; // ms
};

async function fetchViaProgramAccounts(eventAddress: string): Promise<OnchainReg[]> {
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
}

// Public devnet rejects getProgramAccounts. As a fallback, walk the
// signatures that touched this event PDA, find register_for_event calls,
// and verify each candidate's Registration PDA still exists. This is
// O(N) tx fetches but works on any RPC that supports the basic methods.
async function fetchViaSignatures(eventAddress: string): Promise<OnchainReg[]> {
  const eventKey = new PublicKey(eventAddress);
  const sigs = await connection.getSignaturesForAddress(
    eventKey,
    { limit: 1000 },
    "confirmed",
  );
  if (sigs.length === 0) return [];

  const txs = await Promise.all(
    sigs.map((s) =>
      connection
        .getTransaction(s.signature, {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        })
        .catch(() => null),
    ),
  );

  const programId = SOULPASS_PROGRAM_ID.toBase58();
  const candidates = new Set<string>();
  for (const tx of txs) {
    if (!tx || tx.meta?.err) continue;
    const message = tx.transaction.message;
    const keys = message.getAccountKeys
      ? message.getAccountKeys().staticAccountKeys.map((k) => k.toBase58())
      : (message as unknown as { accountKeys: PublicKey[] }).accountKeys.map((k) =>
          k.toBase58(),
        );
    const compiled =
      "compiledInstructions" in message
        ? message.compiledInstructions
        : (message as unknown as {
            instructions: Array<{
              programIdIndex: number;
              accountKeyIndexes?: number[];
              accounts?: number[];
              data: string | Uint8Array;
            }>;
          }).instructions;

    for (const ix of compiled) {
      if (keys[ix.programIdIndex] !== programId) continue;
      const data =
        typeof ix.data === "string"
          ? bs58.decode(ix.data)
          : new Uint8Array(ix.data);
      if (data.length < REGISTER_IX_DISCRIMINATOR.length) continue;
      let matches = true;
      for (let i = 0; i < REGISTER_IX_DISCRIMINATOR.length; i++) {
        if (data[i] !== REGISTER_IX_DISCRIMINATOR[i]) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;
      const idxList =
        "accountKeyIndexes" in ix && ix.accountKeyIndexes
          ? ix.accountKeyIndexes
          : (ix as { accounts?: number[] }).accounts;
      if (!idxList || idxList.length <= REGISTER_ATTENDEE_INDEX) continue;
      const attendee = keys[idxList[REGISTER_ATTENDEE_INDEX]];
      if (attendee) candidates.add(attendee);
    }
  }

  if (candidates.size === 0) return [];

  // Batch-verify each candidate's Registration PDA so we don't show
  // cancelled regs (closed PDAs return null from getAccountInfo).
  const attendees = [...candidates];
  const pdas = attendees.map(
    (a) => registrationPda(eventKey, new PublicKey(a))[0],
  );
  const infos: Array<{ data: Buffer } | null> = [];
  for (let i = 0; i < pdas.length; i += 100) {
    const chunk = pdas.slice(i, i + 100);
    const got = await connection.getMultipleAccountsInfo(chunk, "confirmed");
    for (const g of got) infos.push(g as { data: Buffer } | null);
  }

  const out: OnchainReg[] = [];
  attendees.forEach((attendee, i) => {
    const info = infos[i];
    if (!info) return;
    const dec = decodeRegistration(info.data);
    if (!dec) return;
    out.push({
      attendee,
      registeredAt: Number(dec.registeredAt) * 1000,
      checkedIn: dec.checkedIn,
      checkedInAt: Number(dec.checkedInAt) * 1000,
    });
  });
  return out;
}

async function fetchOnchainRegistrations(eventAddress: string): Promise<OnchainReg[]> {
  // Fast path: getProgramAccounts with filters. Helius/QuickNode allow it.
  try {
    return await fetchViaProgramAccounts(eventAddress);
  } catch (e) {
    console.warn(
      "[participants] getProgramAccounts failed, falling back to signatures:",
      (e as Error).message,
    );
  }
  // Fallback: works on public devnet (which rejects gpa).
  try {
    return await fetchViaSignatures(eventAddress);
  } catch (e) {
    console.warn("[participants] signatures fallback failed:", (e as Error).message);
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
