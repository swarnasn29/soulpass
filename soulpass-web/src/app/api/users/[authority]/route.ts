import { NextRequest, NextResponse } from "next/server";
import { getUser, upsertUser, type UserMetadata } from "@/lib/eventMetaStore";
import { ForbiddenError, UnauthorizedError, requireWallet } from "@/lib/auth";

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

  try {
    await requireWallet(req, authority);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: "Auth check failed" }, { status: 500 });
  }

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
