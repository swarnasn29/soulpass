import { NextRequest, NextResponse } from "next/server";
import { listEvents, upsertEvent, type EventMetadata } from "@/lib/eventMetaStore";
import { MATCH_TEMPLATES } from "@/lib/matchTemplates";
import { uploadJson } from "@/lib/arweave";
import { authErrorResponse, requireWallet } from "@/lib/auth";

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

  // Caller must be the organizer of the event they're creating/updating.
  try {
    await requireWallet(req, body.organizer!);
  } catch (e) {
    const resp = authErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
  const status: EventMetadata["status"] = body.status === "draft" ? "draft" : "published";
  const meta: EventMetadata = {
    address: body.address!,
    organizer: body.organizer!,
    eventId: body.eventId!,
    title: body.title!,
    description: body.description ?? "",
    cover: body.cover ?? "",
    coverArUri: body.coverArUri ?? undefined,
    venueImage: body.venueImage ?? "",
    venueImageArUri: body.venueImageArUri ?? undefined,
    metadataUri: body.metadataUri ?? undefined,
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
    matchSchema: (() => {
      const m = body.matchSchema;
      if (!m || !m.enabled) return { enabled: false, templateId: null };
      const tplId = typeof m.templateId === "string" && m.templateId in MATCH_TEMPLATES ? m.templateId : null;
      return { enabled: !!tplId, templateId: tplId };
    })(),
    status,
    createdAt: Date.now(),
  };

  // Pin canonical metadata JSON to Arweave on publish (skip drafts).
  // Failure here doesn't block publish — we still keep the off-chain copy.
  if (status === "published" && !meta.metadataUri) {
    try {
      const snapshot = {
        schema: "soulpass.event.v1",
        address: meta.address,
        organizer: meta.organizer,
        eventId: meta.eventId,
        title: meta.title,
        description: meta.description,
        cover: meta.cover,
        coverArUri: meta.coverArUri,
        venueImage: meta.venueImage,
        venueImageArUri: meta.venueImageArUri,
        location: meta.location,
        startTs: meta.startTs,
        endTs: meta.endTs,
        capacity: meta.capacity,
        tags: meta.tags,
        questions: meta.questions,
        contactFields: meta.contactFields,
        minReputation: meta.minReputation,
        matchSchema: meta.matchSchema,
        createdAt: meta.createdAt,
      };
      const result = await uploadJson(snapshot, [
        { name: "Kind", value: "event-metadata" },
        { name: "Owner", value: meta.organizer },
        { name: "Event", value: meta.address },
      ]);
      meta.metadataUri = result.arUri;
    } catch (e) {
      console.warn("[events] failed to pin metadata to Arweave:", (e as Error).message);
    }
  }

  await upsertEvent(meta);
  return NextResponse.json({ event: meta });
}
