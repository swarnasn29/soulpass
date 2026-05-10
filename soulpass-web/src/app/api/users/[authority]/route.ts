import { NextRequest, NextResponse } from "next/server";
import { getUser, upsertUser, type UserMetadata } from "@/lib/eventMetaStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ authority: string }> }) {
  const { authority } = await ctx.params;
  const user = await getUser(authority);
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({ user });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ authority: string }> }) {
  const { authority } = await ctx.params;
  const body = (await req.json()) as Partial<UserMetadata>;
  const existing = await getUser(authority);

  if (!existing && !body.name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const meta: UserMetadata = {
    authority,
    name: body.name ?? existing?.name ?? "",
    avatar:
      body.avatar ||
      existing?.avatar ||
      `https://api.dicebear.com/7.x/notionists-neutral/svg?seed=${authority}&backgroundColor=B5FF1A`,
    avatarArUri: body.avatarArUri ?? existing?.avatarArUri,
    email: body.email ?? existing?.email,
    bio: typeof body.bio === "string" ? body.bio.slice(0, 280) : existing?.bio,
    createdAt: existing?.createdAt ?? Date.now(),
  };
  await upsertUser(meta);
  return NextResponse.json({ user: meta });
}
