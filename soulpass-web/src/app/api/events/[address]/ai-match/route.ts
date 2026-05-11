import { NextRequest } from "next/server";
import {
  getEvent,
  getUser,
  listAllTraits,
  listRegistrations,
} from "@/lib/eventMetaStore";
import { rankCandidates, type Traits } from "@/lib/matchEngine";
import { getTemplate } from "@/lib/matchTemplates";
import { connection } from "@/lib/solana";
import { connectionPda, registrationPda, userPda } from "@/lib/pda";
import { decodeRegistration, decodeUserProfile } from "@/lib/program";
import { PublicKey } from "@solana/web3.js";
import {
  AGENT_MODEL,
  buildMatchUserPrompt,
  parseAgentMatch,
  streamMatch,
  type AgentProfile,
} from "@/lib/aiAgent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/events/[address]/ai-match?for=<wallet>&intent=<id>
//
// Streams Server-Sent Events. Event types:
//   meta      — { templateId, templateName, intent, model, candidateCount }
//   thinking  — text token (model's <think>…</think> reasoning)
//   answer    — text token (post-think model output, JSON being assembled)
//   result    — { primary, alternates, candidates: [...] }  // final, after JSON parse
//   error     — text
// Stream terminates after `result` (or `error`).
export async function GET(req: NextRequest, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const viewerWallet = searchParams.get("for");
  const intent = searchParams.get("intent");
  const includePending = searchParams.get("includePending") === "1";

  if (!viewerWallet) return sse({ error: "?for=<wallet> required" });

  const event = await getEvent(address);
  if (!event) return sse({ error: "Event not found" });
  if (!event.matchSchema?.enabled || !event.matchSchema.templateId) {
    return sse({ error: "Matchmaking not enabled for this event" });
  }
  const template = getTemplate(event.matchSchema.templateId);
  if (!template) return sse({ error: "Unknown match template" });

  // Same candidate-resolution logic as /matches: pull regs, check who's checked-in,
  // exclude already-connected pairs, fetch traits + on-chain rep.
  const regs = await listRegistrations(address);
  const wallets = regs.map((r) => r.attendeeAddress);
  if (!wallets.includes(viewerWallet)) return sse({ error: "Viewer is not a participant" });

  let eventKey: PublicKey;
  try {
    eventKey = new PublicKey(address);
  } catch {
    return sse({ error: "Bad event address" });
  }
  const regKeys = wallets.map((w) => registrationPda(eventKey, new PublicKey(w))[0]);
  const regAccts = await connection.getMultipleAccountsInfo(regKeys);
  const checkedIn = new Set<string>();
  regAccts.forEach((acct, i) => {
    if (!acct) return;
    const decoded = decodeRegistration(acct.data);
    if (decoded?.checkedIn) checkedIn.add(wallets[i]);
  });

  const eligible = wallets.filter((w) => {
    if (w === viewerWallet) return false;
    return includePending || checkedIn.has(w);
  });

  const viewerKey = new PublicKey(viewerWallet);
  const connKeys = eligible.map((w) => connectionPda(eventKey, viewerKey, new PublicKey(w)).pda);
  const connAccts = await connection.getMultipleAccountsInfo(connKeys);
  const alreadyConnected = new Set<string>();
  connAccts.forEach((acct, i) => {
    if (acct) alreadyConnected.add(eligible[i]);
  });
  const candidateWallets = eligible.filter((w) => !alreadyConnected.has(w));

  if (candidateWallets.length === 0) {
    return sse({
      meta: { templateId: template.id, templateName: template.name, intent: intent ?? "default", model: AGENT_MODEL, candidateCount: 0 },
      result: { primary: null, alternates: [], candidates: [] },
    });
  }

  const allTraits = await listAllTraits([viewerWallet, ...candidateWallets]);
  const flatten = (t: typeof allTraits[string] | undefined): Traits => {
    const out: Traits = {};
    if (!t) return out;
    for (const [k, v] of Object.entries(t)) out[k] = v.value;
    return out;
  };

  const candidateRecords = await Promise.all(
    candidateWallets.map(async (w) => ({
      wallet: w,
      user: await getUser(w),
      traits: flatten(allTraits[w]),
    })),
  );

  // Deterministic engine = pre-filter. Take top 8 to give the LLM a curated
  // shortlist (cheaper, faster, more focused than dumping all 100 attendees).
  const ranked = rankCandidates(
    { wallet: viewerWallet, traits: flatten(allTraits[viewerWallet]) },
    candidateRecords.map((c) => ({ wallet: c.wallet, traits: c.traits, meta: { user: c.user } })),
    template.id,
    intent,
  ).slice(0, 8);

  if (ranked.length === 0) {
    return sse({
      meta: { templateId: template.id, templateName: template.name, intent: intent ?? "default", model: AGENT_MODEL, candidateCount: 0 },
      result: { primary: null, alternates: [], candidates: [] },
    });
  }

  // On-chain rep snapshot for the shortlist (incl. viewer for prompt context).
  const profileWallets = [viewerWallet, ...ranked.map((c) => c.wallet)];
  const profileKeys = profileWallets.map((w) => userPda(new PublicKey(w))[0]);
  const profileAccts = await connection.getMultipleAccountsInfo(profileKeys);
  const profiles: Record<
    string,
    { reputation: number; eventsAttended: number; connectionsMade: number; badgesEarned: number } | null
  > = {};
  profileAccts.forEach((acct, i) => {
    if (!acct) {
      profiles[profileWallets[i]] = null;
      return;
    }
    const d = decodeUserProfile(acct.data);
    profiles[profileWallets[i]] = d
      ? {
          reputation: Number(d.reputation),
          eventsAttended: d.eventsAttended,
          connectionsMade: d.connectionsMade,
          badgesEarned: d.badgesEarned,
        }
      : null;
  });

  const viewerUser = await getUser(viewerWallet);

  const requesterProfile: AgentProfile = {
    wallet: viewerWallet,
    name: viewerUser?.name,
    bio: viewerUser?.bio,
    avatarUrl: viewerUser?.avatar,
    reputation: profiles[viewerWallet]?.reputation ?? null,
    eventsAttended: profiles[viewerWallet]?.eventsAttended ?? null,
    connectionsMade: profiles[viewerWallet]?.connectionsMade ?? null,
    badgesEarned: profiles[viewerWallet]?.badgesEarned ?? null,
    traits: flatten(allTraits[viewerWallet]),
  };

  const candidateProfiles: AgentProfile[] = ranked.map((r) => {
    const meta = r.meta as { user: Awaited<ReturnType<typeof getUser>> } | undefined;
    const u = meta?.user ?? null;
    return {
      wallet: r.wallet,
      name: u?.name,
      bio: u?.bio,
      avatarUrl: u?.avatar,
      reputation: profiles[r.wallet]?.reputation ?? null,
      eventsAttended: profiles[r.wallet]?.eventsAttended ?? null,
      connectionsMade: profiles[r.wallet]?.connectionsMade ?? null,
      badgesEarned: profiles[r.wallet]?.badgesEarned ?? null,
      traits: r.traits,
      preRankScore: r.result.score,
      preRankReasons: r.result.topReasons,
    };
  });

  const userPrompt = buildMatchUserPrompt({
    event: {
      title: event.title,
      description: event.description,
      templateId: template.id,
      intentId: intent,
    },
    requester: requesterProfile,
    candidates: candidateProfiles,
  });

  const validWallets = new Set(candidateProfiles.map((c) => c.wallet));

  // Pre-compute the lightweight candidate list the client renders for the
  // alternates row, so we don't need a second round-trip on result.
  const candidatesForClient = candidateProfiles.map((c) => ({
    wallet: c.wallet,
    name: c.name ?? null,
    avatar: c.avatarUrl ?? null,
    bio: c.bio ?? null,
    reputation: c.reputation ?? null,
    preRankScore: c.preRankScore ?? null,
    preRankReasons: c.preRankReasons ?? [],
  }));

  // ---- Stream response as SSE ----
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        const payload = typeof data === "string" ? data : JSON.stringify(data);
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${payload}\n\n`));
      };

      send("meta", {
        templateId: template.id,
        templateName: template.name,
        intent: intent ?? "default",
        model: AGENT_MODEL,
        candidateCount: candidateProfiles.length,
        candidates: candidatesForClient,
      });

      // Hard ceiling on the agent's runtime so a slow upstream never hangs the
      // SSE stream forever. On timeout we still emit a deterministic fallback
      // so the client always renders a result.
      const NIM_TIMEOUT_MS = 45_000;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), NIM_TIMEOUT_MS);

      const sendFallback = (timedOut: boolean) => {
        const top = candidateProfiles[0];
        send("result", {
          primary: top
            ? {
                wallet: top.wallet,
                reason: top.preRankReasons?.[0] ?? "Strong overall fit on shared interests.",
              }
            : null,
          alternates: candidateProfiles.slice(1, 3).map((c) => ({
            wallet: c.wallet,
            reason: c.preRankReasons?.[0] ?? "Worth a hello.",
          })),
          candidates: candidatesForClient,
          fallback: true,
          timedOut,
        });
      };

      let answerBuf = "";
      try {
        for await (const c of streamMatch(userPrompt, { signal: ac.signal })) {
          if (c.kind === "thinking") {
            send("thinking", c.text);
          } else {
            answerBuf += c.text;
            send("answer", c.text);
          }
        }

        const parsed = parseAgentMatch(answerBuf, validWallets);
        if (!parsed || !parsed.primary) {
          sendFallback(false);
        } else {
          send("result", { ...parsed, candidates: candidatesForClient, fallback: false });
        }
      } catch (e) {
        const aborted = ac.signal.aborted || (e as Error).name === "AbortError";
        if (aborted) {
          sendFallback(true);
        } else {
          send("error", "Agent failed");
        }
      } finally {
        clearTimeout(timer);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// Helper: emit a single-message SSE response (used for early-exit error/empty paths).
function sse(events: { error?: string; meta?: unknown; result?: unknown }): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const w = (event: string, data: unknown) => {
        const payload = typeof data === "string" ? data : JSON.stringify(data);
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${payload}\n\n`));
      };
      if (events.meta) w("meta", events.meta);
      if (events.result) w("result", events.result);
      if (events.error) w("error", events.error);
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
