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
import { buildDemoRegistrationBundles } from "@/lib/demoData";

// DEMO: same threshold as the ai-match route — augment the candidate pool
// with pre-staged personas if real attendees are thin so the PerfectMatchCard
// has something interesting to rank during the demo.
const DEMO_CANDIDATE_THRESHOLD = 3;

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
  // DEMO: relax the participant check so the matchmaker still runs when the
  // Supabase regs table is empty — augmentation below provides candidates.

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
  const connAccts = connKeys.length
    ? await connection.getMultipleAccountsInfo(connKeys)
    : [];
  const alreadyConnected = new Set<string>();
  connAccts.forEach((acct, i) => {
    if (acct) alreadyConnected.add(eligible[i]);
  });
  const realCandidates = eligible.filter((w) => !alreadyConnected.has(w));

  // DEMO augmentation: bring in the staged personas when real candidates
  // are scarce, so the deterministic ranker has bodies to score.
  const demoBundles =
    realCandidates.length < DEMO_CANDIDATE_THRESHOLD
      ? buildDemoRegistrationBundles(address).filter(
          (b) => b.checkedIn && b.user.authority !== viewerWallet,
        )
      : [];
  const demoByWallet = new Map(demoBundles.map((b) => [b.user.authority, b]));
  for (const b of demoBundles) checkedIn.add(b.user.authority);
  const candidates = [...realCandidates, ...demoBundles.map((b) => b.user.authority)];

  // 5) Pull traits (off-chain) and user metadata (off-chain) in bulk.
  const allTraits = await listAllTraits([viewerWallet, ...candidates]);
  for (const b of demoBundles) {
    if (!allTraits[b.user.authority] || Object.keys(allTraits[b.user.authority]).length === 0) {
      allTraits[b.user.authority] = b.traits;
    }
  }
  const viewerTraits = allTraits[viewerWallet] ?? {};

  // Convert UserTraits -> plain Traits map for the engine.
  const flatten = (t: typeof viewerTraits): Traits => {
    const out: Traits = {};
    for (const [k, v] of Object.entries(t)) out[k] = v.value;
    return out;
  };

  const candidateRecords = await Promise.all(
    candidates.map(async (w) => {
      const demo = demoByWallet.get(w);
      return {
        wallet: w,
        user: demo ? demo.user : await getUser(w),
        traits: flatten(allTraits[w] ?? {}),
      };
    }),
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

  // Pull on-chain UserProfiles for ranked candidates so the card can show
  // reputation. Demo wallets bypass the chain — they ship their own profile.
  const profiles: Record<string, { reputation: number; eventsAttended: number; connectionsMade: number; badgesEarned: number } | null> = {};
  const realRanked = ranked.filter((c) => !demoByWallet.has(c.wallet));
  const profileKeys = realRanked.map((c) => userPda(new PublicKey(c.wallet))[0]);
  const profileAccts = profileKeys.length
    ? await connection.getMultipleAccountsInfo(profileKeys)
    : [];
  realRanked.forEach((c, i) => {
    const acct = profileAccts[i];
    if (!acct) {
      profiles[c.wallet] = null;
      return;
    }
    const decoded = decodeUserProfile(acct.data);
    profiles[c.wallet] = decoded
      ? {
          reputation: Number(decoded.reputation),
          eventsAttended: decoded.eventsAttended,
          connectionsMade: decoded.connectionsMade,
          badgesEarned: decoded.badgesEarned,
        }
      : null;
  });
  for (const c of ranked) {
    const demo = demoByWallet.get(c.wallet);
    if (demo) profiles[c.wallet] = demo.profile;
  }

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
