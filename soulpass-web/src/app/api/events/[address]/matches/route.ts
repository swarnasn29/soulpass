import { NextRequest, NextResponse } from "next/server";
import {
  getEvent,
  getUser,
  listAllTraits,
  listRegistrations,
} from "@/lib/eventMetaStore";
import { rankCandidates, isMutualTopMatch, type Traits } from "@/lib/matchEngine";
import { getTemplate } from "@/lib/matchTemplates";
import { connection } from "@/lib/solana";
import { connectionPda, registrationPda, userPda } from "@/lib/pda";
import { decodeRegistration, decodeUserProfile } from "@/lib/program";
import { PublicKey } from "@solana/web3.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/events/[address]/matches?for=<wallet>&intent=<id>&limit=10
//
// Returns candidates ranked for the viewer. Filters:
//   - drops anyone the viewer has already connected with (Connection PDA exists)
//   - by default only includes *checked-in* attendees (live matchmaking) but
//     ?includePending=1 broadens to all approved registrations.
export async function GET(req: NextRequest, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const viewerWallet = searchParams.get("for");
  const intent = searchParams.get("intent");
  const limit = Math.max(1, Math.min(50, parseInt(searchParams.get("limit") || "10", 10)));
  const includePending = searchParams.get("includePending") === "1";

  if (!viewerWallet) {
    return NextResponse.json({ error: "?for=<wallet> required" }, { status: 400 });
  }

  const event = await getEvent(address);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (!event.matchSchema?.enabled || !event.matchSchema.templateId) {
    return NextResponse.json({ error: "Matchmaking not enabled for this event" }, { status: 400 });
  }
  const template = getTemplate(event.matchSchema.templateId);
  if (!template) {
    return NextResponse.json({ error: "Unknown match template" }, { status: 400 });
  }

  // 1) Pull all participants from the off-chain registration store.
  const regs = await listRegistrations(address);
  const wallets = regs.map((r) => r.attendeeAddress);
  if (!wallets.includes(viewerWallet)) {
    return NextResponse.json({ error: "Viewer is not a participant" }, { status: 403 });
  }

  // 2) Bulk-load on-chain Registration accounts to know who's checked in.
  let eventKey: PublicKey;
  try {
    eventKey = new PublicKey(address);
  } catch {
    return NextResponse.json({ error: "Bad event address" }, { status: 400 });
  }
  const regKeys = wallets.map((w) => registrationPda(eventKey, new PublicKey(w))[0]);
  const regAccts = await connection.getMultipleAccountsInfo(regKeys);
  const checkedIn = new Set<string>();
  regAccts.forEach((acct, i) => {
    if (!acct) return;
    const decoded = decodeRegistration(acct.data);
    if (decoded?.checkedIn) checkedIn.add(wallets[i]);
  });

  // 3) Filter eligible candidates: not the viewer, and either checked-in or includePending.
  const eligible = wallets.filter((w) => {
    if (w === viewerWallet) return false;
    return includePending || checkedIn.has(w);
  });

  // 4) Look up which Connection PDAs exist between viewer and each candidate.
  //    Existence ⇒ already connected ⇒ exclude from matches.
  const viewerKey = new PublicKey(viewerWallet);
  const connKeys = eligible.map((w) => connectionPda(eventKey, viewerKey, new PublicKey(w)).pda);
  const connAccts = await connection.getMultipleAccountsInfo(connKeys);
  const alreadyConnected = new Set<string>();
  connAccts.forEach((acct, i) => {
    if (acct) alreadyConnected.add(eligible[i]);
  });
  const candidates = eligible.filter((w) => !alreadyConnected.has(w));

  // 5) Pull traits (off-chain) and user metadata (off-chain) in bulk.
  const allTraits = await listAllTraits([viewerWallet, ...candidates]);
  const viewerTraits = allTraits[viewerWallet] ?? {};

  // Convert UserTraits -> plain Traits map for the engine.
  const flatten = (t: typeof viewerTraits): Traits => {
    const out: Traits = {};
    for (const [k, v] of Object.entries(t)) out[k] = v.value;
    return out;
  };

  const candidateRecords = await Promise.all(
    candidates.map(async (w) => ({
      wallet: w,
      user: await getUser(w),
      traits: flatten(allTraits[w] ?? {}),
    })),
  );

  // 6) Score and rank.
  const ranked = rankCandidates(
    { wallet: viewerWallet, traits: flatten(viewerTraits) },
    candidateRecords.map((c) => ({ wallet: c.wallet, traits: c.traits, meta: { user: c.user } })),
    template.id,
    intent,
  ).slice(0, limit);

  // 7) For the top match only, compute the mutual-flag + on-chain reputation snapshot.
  const top = ranked[0];
  let topMutual = false;
  if (top) {
    const allViewers = [viewerWallet, ...candidates].map((w) => ({
      wallet: w,
      traits: flatten(allTraits[w] ?? {}),
    }));
    topMutual = isMutualTopMatch(viewerWallet, top.wallet, allViewers, template.id);
  }

  // Pull on-chain UserProfiles for ranked candidates so the card can show reputation.
  const profileKeys = ranked.map((c) => userPda(new PublicKey(c.wallet))[0]);
  const profileAccts = await connection.getMultipleAccountsInfo(profileKeys);
  const profiles: Record<string, { reputation: number; eventsAttended: number; connectionsMade: number; badgesEarned: number } | null> = {};
  profileAccts.forEach((acct, i) => {
    if (!acct) {
      profiles[ranked[i].wallet] = null;
      return;
    }
    const decoded = decodeUserProfile(acct.data);
    profiles[ranked[i].wallet] = decoded
      ? {
          reputation: Number(decoded.reputation),
          eventsAttended: decoded.eventsAttended,
          connectionsMade: decoded.connectionsMade,
          badgesEarned: decoded.badgesEarned,
        }
      : null;
  });

  return NextResponse.json({
    templateId: template.id,
    templateName: template.name,
    intentApplied: intent ?? "default",
    viewerCheckedIn: checkedIn.has(viewerWallet),
    candidates: ranked.map((c) => {
      const meta = c.meta as { user: Awaited<ReturnType<typeof getUser>> } | undefined;
      return {
        wallet: c.wallet,
        user: meta?.user ?? null,
        profile: profiles[c.wallet] ?? null,
        score: c.result.score,
        topReasons: c.result.topReasons,
        breakdown: c.result.dimensions.map((d) => ({
          label: d.label,
          rule: d.rule,
          weight: d.weight,
          score: d.rawScore,
          note: d.note,
        })),
        checkedIn: checkedIn.has(c.wallet),
      };
    }),
    topMutual,
  });
}
