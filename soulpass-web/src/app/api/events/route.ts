import { NextRequest, NextResponse } from "next/server";
import { listEvents, upsertEvent, type EventMetadata } from "@/lib/eventMetaStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const organizer = searchParams.get("organizer") ?? undefined;
  const includeDrafts = searchParams.get("includeDrafts") === "1";
  const events = await listEvents({ organizer, includeDrafts });
  return NextResponse.json({ events });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<EventMetadata>;
  const required = ["address", "organizer", "eventId", "title", "startTs", "endTs", "capacity"] as const;
  for (const k of required) {
    if (body[k] === undefined || body[k] === null || body[k] === "") {
      return NextResponse.json({ error: `Missing field: ${k}` }, { status: 400 });
    }
  }
  const status: EventMetadata["status"] = body.status === "draft" ? "draft" : "published";
  const meta: EventMetadata = {
    address: body.address!,
    organizer: body.organizer!,
    eventId: body.eventId!,
    title: body.title!,
    description: body.description ?? "",
    cover: body.cover ?? "",
    location: body.location ?? "",
    startTs: body.startTs!,
    endTs: body.endTs!,
    capacity: body.capacity!,
    tags: Array.isArray(body.tags) ? body.tags.slice(0, 12).map((t) => String(t).trim()).filter(Boolean) : [],
    questions: Array.isArray(body.questions) ? body.questions.slice(0, 10).map((q) => String(q).trim()).filter(Boolean) : [],
    contactFields: Array.isArray(body.contactFields)
      ? Array.from(new Set(body.contactFields.map((c) => String(c).trim().toLowerCase()).filter(Boolean))).slice(0, 12)
      : [],
    minReputation:
      typeof body.minReputation === "number" && Number.isFinite(body.minReputation) && body.minReputation > 0
        ? Math.floor(body.minReputation)
        : null,
    status,
    createdAt: Date.now(),
  };
  await upsertEvent(meta);
  return NextResponse.json({ event: meta });
}
