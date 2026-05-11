import { NextRequest, NextResponse } from "next/server";
import { getEvent, listEvents, upsertEvent, type EventMetadata } from "@/lib/eventMetaStore";
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
  if (!body.address) {
    return NextResponse.json({ error: "Missing field: address" }, { status: 400 });
  }

  // Edits merge into the existing row — partial bodies (e.g. just { status })
  // are allowed for organizers editing one field at a time from the dashboard.
  const existing = await getEvent(body.address);

  if (!existing) {
    // Initial create — caller must supply the on-chain immutable fields.
    const required = ["organizer", "eventId", "title", "startTs", "endTs", "capacity"] as const;
    for (const k of required) {
      if (body[k] === undefined || body[k] === null || body[k] === "") {
        return NextResponse.json({ error: `Missing field: ${k}` }, { status: 400 });
      }
    }
  }

  const organizer = existing?.organizer ?? body.organizer!;

  // Caller must be the organizer of the event they're creating/updating.
  try {
    await requireWallet(req, organizer);
  } catch (e) {
    const resp = authErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
  const status: EventMetadata["status"] =
    body.status === "draft" || body.status === "published"
      ? body.status
      : existing?.status ?? "published";

  const tags = Array.isArray(body.tags)
    ? body.tags.slice(0, 12).map((t) => String(t).trim()).filter(Boolean)
    : existing?.tags ?? [];
  const questions = Array.isArray(body.questions)
    ? body.questions.slice(0, 10).map((q) => String(q).trim()).filter(Boolean)
    : existing?.questions ?? [];
  const contactFields = Array.isArray(body.contactFields)
    ? Array.from(new Set(body.contactFields.map((c) => String(c).trim().toLowerCase()).filter(Boolean))).slice(0, 12)
    : existing?.contactFields ?? [];
  const minReputation =
    body.minReputation === null
      ? null
      : typeof body.minReputation === "number" && Number.isFinite(body.minReputation) && body.minReputation > 0
        ? Math.floor(body.minReputation)
        : existing?.minReputation ?? null;
  const matchSchema = (() => {
    if (body.matchSchema === undefined) return existing?.matchSchema ?? { enabled: false, templateId: null };
    const m = body.matchSchema;
    if (!m || !m.enabled) return { enabled: false, templateId: null };
    const tplId = typeof m.templateId === "string" && m.templateId in MATCH_TEMPLATES ? m.templateId : null;
    return { enabled: !!tplId, templateId: tplId };
  })();

  // Validate dates if either is being changed, so a typo can't flip end<start.
  const nextStartTs =
    typeof body.startTs === "number" && Number.isFinite(body.startTs)
      ? body.startTs
      : existing?.startTs ?? body.startTs!;
  const nextEndTs =
    typeof body.endTs === "number" && Number.isFinite(body.endTs)
      ? body.endTs
      : existing?.endTs ?? body.endTs!;
  if (nextEndTs <= nextStartTs) {
    return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
  }

  const meta: EventMetadata = {
    address: body.address!,
    organizer,
    // Truly immutable identifiers — set once at create, never overwritten.
    eventId: existing?.eventId ?? body.eventId!,
    capacity: existing?.capacity ?? body.capacity!,
    createdAt: existing?.createdAt ?? Date.now(),
    // Title / description / dates are duplicated on-chain at create time but
    // the off-chain mirror is the live, editable source of truth. The on-chain
    // record stays as the permanent original (visible on Solana Explorer).
    title: typeof body.title === "string" && body.title.trim() ? body.title : existing?.title ?? body.title!,
    description: body.description ?? existing?.description ?? "",
    startTs: nextStartTs,
    endTs: nextEndTs,
    // Off-chain editable:
    cover: body.cover ?? existing?.cover ?? "",
    coverArUri: body.coverArUri ?? existing?.coverArUri,
    venueImage: body.venueImage ?? existing?.venueImage ?? "",
    venueImageArUri: body.venueImageArUri ?? existing?.venueImageArUri,
    metadataUri: body.metadataUri ?? existing?.metadataUri,
    location: body.location ?? existing?.location ?? "",
    tags,
    questions,
    contactFields,
    minReputation,
    matchSchema,
    status,
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
