import { NextRequest, NextResponse } from "next/server";
import { uploadJson } from "@/lib/arweave";
import { authErrorResponse, requireWallet } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pre-pins event metadata JSON to Arweave so the resulting ar:// URI can be
// embedded in the on-chain Event.metadataUri at create_event time.
// This is the standard Solana NFT/SPL pattern: on-chain references off-chain JSON.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const organizer = typeof body.organizer === "string" ? body.organizer : "";
  if (!organizer) {
    return NextResponse.json({ error: "Missing organizer" }, { status: 400 });
  }

  try {
    await requireWallet(req, organizer);
  } catch (e) {
    const resp = authErrorResponse(e);
    if (resp) return resp;
    throw e;
  }

  try {
    const result = await uploadJson(
      { schema: "soulpass.event.v1", ...body, pinnedAt: Date.now() },
      [
        { name: "Kind", value: "event-metadata" },
        { name: "Owner", value: organizer.slice(0, 64) },
      ],
    );
    return NextResponse.json(result);
  } catch (e) {
    // Don't leak internals: arweave / fee-payer errors can mention paths or amounts.
    const msg = (e as Error).message ?? "Pin failed";
    const safe = /insufficient|not enough/i.test(msg)
      ? "Storage funding insufficient. Try again later."
      : "Failed to pin metadata";
    return NextResponse.json({ error: safe }, { status: 500 });
  }
}
