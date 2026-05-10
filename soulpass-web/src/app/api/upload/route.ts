import { NextRequest, NextResponse } from "next/server";
import { uploadBytes, type ArweaveTag } from "@/lib/arweave";

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

  // Optional context tags so uploads are queryable on Arweave (kind=event-cover, etc).
  const kind = String(form.get("kind") ?? "media");
  const owner = String(form.get("owner") ?? "");
  const eventAddress = String(form.get("eventAddress") ?? "");

  const tags: ArweaveTag[] = [
    { name: "Kind", value: kind.slice(0, 64) },
  ];
  if (owner) tags.push({ name: "Owner", value: owner.slice(0, 64) });
  if (eventAddress) tags.push({ name: "Event", value: eventAddress.slice(0, 64) });

  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const result = await uploadBytes(buf, file.type, tags);
    return NextResponse.json(result);
  } catch (e) {
    const msg = (e as Error).message || "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
