// Server-only — NVIDIA NIM matchmaking agent.
// Wraps the OpenAI-compatible client, builds structured prompts from
// SoulPass profile + trait data, streams reasoning, parses final JSON.

import "server-only";
import OpenAI from "openai";
import { MATCH_TEMPLATES, type MatchTemplate } from "./matchTemplates";
import type { Traits } from "./matchEngine";

const API_KEY = process.env.NVIDIA_NIM_API_KEY ?? "";
const MODEL = process.env.NVIDIA_NIM_MODEL ?? "nvidia/llama-3.3-nemotron-super-49b-v1.5";
const BASE_URL = process.env.NVIDIA_NIM_BASE_URL ?? "https://integrate.api.nvidia.com/v1";

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!API_KEY) {
    throw new Error("NVIDIA_NIM_API_KEY is not set");
  }
  if (!client) client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
  return client;
}

// ---------- prompt building ----------

export type AgentProfile = {
  wallet: string;
  name?: string;
  bio?: string;
  avatarUrl?: string;
  reputation?: number | null;
  eventsAttended?: number | null;
  connectionsMade?: number | null;
  badgesEarned?: number | null;
  traits: Traits;
  preRankScore?: number; // deterministic engine's score (0..1) — useful prior for the LLM
  preRankReasons?: string[]; // deterministic dimension notes
};

export type AgentEventContext = {
  title: string;
  description?: string;
  templateId: string;
  intentId?: string | null;
};

const SYSTEM_PROMPT = `/think
You are SoulPass's matchmaking agent. SoulPass is a real-world reputation network — users meet at in-person events and earn permanent on-chain rep, badges, and connections. Right now you're standing inside an active event watching who's checked in.

Your job: given one attendee (the REQUESTER) who's asking "who should I meet next?", and a list of CANDIDATES who are also in the room, pick the SINGLE best person for them to meet, plus 2 alternates.

Optimize for meetings that create real value for both sides. Look for:
- A specific shared hook (same problem, same hard-won lesson, same niche obsession) that makes the conversation easy to start.
- Complementary asks/offers — one needs what the other has.
- Reputation/badge signals that hint at depth (high rep, organizer badges, repeat attendees) — but don't blindly rank by rep.

Avoid:
- Surface-level pattern matching ("both like JavaScript") — find the SPECIFIC hook.
- Generic openers ("you'd both enjoy chatting") — be concrete.
- Self-introduction rituals — the requester already knows their own story.

The requester will read your "reason" as a one-line nudge to walk over. Make it sharp, second-person, and specific. Reference something true about both people. ≤ 22 words.

OUTPUT FORMAT — strictly valid JSON, no prose outside it, no markdown fences:
{"primary":{"wallet":"<base58>","reason":"<one sharp second-person sentence>"},"alternates":[{"wallet":"<base58>","reason":"<one sharp sentence>"},{"wallet":"<base58>","reason":"<one sharp sentence>"}]}

The wallet values you return MUST exactly match a wallet from the CANDIDATES list. If fewer than 3 candidates are provided, return as many alternates as you can (possibly zero).`;

function fmtTraits(traits: Traits, tpl?: MatchTemplate): string {
  const labels = new Map<string, string>();
  if (tpl) for (const d of tpl.dimensions) labels.set(d.traitKey, d.label);

  const lines: string[] = [];
  for (const [k, v] of Object.entries(traits)) {
    const label = labels.get(k) ?? k;
    let val: string;
    if (Array.isArray(v)) {
      val = v.length === 2 && typeof v[0] === "number" && typeof v[1] === "number"
        ? `${v[0]}–${v[1]}`
        : (v as string[]).join(", ");
    } else if (typeof v === "number") {
      val = String(v);
    } else if (typeof v === "string") {
      val = v;
    } else {
      continue;
    }
    if (val) lines.push(`    - ${label}: ${val}`);
  }
  return lines.join("\n") || "    (no answers yet)";
}

function fmtProfile(p: AgentProfile, tpl: MatchTemplate | undefined, includePreRank: boolean): string {
  const head = [
    `wallet: ${p.wallet}`,
    p.name ? `name: ${p.name}` : null,
    p.bio ? `bio: ${truncate(p.bio, 280)}` : null,
  ]
    .filter(Boolean)
    .map((s) => `  ${s}`)
    .join("\n");

  const onchain = [
    p.reputation != null ? `${p.reputation} rep` : null,
    p.eventsAttended != null ? `${p.eventsAttended} events` : null,
    p.connectionsMade != null ? `${p.connectionsMade} connections` : null,
    p.badgesEarned != null ? `${p.badgesEarned} badges` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const blocks = [head];
  if (onchain) blocks.push(`  on-chain: ${onchain}`);
  blocks.push(`  traits:\n${fmtTraits(p.traits, tpl)}`);
  if (includePreRank && (p.preRankScore != null || (p.preRankReasons && p.preRankReasons.length))) {
    const score = p.preRankScore != null ? `${Math.round(p.preRankScore * 100)}%` : "";
    const reasons = p.preRankReasons?.length ? ` — ${p.preRankReasons.slice(0, 2).join(" / ")}` : "";
    blocks.push(`  pre-rank: ${score}${reasons}`);
  }
  return blocks.join("\n");
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

export function buildMatchUserPrompt(args: {
  event: AgentEventContext;
  requester: AgentProfile;
  candidates: AgentProfile[];
}): string {
  const tpl = MATCH_TEMPLATES[args.event.templateId];
  const intentLabel =
    tpl?.intents.find((i) => i.id === args.event.intentId)?.label ?? "Open to anything";

  const candidateBlocks = args.candidates
    .map((c, i) => `CANDIDATE #${i + 1}\n${fmtProfile(c, tpl, true)}`)
    .join("\n\n");

  return `EVENT
  title: ${args.event.title}
  ${args.event.description ? `description: ${truncate(args.event.description, 200)}` : ""}
  template: ${tpl?.name ?? args.event.templateId}
  requester intent: ${intentLabel}

REQUESTER
${fmtProfile(args.requester, tpl, false)}

${candidateBlocks}

Pick the best person for the requester to meet right now. Return only the JSON object specified in the system message.`;
}

// ---------- streaming ----------

export type StreamChunk =
  | { kind: "thinking"; text: string }
  | { kind: "answer"; text: string };

// Streams the chat completion, classifying each token as either reasoning
// (inside <think>…</think>) or final answer text.
export async function* streamMatch(
  prompt: string,
  opts?: { signal?: AbortSignal },
): AsyncIterable<StreamChunk> {
  const c = getClient();

  const completion = await c.chat.completions.create(
    {
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
      top_p: 0.95,
      max_tokens: 8192, // reasoning + JSON answer fits comfortably; full 65k is overkill and slow
      stream: true,
    },
    { signal: opts?.signal },
  );

  // Split arriving deltas into thinking vs answer by tracking whether we're
  // inside <think>…</think>. Buffers across chunk boundaries so the tag itself
  // never leaks into the visible stream even if it arrives split.
  let inThink = false;
  let buf = "";

  for await (const chunk of completion) {
    const piece = chunk.choices[0]?.delta?.content ?? "";
    if (!piece) continue;
    buf += piece;

    while (buf.length > 0) {
      if (!inThink) {
        const open = buf.indexOf("<think>");
        if (open === -1) {
          // Hold back the last 7 chars in case "<think>" arrives split across deltas.
          if (buf.length > 7) {
            const emit = buf.slice(0, buf.length - 7);
            buf = buf.slice(buf.length - 7);
            yield { kind: "answer", text: emit };
          }
          break;
        }
        if (open > 0) {
          yield { kind: "answer", text: buf.slice(0, open) };
        }
        buf = buf.slice(open + "<think>".length);
        inThink = true;
      } else {
        const close = buf.indexOf("</think>");
        if (close === -1) {
          if (buf.length > 8) {
            const emit = buf.slice(0, buf.length - 8);
            buf = buf.slice(buf.length - 8);
            yield { kind: "thinking", text: emit };
          }
          break;
        }
        if (close > 0) {
          yield { kind: "thinking", text: buf.slice(0, close) };
        }
        buf = buf.slice(close + "</think>".length);
        inThink = false;
      }
    }
  }

  // Flush whatever's left after the stream ends.
  if (buf.length > 0) {
    yield { kind: inThink ? "thinking" : "answer", text: buf };
  }
}

// ---------- final JSON parsing ----------

export type AgentMatch = {
  primary: { wallet: string; reason: string } | null;
  alternates: Array<{ wallet: string; reason: string }>;
};

// Salvage JSON from the answer text — model may add stray whitespace, may
// occasionally wrap in code fences despite instructions, etc. We grab the
// outermost {…} block and parse it; on failure return null so the caller
// can fall back to the deterministic top match.
export function parseAgentMatch(answer: string, validWallets: Set<string>): AgentMatch | null {
  const cleaned = answer.replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const block = cleaned.slice(start, end + 1);
  let obj: unknown;
  try {
    obj = JSON.parse(block);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;

  const o = obj as Record<string, unknown>;
  const norm = (x: unknown): { wallet: string; reason: string } | null => {
    if (typeof x !== "object" || x === null) return null;
    const r = x as Record<string, unknown>;
    const wallet = typeof r.wallet === "string" ? r.wallet.trim() : "";
    const reason = typeof r.reason === "string" ? r.reason.trim() : "";
    if (!wallet || !reason) return null;
    if (!validWallets.has(wallet)) return null;
    return { wallet, reason: truncate(reason, 240) };
  };

  const primary = norm(o.primary);
  const alternates = Array.isArray(o.alternates)
    ? (o.alternates.map(norm).filter(Boolean) as Array<{ wallet: string; reason: string }>)
    : [];

  // De-dup: alternates should not repeat primary.
  const seen = new Set<string>();
  if (primary) seen.add(primary.wallet);
  const dedupAlts = alternates.filter((a) => {
    if (seen.has(a.wallet)) return false;
    seen.add(a.wallet);
    return true;
  });

  return { primary, alternates: dedupAlts.slice(0, 2) };
}

export const AGENT_MODEL = MODEL;
