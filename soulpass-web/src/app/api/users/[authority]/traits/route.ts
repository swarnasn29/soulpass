import { NextRequest, NextResponse } from "next/server";
import {
  getUser,
  getUserTraits,
  setUserTraits,
  type StoredTraitValue,
  type UserTraitEntry,
} from "@/lib/eventMetaStore";
import { connection } from "@/lib/solana";
import { userPda } from "@/lib/pda";
import { decodeUserProfile } from "@/lib/program";
import { PublicKey } from "@solana/web3.js";
import { inferTraitPatch, suggestTraits } from "@/lib/traitInference";
import { getTemplate } from "@/lib/matchTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/users/[authority]/traits?templateId=tech
//
// Returns the wallet's stored traits + (optionally) suggestions for missing
// trait keys derived from on-chain profile + bio. Suggestions are NOT persisted
// — the client decides whether to apply them after the user reviews.
export async function GET(req: NextRequest, ctx: { params: Promise<{ authority: string }> }) {
  const { authority } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const templateId = searchParams.get("templateId");

  let traits = await getUserTraits(authority);

  // Pull on-chain profile + off-chain user (for bio) in parallel for inference.
  const user = await getUser(authority);
  let profile: ReturnType<typeof decodeUserProfile> | null = null;
  try {
    const [profilePda] = userPda(new PublicKey(authority));
    const acct = await connection.getAccountInfo(profilePda);
    profile = acct ? decodeUserProfile(acct.data) : null;
  } catch {
    profile = null;
  }

  let suggestions: ReturnType<typeof suggestTraits> = [];
  if (templateId) {
    const tpl = getTemplate(templateId);
    if (tpl) {
      // Auto-fill any missing trait we can confidently derive on the server.
      const patch = inferTraitPatch(templateId, {
        bio: user?.bio ?? null,
        profile: profile
          ? {
              reputation: profile.reputation,
              eventsAttended: profile.eventsAttended,
              connectionsMade: profile.connectionsMade,
              badgesEarned: profile.badgesEarned,
            }
          : null,
      });
      // Only persist for trait keys we don't yet have a value for.
      const fresh: typeof patch = {};
      for (const [k, v] of Object.entries(patch)) {
        if (!traits[k]) fresh[k] = v;
      }
      if (Object.keys(fresh).length) {
        traits = await setUserTraits(authority, fresh);
      }
      // Suggestions list is for UI display ("we inferred this").
      suggestions = suggestTraits(tpl, {
        bio: user?.bio ?? null,
        profile: profile
          ? {
              reputation: profile.reputation,
              eventsAttended: profile.eventsAttended,
              connectionsMade: profile.connectionsMade,
              badgesEarned: profile.badgesEarned,
            }
          : null,
      });
    }
  }

  return NextResponse.json({ traits, suggestions });
}

// PUT /api/users/[authority]/traits
// Body: { traits: { [traitKey]: { value, source? } } }
export async function PUT(req: NextRequest, ctx: { params: Promise<{ authority: string }> }) {
  const { authority } = await ctx.params;
  const body = (await req.json()) as {
    traits?: Record<string, { value: StoredTraitValue; source?: UserTraitEntry["source"] }>;
  };
  if (!body.traits || typeof body.traits !== "object") {
    return NextResponse.json({ error: "traits object required" }, { status: 400 });
  }

  const patch: Record<string, { value: StoredTraitValue; source: UserTraitEntry["source"] }> = {};
  for (const [k, v] of Object.entries(body.traits)) {
    if (v?.value === undefined || v.value === null) continue;
    patch[k] = { value: v.value, source: v.source ?? "user" };
  }
  const traits = await setUserTraits(authority, patch);
  return NextResponse.json({ traits });
}
