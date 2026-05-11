import { NextRequest, NextResponse } from "next/server";
import {
  getEvent,
  getRegistration,
  getUser,
  listRegistrations,
  upsertRegistration,
  type RegistrationMetadata,
  type RegistrationStatus,
  type UserMetadata,
} from "@/lib/eventMetaStore";
import { ForbiddenError, UnauthorizedError, requireWallet } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ParticipantPayload = RegistrationMetadata & { user: UserMetadata | null };

export async function GET(_req: NextRequest, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  const event = await getEvent(address);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const regs = await listRegistrations(address);
  const participants: ParticipantPayload[] = await Promise.all(
    regs.map(async (r) => ({ ...r, user: await getUser(r.attendeeAddress) })),
  );
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
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: "Auth check failed" }, { status: 500 });
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
