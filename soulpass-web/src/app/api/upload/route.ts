import { NextRequest, NextResponse } from "next/server";
import { uploadBytes, type ArweaveTag } from "@/lib/arweave";
import { ForbiddenError, UnauthorizedError, requireSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
]);

export async function POST(req: NextRequest) {
  // Auth required — uploads draw down the fee-payer wallet's SOL via Irys.
  let session;
  try {
    session = await requireSession(req);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: "Auth check failed" }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file field" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: `Unsupported type: ${file.type}` }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (max ${MAX_BYTES / 1024 / 1024}MB)` }, { status: 413 });
  }

  const kind = String(form.get("kind") ?? "media");
  const ownerField = String(form.get("owner") ?? "");
  const eventAddress = String(form.get("eventAddress") ?? "");

  // If the client claims an owner, it must be the authenticated wallet.
  if (ownerField && ownerField !== session.wallet) {
    return NextResponse.json({ error: "owner must match authenticated wallet" }, { status: 403 });
  }
  const owner = ownerField || session.wallet;

  const tags: ArweaveTag[] = [
    { name: "Kind", value: kind.slice(0, 64) },
    { name: "Owner", value: owner.slice(0, 64) },
  ];
  if (eventAddress) tags.push({ name: "Event", value: eventAddress.slice(0, 64) });

  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const result = await uploadBytes(buf, file.type, tags);
    return NextResponse.json(result);
  } catch (e) {
    const msg = (e as Error).message ?? "Upload failed";
    // Don't leak storage internals to clients.
    const safe = /insufficient|not enough|funding/i.test(msg)
      ? "Storage funding insufficient. Try again later."
      : /timeout|aborted/i.test(msg)
        ? "Storage timed out"
        : "Upload failed";
    return NextResponse.json({ error: safe }, { status: 500 });
  }
}
