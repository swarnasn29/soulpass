// Auto-fill helpers for matchmaking traits.
//
// We never fabricate hard answers (gender, age) from on-chain data — those
// must come from the user. We only auto-fill *soft* signals:
//   - seniority bucket from reputation
//   - interests / skills / sectors / topics from bio keywords
//
// Each suggestion includes a `source` so the UI can show "we inferred this
// from your bio" with an easy override.

import type { UserProfile } from "./program";
import type { StoredTraitValue, UserTraitEntry } from "./eventMetaStore";
import { getTemplate, type MatchTemplate } from "./matchTemplates";

export type Suggestion = {
  traitKey: string;
  value: StoredTraitValue;
  source: UserTraitEntry["source"];
  confidence: number; // 0..1
};

// ---------- reputation -> seniority ----------

export function reputationBucket(rep: number): "Newcomer" | "Active" | "Veteran" {
  if (rep < 1000) return "Newcomer";
  if (rep < 3000) return "Active";
  return "Veteran";
}

// ---------- bio -> keyword extraction ----------

const KEYWORD_MAP: Record<string, string> = {
  // tech stack
  solana: "Solana",
  rust: "Rust",
  typescript: "TypeScript",
  ts: "TypeScript",
  javascript: "TypeScript",
  js: "TypeScript",
  react: "React",
  next: "Frontend",
  frontend: "Frontend",
  backend: "Backend",
  fullstack: "Frontend",
  python: "Python",
  go: "Go",
  golang: "Go",
  solidity: "Solidity",
  ai: "AI / ML",
  ml: "AI / ML",
  llm: "AI / ML",
  infra: "Infra / DevOps",
  devops: "Infra / DevOps",
  defi: "Crypto / DeFi",
  crypto: "Crypto / DeFi",
  web3: "Crypto / Web3",
  hardware: "Hardware",
  mobile: "Mobile",
  ios: "Mobile",
  android: "Mobile",
  design: "Design systems",
  growth: "Growth",
  // sectors
  fintech: "Fintech",
  saas: "SaaS",
  consumer: "Consumer",
  health: "Healthcare",
  climate: "Climate",
  marketplace: "Marketplaces",
  devtools: "DevTools",
  // conference topics
  research: "Research",
  product: "Product",
  policy: "Policy / Regulation",
  community: "Community",
  // dating-friendly interests
  music: "Music",
  travel: "Travel",
  food: "Food",
  books: "Books",
  reading: "Books",
  fitness: "Fitness",
  gym: "Fitness",
  movies: "Movies",
  film: "Movies",
  outdoors: "Outdoors",
  hiking: "Outdoors",
  art: "Art",
  gaming: "Gaming",
  games: "Gaming",
  tech: "Tech",
};

function extractInterestsFromBio(bio: string, allowed: string[]): string[] {
  if (!bio) return [];
  const allowedSet = new Set(allowed);
  const words = bio.toLowerCase().split(/[^a-z0-9+]+/);
  const found = new Set<string>();
  for (const w of words) {
    const mapped = KEYWORD_MAP[w];
    if (mapped && allowedSet.has(mapped)) found.add(mapped);
  }
  return Array.from(found);
}

// ---------- main entry ----------

export type InferenceInput = {
  bio?: string | null;
  profile?: Pick<UserProfile, "reputation" | "eventsAttended" | "connectionsMade" | "badgesEarned"> | null;
};

// Suggest values for every trait the template defines that has autofillFrom set.
// Caller decides whether to apply (e.g. fill missing) or just show as placeholder.
export function suggestTraits(template: MatchTemplate, input: InferenceInput): Suggestion[] {
  const out: Suggestion[] = [];

  for (const d of template.dimensions) {
    if (!d.autofillFrom?.length) continue;

    if (d.autofillFrom.includes("reputation_bucket") && input.profile) {
      const bucket = reputationBucket(Number(input.profile.reputation));
      if (d.options?.includes(bucket)) {
        out.push({
          traitKey: d.traitKey,
          value: bucket,
          source: "reputation_bucket",
          confidence: 0.85,
        });
      }
    }

    if (d.autofillFrom.includes("bio_keywords") && d.options && input.bio) {
      const matches = extractInterestsFromBio(input.bio, d.options);
      if (matches.length) {
        out.push({
          traitKey: d.traitKey,
          value: d.type === "multi" ? matches : matches[0],
          source: "bio_keywords",
          confidence: Math.min(0.7, 0.3 + matches.length * 0.1),
        });
      }
    }
  }

  return out;
}

// Convenience: given a template id and profile/bio, return a patch ready for setUserTraits.
export function inferTraitPatch(
  templateId: string,
  input: InferenceInput,
): Record<string, { value: StoredTraitValue; source: UserTraitEntry["source"] }> {
  const tpl = getTemplate(templateId);
  if (!tpl) return {};
  const suggestions = suggestTraits(tpl, input);
  const patch: Record<string, { value: StoredTraitValue; source: UserTraitEntry["source"] }> = {};
  for (const s of suggestions) {
    patch[s.traitKey] = { value: s.value, source: s.source };
  }
  return patch;
}
