// Match templates and types for SoulPass AI matchmaking.
//
// A template defines a set of *dimensions* — the questions we score people on
// at a given event. Each dimension has a rule that tells the engine how to
// score it (similar / complementary / filter / mutual_filter). Dimensions are
// keyed by a stable `traitKey` so user answers persist across events: filling
// `role` once at a Tech meet-up auto-fills `role` at the next Founder dinner.

export type MatchRule = "similar" | "complementary" | "filter" | "mutual_filter";

export type DimensionType =
  | "single"   // pick one option
  | "multi"    // pick many options
  | "number"   // single integer
  | "range";   // [min, max] tuple

export type AutofillSource =
  | "reputation_bucket"  // from on-chain reputation tier
  | "badge_mix"          // from earned badges
  | "bio_keywords"       // simple keyword scan of bio
  | "previous_event";    // already in userTraits

export type MatchDimension = {
  traitKey: string;          // stable key — portable across events
  label: string;             // shown to organizer
  question: string;          // shown to attendee
  type: DimensionType;
  options?: string[];        // single/multi
  min?: number;              // number/range
  max?: number;              // number/range
  rule: MatchRule;
  weight: number;            // 0..1, summed scores get weighted
  required: boolean;         // if false, missing answer = neutral score
  autofillFrom?: AutofillSource[];
};

export type MatchTemplate = {
  id: string;
  name: string;
  tagline: string;
  // Intent options the viewer can pick at runtime. Each maps to weight overrides.
  intents: Array<{
    id: string;
    label: string;
    weightOverrides?: Record<string, number>; // traitKey -> new weight
  }>;
  dimensions: MatchDimension[];
};

// ---------- shared dimension building blocks ----------

const D_ROLE_TECH: MatchDimension = {
  traitKey: "role_tech",
  label: "Role",
  question: "What's your role?",
  type: "single",
  options: ["Engineer", "Designer", "Product", "Marketer", "Founder", "Investor", "Other"],
  rule: "complementary",
  weight: 0.35,
  required: true,
};

const D_INTERESTS_TECH: MatchDimension = {
  traitKey: "interests_tech",
  label: "Stack & interests",
  question: "What are you into? (pick a few)",
  type: "multi",
  options: [
    "Solana", "Rust", "TypeScript", "Frontend", "Backend",
    "AI / ML", "Infra / DevOps", "Crypto / DeFi", "Hardware",
    "Mobile", "Design systems", "Growth",
  ],
  rule: "similar",
  weight: 0.3,
  required: true,
  autofillFrom: ["bio_keywords", "previous_event"],
};

const D_SENIORITY: MatchDimension = {
  traitKey: "seniority",
  label: "Seniority",
  question: "How long have you been at this?",
  type: "single",
  options: ["Newcomer", "Active", "Veteran"],
  rule: "complementary",
  weight: 0.2,
  required: true,
  autofillFrom: ["reputation_bucket"],
};

const D_LOOKING_FOR: MatchDimension = {
  traitKey: "looking_for",
  label: "Why you're here",
  question: "What are you here for?",
  type: "single",
  options: ["Learn", "Hire / get hired", "Find collaborators", "Make friends", "Mentor others"],
  rule: "complementary",
  weight: 0.15,
  required: true,
};

// ---------- TEMPLATES ----------

export const MATCH_TEMPLATES: Record<string, MatchTemplate> = {
  tech: {
    id: "tech",
    name: "Tech meet-up",
    tagline: "Hackathons, dev events, builder rooms",
    intents: [
      { id: "default", label: "Open to anything" },
      {
        id: "learn",
        label: "Looking to learn",
        weightOverrides: { seniority: 0.4, interests_tech: 0.35, role_tech: 0.15, looking_for: 0.1 },
      },
      {
        id: "hire",
        label: "Hiring or getting hired",
        weightOverrides: { role_tech: 0.45, seniority: 0.3, interests_tech: 0.2, looking_for: 0.05 },
      },
      {
        id: "collab",
        label: "Find collaborators",
        weightOverrides: { interests_tech: 0.45, role_tech: 0.3, looking_for: 0.15, seniority: 0.1 },
      },
    ],
    dimensions: [D_ROLE_TECH, D_INTERESTS_TECH, D_SENIORITY, D_LOOKING_FOR],
  },

  founder: {
    id: "founder",
    name: "Founder dinner / VC mixer",
    tagline: "Operators, investors, and high-signal rooms",
    intents: [
      { id: "default", label: "Open to anything" },
      {
        id: "raising",
        label: "Raising",
        weightOverrides: { role_founder: 0.4, sector: 0.3, stage: 0.2, check_size: 0.1 },
      },
      {
        id: "investing",
        label: "Looking at deals",
        weightOverrides: { role_founder: 0.4, sector: 0.3, check_size: 0.2, stage: 0.1 },
      },
      {
        id: "operate",
        label: "Trading notes with operators",
        weightOverrides: { sector: 0.45, stage: 0.35, role_founder: 0.15, check_size: 0.05 },
      },
    ],
    dimensions: [
      {
        traitKey: "role_founder",
        label: "Role",
        question: "Which side of the table?",
        type: "single",
        options: ["Founder", "Investor", "Operator", "Advisor / Angel"],
        rule: "complementary",
        weight: 0.35,
        required: true,
      },
      {
        traitKey: "sector",
        label: "Sectors",
        question: "Which sectors do you focus on?",
        type: "multi",
        options: [
          "Crypto / Web3", "AI", "Fintech", "DevTools", "SaaS",
          "Consumer", "Healthcare", "Climate", "Hardware", "Marketplaces",
        ],
        rule: "similar",
        weight: 0.3,
        required: true,
        autofillFrom: ["bio_keywords", "previous_event"],
      },
      {
        traitKey: "stage",
        label: "Stage",
        question: "What stage are you at?",
        type: "single",
        options: ["Idea", "Pre-seed", "Seed", "Series A", "Series B+"],
        rule: "similar",
        weight: 0.2,
        required: true,
      },
      {
        traitKey: "check_size",
        label: "Check size / raise size",
        question: "If you're investing or raising, what range? (USD, in thousands)",
        type: "range",
        min: 0,
        max: 10000,
        rule: "mutual_filter",
        weight: 0.15,
        required: false,
      },
    ],
  },

  conference: {
    id: "conference",
    name: "Conference networking",
    tagline: "Generic floor matching for conferences",
    intents: [
      { id: "default", label: "Open to anything" },
      {
        id: "learn",
        label: "Soaking up knowledge",
        weightOverrides: { topics: 0.5, role_conf: 0.2, goal: 0.3 },
      },
      {
        id: "share",
        label: "Sharing what I've built",
        weightOverrides: { role_conf: 0.4, topics: 0.4, goal: 0.2 },
      },
    ],
    dimensions: [
      {
        traitKey: "topics",
        label: "Topics",
        question: "Which talks or topics interest you most?",
        type: "multi",
        options: [
          "Engineering", "Product", "Design", "Research",
          "Business", "Community", "Policy / Regulation", "Tooling",
        ],
        rule: "similar",
        weight: 0.5,
        required: true,
        autofillFrom: ["bio_keywords", "previous_event"],
      },
      {
        traitKey: "role_conf",
        label: "Role",
        question: "What do you do?",
        type: "single",
        options: ["Builder", "Researcher", "Operator", "Investor", "Press / Media", "Student", "Other"],
        rule: "complementary",
        weight: 0.3,
        required: true,
      },
      {
        traitKey: "goal",
        label: "Goal",
        question: "Why are you here?",
        type: "single",
        options: ["Learn", "Share", "Recruit", "Be recruited", "Just here for the vibes"],
        rule: "complementary",
        weight: 0.2,
        required: true,
      },
    ],
  },

  dating: {
    id: "dating",
    name: "Dating / social mixer",
    tagline: "Mutual-filter rules — both people must opt in",
    intents: [
      { id: "default", label: "Open to anything" },
      { id: "serious", label: "Looking for something serious" },
      { id: "casual", label: "Casual / friends" },
    ],
    dimensions: [
      {
        traitKey: "gender",
        label: "Your gender",
        question: "How do you identify?",
        type: "single",
        options: ["Woman", "Man", "Non-binary", "Prefer not to say"],
        rule: "filter",   // candidate must be in viewer's seeking set (paired with seeking_gender)
        weight: 0.25,
        required: true,
      },
      {
        traitKey: "seeking_gender",
        label: "Seeking",
        question: "Who do you want to meet?",
        type: "multi",
        options: ["Women", "Men", "Non-binary", "Anyone"],
        rule: "mutual_filter",
        weight: 0.25,
        required: true,
      },
      {
        traitKey: "age",
        label: "Your age",
        question: "How old are you?",
        type: "number",
        min: 18,
        max: 99,
        rule: "filter",
        weight: 0.1,
        required: true,
      },
      {
        traitKey: "age_range",
        label: "Age range you're open to",
        question: "What age range are you open to?",
        type: "range",
        min: 18,
        max: 99,
        rule: "mutual_filter",
        weight: 0.15,
        required: true,
      },
      {
        traitKey: "interests_general",
        label: "Interests",
        question: "What are you into?",
        type: "multi",
        options: [
          "Music", "Travel", "Food", "Books", "Fitness",
          "Movies", "Outdoors", "Art", "Gaming", "Tech",
        ],
        rule: "similar",
        weight: 0.15,
        required: true,
        autofillFrom: ["bio_keywords", "previous_event"],
      },
      {
        traitKey: "lifestyle",
        label: "Lifestyle",
        question: "How would you describe your lifestyle?",
        type: "single",
        options: ["Homebody", "Balanced", "Always out"],
        rule: "complementary",
        weight: 0.1,
        required: false,
      },
    ],
  },

  jobfair: {
    id: "jobfair",
    name: "Job fair / hiring event",
    tagline: "Candidates and recruiters — only opposite sides match",
    intents: [
      { id: "default", label: "Open to anything" },
    ],
    dimensions: [
      {
        traitKey: "side",
        label: "Side",
        question: "Are you hiring or looking?",
        type: "single",
        options: ["Candidate", "Recruiter"],
        rule: "filter", // engine treats `side` specially: must be opposite
        weight: 0.4,
        required: true,
      },
      {
        traitKey: "skills",
        label: "Skills / stack",
        question: "Which skills are involved?",
        type: "multi",
        options: [
          "Solana", "Rust", "TypeScript", "React", "Python",
          "Go", "Solidity", "ML / AI", "DevOps", "Mobile", "Design",
        ],
        rule: "similar",
        weight: 0.3,
        required: true,
        autofillFrom: ["bio_keywords", "previous_event"],
      },
      {
        traitKey: "experience_years",
        label: "Years of experience (you / role)",
        question: "Years of experience required (recruiter) or that you have (candidate)?",
        type: "number",
        min: 0,
        max: 30,
        rule: "mutual_filter",
        weight: 0.2,
        required: true,
      },
      {
        traitKey: "location_pref",
        label: "Location preference",
        question: "Remote, hybrid, or on-site?",
        type: "single",
        options: ["Remote", "Hybrid", "On-site"],
        rule: "similar",
        weight: 0.1,
        required: false,
      },
    ],
  },
};

export function getTemplate(id: string | null | undefined): MatchTemplate | null {
  if (!id) return null;
  return MATCH_TEMPLATES[id] ?? null;
}

export function listTemplates(): MatchTemplate[] {
  return Object.values(MATCH_TEMPLATES);
}

// Effective weights given an optional intent override.
export function effectiveWeights(template: MatchTemplate, intentId?: string | null): Record<string, number> {
  const base: Record<string, number> = Object.fromEntries(
    template.dimensions.map((d) => [d.traitKey, d.weight]),
  );
  if (!intentId || intentId === "default") return base;
  const intent = template.intents.find((i) => i.id === intentId);
  if (!intent?.weightOverrides) return base;
  return { ...base, ...intent.weightOverrides };
}
