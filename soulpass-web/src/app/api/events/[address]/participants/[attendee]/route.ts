import { NextRequest, NextResponse } from "next/server";
import {
  getEvent,
  getRegistration,
  upsertRegistration,
  type RegistrationStatus,
} from "@/lib/eventMetaStore";
import { authErrorResponse, requireWallet } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED: RegistrationStatus[] = ["pending", "approved", "declined"];

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ address: string; attendee: string }> },
) {
  const { address, attendee } = await ctx.params;

  const event = await getEvent(address);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Only the event organizer can approve/decline registrations.
  try {
    await requireWallet(req, event.organizer);
  } catch (e) {
    const resp = authErrorResponse(e);
    if (resp) return resp;
    throw e;
  }

  const body = (await req.json()) as { status?: RegistrationStatus };
  if (!body.status || !ALLOWED.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const existing = await getRegistration(address, attendee);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const next = { ...existing, status: body.status, decidedAt: Date.now() };
  await upsertRegistration(next);
  return NextResponse.json({ registration: next });
}
