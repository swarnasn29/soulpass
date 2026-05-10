// Pure scoring engine for SoulPass matchmaking.
//
// score(viewer, candidate, template, intent?) → 0..1, plus a per-dimension
// breakdown so the UI can show *why* two people match. Asymmetric: swapping
// viewer/candidate may produce different scores when intent differs.

import {
  MATCH_TEMPLATES,
  effectiveWeights,
  type MatchDimension,
} from "./matchTemplates";

export type TraitValue = string | string[] | number | [number, number];

export type Traits = Record<string, TraitValue>;

export type DimensionResult = {
  traitKey: string;
  label: string;
  rule: string;
  weight: number;
  rawScore: number;          // 0..1 before weight
  weighted: number;          // rawScore * normalizedWeight
  hardFailed: boolean;       // filter / mutual_filter rejected the pair
  note: string;              // one-line explanation
};

export type ScoreResult = {
  score: number;             // 0..1 final
  hardFailed: boolean;       // any filter rejected → score 0
  dimensions: DimensionResult[];
  topReasons: string[];      // 1-2 best dimension notes (high score + meaningful weight)
};

const HARD_FAIL: ScoreResult = {
  score: 0,
  hardFailed: true,
  dimensions: [],
  topReasons: [],
};

// ---------- helpers per type ----------

function asString(v: TraitValue | undefined): string | null {
  if (typeof v === "string" && v.length) return v;
  return null;
}

function asStringArray(v: TraitValue | undefined): string[] {
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v as string[];
  return [];
}

function asNumber(v: TraitValue | undefined): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function asRange(v: TraitValue | undefined): [number, number] | null {
  if (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number" &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1])
  ) {
    return [v[0] as number, v[1] as number];
  }
  return null;
}

// Jaccard for multi-select arrays.
function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Distance on an ordered single-select (Newcomer < Active < Veteran). Returns 0..1
// where larger = farther apart.
function orderedDistance(value: string, other: string, ordered: string[]): number {
  const i = ordered.indexOf(value);
  const j = ordered.indexOf(other);
  if (i === -1 || j === -1) return 0;
  return Math.abs(i - j) / Math.max(1, ordered.length - 1);
}

// ---------- per-rule scorers ----------
// Each returns { raw: 0..1, hardFail?: boolean, note: string }.

type RuleScore = { raw: number; hardFail?: boolean; note: string };

function scoreSimilar(d: MatchDimension, va: TraitValue | undefined, vb: TraitValue | undefined): RuleScore {
  if (d.type === "multi") {
    const a = asStringArray(va);
    const b = asStringArray(vb);
    if (a.length === 0 || b.length === 0) {
      return { raw: 0.4, note: "no overlap data" };
    }
    const j = jaccard(a, b);
    const shared = a.filter((x) => b.includes(x));
    const note = shared.length
      ? `Both into ${shared.slice(0, 2).join(", ")}${shared.length > 2 ? ` +${shared.length - 2}` : ""}`
      : "Few overlaps";
    return { raw: j, note };
  }
  if (d.type === "single") {
    const a = asString(va);
    const b = asString(vb);
    if (!a || !b) return { raw: 0.4, note: "missing answer" };
    if (a === b) return { raw: 1, note: `Both ${a.toLowerCase()}` };
    if (d.options) {
      const dist = orderedDistance(a, b, d.options);
      return { raw: Math.max(0, 1 - dist), note: `${a} ↔ ${b}` };
    }
    return { raw: 0, note: `${a} vs ${b}` };
  }
  if (d.type === "number") {
    const a = asNumber(va);
    const b = asNumber(vb);
    if (a == null || b == null) return { raw: 0.4, note: "missing" };
    const span = Math.max(1, (d.max ?? 100) - (d.min ?? 0));
    return { raw: Math.max(0, 1 - Math.abs(a - b) / span), note: `${a} ≈ ${b}` };
  }
  return { raw: 0.4, note: "n/a" };
}

function scoreComplementary(d: MatchDimension, va: TraitValue | undefined, vb: TraitValue | undefined): RuleScore {
  if (d.type === "single") {
    const a = asString(va);
    const b = asString(vb);
    if (!a || !b) return { raw: 0.4, note: "missing answer" };
    if (a === b) return { raw: 0.2, note: `Both ${a.toLowerCase()}` };
    if (d.options) {
      const dist = orderedDistance(a, b, d.options);
      // moderate distance is best; identical is worst, max distance fine.
      // Sweet spot at ~0.5–0.7 distance.
      const sweet = 1 - Math.abs(dist - 0.6) / 0.6;
      return { raw: Math.max(0.4, sweet), note: `${a} ↔ ${b}` };
    }
    return { raw: 0.85, note: `${a} ↔ ${b}` };
  }
  if (d.type === "multi") {
    const a = asStringArray(va);
    const b = asStringArray(vb);
    if (a.length === 0 || b.length === 0) return { raw: 0.4, note: "missing" };
    // Want some overlap (shared topic) but at least one unique on each side.
    const overlap = jaccard(a, b);
    const aUnique = a.filter((x) => !b.includes(x)).length;
    const bUnique = b.filter((x) => !a.includes(x)).length;
    const hasUnique = aUnique > 0 && bUnique > 0;
    const raw = (overlap > 0 ? 0.5 + overlap * 0.3 : 0.2) + (hasUnique ? 0.2 : 0);
    return {
      raw: Math.min(1, raw),
      note: hasUnique ? "Shared topic, different angles" : overlap > 0 ? "Lots of overlap" : "Few connections",
    };
  }
  if (d.type === "number") {
    const a = asNumber(va);
    const b = asNumber(vb);
    if (a == null || b == null) return { raw: 0.4, note: "missing" };
    const span = Math.max(1, (d.max ?? 100) - (d.min ?? 0));
    const dist = Math.abs(a - b) / span;
    // sweet spot at 0.3–0.6 — meaningful gap without being a chasm.
    const sweet = 1 - Math.abs(dist - 0.45) / 0.55;
    return { raw: Math.max(0.3, sweet), note: `${a} ↔ ${b}` };
  }
  return { raw: 0.4, note: "n/a" };
}

// `filter` rule: candidate must satisfy viewer's spec. Pair traits often used:
//   gender (filter) + seeking_gender (mutual_filter) for dating
//   side (filter, opposite-required) for jobfair
function scoreFilter(d: MatchDimension, va: TraitValue | undefined, vb: TraitValue | undefined): RuleScore {
  // Special case: jobfair `side` — viewer and candidate must be opposite.
  if (d.traitKey === "side") {
    const a = asString(va);
    const b = asString(vb);
    if (!a || !b) return { raw: 0, hardFail: true, note: "side missing" };
    if (a === b) return { raw: 0, hardFail: true, note: `Both ${a.toLowerCase()} — no match` };
    return { raw: 1, note: `${a} ↔ ${b}` };
  }
  // Default filter: equal, or candidate value is a member of viewer's array.
  const a = va;
  const b = vb;
  if (a == null || b == null) return { raw: 0, hardFail: true, note: "missing" };
  if (Array.isArray(a)) {
    const sa = a as string[];
    const sb = typeof b === "string" ? b : Array.isArray(b) ? (b as string[])[0] : null;
    if (!sb) return { raw: 0, hardFail: true, note: "missing" };
    return sa.includes(sb)
      ? { raw: 1, note: `Within range (${sb})` }
      : { raw: 0, hardFail: true, note: `${sb} not accepted` };
  }
  if (typeof a === "string" && typeof b === "string") {
    return a === b
      ? { raw: 1, note: `Both ${a}` }
      : { raw: 0, hardFail: true, note: `${a} vs ${b}` };
  }
  if (typeof a === "number" && typeof b === "number") {
    return a === b
      ? { raw: 1, note: `Both ${a}` }
      : { raw: 0, hardFail: true, note: `${a} vs ${b}` };
  }
  return { raw: 0, hardFail: true, note: "type mismatch" };
}

// `mutual_filter`: both sides must accept the other.
// Common patterns we support out of the box:
//   - paired single + multi:  e.g. viewer.gender ∈ candidate.seeking_gender, AND vice versa.
//     We detect this by looking at *both* viewer and candidate values for this dimension and
//     also at the paired counterpart (gender ↔ seeking_gender, age ↔ age_range).
//   - range overlap: viewer.range overlaps candidate's value/range
//   - number within other's range
type MutualContext = {
  viewer: Traits;
  candidate: Traits;
};

function scoreMutualFilter(d: MatchDimension, ctx: MutualContext): RuleScore {
  // Pair lookup: which trait does this dimension's value get checked against?
  const PAIRS: Record<string, string> = {
    seeking_gender: "gender",        // dating: viewer.seeking_gender must include candidate.gender
    age_range: "age",                 // dating: viewer.age_range must include candidate.age (and reverse)
    check_size: "check_size",         // founder: range overlap
    experience_years: "experience_years", // jobfair: number within range
  };

  const partnerKey = PAIRS[d.traitKey];

  if (d.traitKey === "seeking_gender") {
    const vSeek = asStringArray(ctx.viewer[d.traitKey]);
    const cSeek = asStringArray(ctx.candidate[d.traitKey]);
    const vGender = asString(ctx.viewer[partnerKey]);
    const cGender = asString(ctx.candidate[partnerKey]);
    if (!vGender || !cGender) return { raw: 0, hardFail: true, note: "gender missing" };
    const accepts = (seek: string[], gender: string) =>
      seek.includes("Anyone") ||
      seek.some((s) => s.toLowerCase().startsWith(gender.toLowerCase().slice(0, 5)));
    const ok = accepts(vSeek, cGender) && accepts(cSeek, vGender);
    return ok
      ? { raw: 1, note: "Both opted in" }
      : { raw: 0, hardFail: true, note: "Not in each other's preferences" };
  }

  if (d.traitKey === "age_range") {
    const vRange = asRange(ctx.viewer[d.traitKey]);
    const cRange = asRange(ctx.candidate[d.traitKey]);
    const vAge = asNumber(ctx.viewer[partnerKey]);
    const cAge = asNumber(ctx.candidate[partnerKey]);
    if (!vRange || !cRange || vAge == null || cAge == null) {
      return { raw: 0, hardFail: true, note: "age data missing" };
    }
    const ok = cAge >= vRange[0] && cAge <= vRange[1] && vAge >= cRange[0] && vAge <= cRange[1];
    return ok ? { raw: 1, note: "Within each other's age range" } : { raw: 0, hardFail: true, note: "Outside age range" };
  }

  if (d.traitKey === "check_size") {
    const v = asRange(ctx.viewer[d.traitKey]) ?? (() => {
      const n = asNumber(ctx.viewer[d.traitKey]);
      return n == null ? null : ([n, n] as [number, number]);
    })();
    const c = asRange(ctx.candidate[d.traitKey]) ?? (() => {
      const n = asNumber(ctx.candidate[d.traitKey]);
      return n == null ? null : ([n, n] as [number, number]);
    })();
    if (!v || !c) return { raw: 0.5, note: "no size given" };
    const overlap = !(v[1] < c[0] || c[1] < v[0]);
    return overlap
      ? { raw: 1, note: "Check sizes overlap" }
      : { raw: 0, hardFail: true, note: "No check-size overlap" };
  }

  if (d.traitKey === "experience_years") {
    // Jobfair: candidate has years (number). Recruiter has min years (number).
    // We treat the higher number as the requirement and the lower as the candidate.
    const v = asNumber(ctx.viewer[d.traitKey]);
    const c = asNumber(ctx.candidate[d.traitKey]);
    if (v == null || c == null) return { raw: 0, hardFail: true, note: "years missing" };
    // 1 if within ±3 of each other, else fall off.
    const gap = Math.abs(v - c);
    if (gap <= 3) return { raw: 1, note: `${gap}y gap` };
    if (gap <= 7) return { raw: 0.5, note: `${gap}y gap` };
    return { raw: 0, hardFail: true, note: `${gap}y gap — too far` };
  }

  return { raw: 0.5, note: "n/a" };
}

// ---------- main entry ----------

export type ScoreOpts = {
  viewer: Traits;
  candidate: Traits;
  templateId: string;
  intentId?: string | null;
};

export function score(opts: ScoreOpts): ScoreResult {
  const tpl = MATCH_TEMPLATES[opts.templateId];
  if (!tpl) return HARD_FAIL;

  const weights = effectiveWeights(tpl, opts.intentId);
  // normalize weights so they sum to 1
  const weightSum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;

  const ctx: MutualContext = { viewer: opts.viewer, candidate: opts.candidate };
  const dims: DimensionResult[] = [];
  let total = 0;
  let hardFailed = false;

  for (const d of tpl.dimensions) {
    const w = (weights[d.traitKey] ?? d.weight) / weightSum;
    const va = opts.viewer[d.traitKey];
    const vb = opts.candidate[d.traitKey];

    let r: RuleScore;
    switch (d.rule) {
      case "similar":
        r = scoreSimilar(d, va, vb);
        break;
      case "complementary":
        r = scoreComplementary(d, va, vb);
        break;
      case "filter":
        r = scoreFilter(d, va, vb);
        break;
      case "mutual_filter":
        r = scoreMutualFilter(d, ctx);
        break;
    }

    if (r.hardFail) hardFailed = true;
    const weighted = r.raw * w;
    total += weighted;

    dims.push({
      traitKey: d.traitKey,
      label: d.label,
      rule: d.rule,
      weight: w,
      rawScore: r.raw,
      weighted,
      hardFailed: !!r.hardFail,
      note: r.note,
    });
  }

  if (hardFailed) {
    return { score: 0, hardFailed: true, dimensions: dims, topReasons: [] };
  }

  // top reasons: dims with highest weighted contribution and non-trivial rawScore
  const topReasons = dims
    .filter((d) => d.rawScore >= 0.6 && d.weight >= 0.1)
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, 2)
    .map((d) => d.note);

  return {
    score: Math.max(0, Math.min(1, total)),
    hardFailed: false,
    dimensions: dims,
    topReasons,
  };
}

// Convenience: rank candidates for a viewer.
export type Candidate = { wallet: string; traits: Traits; meta?: Record<string, unknown> };

export type RankedCandidate = Candidate & { result: ScoreResult };

export function rankCandidates(
  viewer: { wallet: string; traits: Traits },
  candidates: Candidate[],
  templateId: string,
  intentId?: string | null,
): RankedCandidate[] {
  return candidates
    .filter((c) => c.wallet !== viewer.wallet)
    .map((c) => ({
      ...c,
      result: score({ viewer: viewer.traits, candidate: c.traits, templateId, intentId }),
    }))
    .filter((c) => !c.result.hardFailed)
    .sort((a, b) => b.result.score - a.result.score);
}

// Mutual flag — used for the "they picked you too" indicator.
export function isMutualTopMatch(
  viewerWallet: string,
  candidateWallet: string,
  allViewers: Array<{ wallet: string; traits: Traits }>,
  templateId: string,
): boolean {
  const candidate = allViewers.find((v) => v.wallet === candidateWallet);
  const viewer = allViewers.find((v) => v.wallet === viewerWallet);
  if (!candidate || !viewer) return false;
  const candidateRanking = rankCandidates(candidate, allViewers, templateId);
  return candidateRanking[0]?.wallet === viewerWallet;
}
