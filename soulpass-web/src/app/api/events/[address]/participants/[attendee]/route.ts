import { NextRequest, NextResponse } from "next/server";
import {
  getEvent,
  getRegistration,
  upsertRegistration,
  type RegistrationStatus,
} from "@/lib/eventMetaStore";
import { ForbiddenError, UnauthorizedError, requireWallet } from "@/lib/auth";

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
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: "Auth check failed" }, { status: 500 });
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
