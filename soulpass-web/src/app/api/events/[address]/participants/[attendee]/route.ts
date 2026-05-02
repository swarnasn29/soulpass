import { NextRequest, NextResponse } from "next/server";
import {
  getRegistration,
  upsertRegistration,
  type RegistrationStatus,
} from "@/lib/eventMetaStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED: RegistrationStatus[] = ["pending", "approved", "declined"];

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ address: string; attendee: string }> },
) {
  const { address, attendee } = await ctx.params;
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
