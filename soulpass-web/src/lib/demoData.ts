// DEMO scaffolding — shared between the organizer dashboard and the check-in
// page so a single screenshot/screencap reads consistently across both views.
// Everything in this file is local-only mock data: no chain calls, no DB
// writes. Safe to delete (and remove the imports) once the on-chain
// enumeration is reliable on the deployed RPC.

import type { RegistrationMetadata, RegistrationStatus, UserMetadata, UserTraits, StoredTraitValue } from "./eventMetaStore";

export type DemoAttendee = {
  name: string;
  address: string;
  reputation: number;
  status: RegistrationStatus;
  checkedIn: boolean;
  daysAgo: number;
};

export const DEMO_ATTENDEES: DemoAttendee[] = [
  { name: "Maya Chen", address: "Hh6kDw1jKpQNXfWVc8U8eRtJoZmS5xK2pYbA9rN4qVxF", reputation: 1240, status: "approved", checkedIn: true, daysAgo: 3 },
  { name: "Arjun Patel", address: "Bn5tFqW8nRz3yC4mLdXjvU7sJpQbAeRkY2hT9oWdGmKx", reputation: 920, status: "approved", checkedIn: true, daysAgo: 3 },
  { name: "Sofia Reyes", address: "Pq2WkR6nXcVbD8mF4tJyHsZ7L3eGuAoTpY5K1NhM9rBz", reputation: 760, status: "approved", checkedIn: false, daysAgo: 2 },
  { name: "Dmitri Volkov", address: "Tw3MfL9pXeBcN5kHzVjqU8RaSyKdGbAo1Y4P7hT2QnDx", reputation: 1580, status: "approved", checkedIn: true, daysAgo: 2 },
  { name: "Aisha Ndiaye", address: "Lr8KvJ4mWnRcD2pY5XeBqU7T3sFhAoZgN1bS9HtPkMyV", reputation: 640, status: "approved", checkedIn: false, daysAgo: 2 },
  { name: "Jules Martin", address: "Ze6BfP3nMkLcW8qY2VxRdU5THsJyAoG1bN4pS7KhTmDv", reputation: 510, status: "pending", checkedIn: false, daysAgo: 1 },
  { name: "Yuki Tanaka", address: "Cq9RtL5mWfXbN3pY8KhVdU4TJsZyAoG2bS1NhP7TkMxR", reputation: 1080, status: "approved", checkedIn: true, daysAgo: 1 },
  { name: "Noah Bergstrom", address: "Mp4VxR7nLcKbW9qY3FhUdT2SJsAoZyG5bN1pS8KhTmDr", reputation: 830, status: "approved", checkedIn: false, daysAgo: 1 },
  { name: "Leila Hassan", address: "Vt2HfP6mWnLcK8qY4RxBdU3TJsZyAoG1bN5pS9KhTmDx", reputation: 1390, status: "pending", checkedIn: false, daysAgo: 0 },
];

export type DemoParticipant = {
  eventAddress: string;
  attendeeAddress: string;
  status: RegistrationStatus;
  registeredAt: number;
  user: {
    authority: string;
    name: string;
    avatar: string;
    createdAt: number;
  };
  reputation: number;
  checkedIn: boolean;
};

export function buildDemoParticipants(eventAddress: string): DemoParticipant[] {
  const now = Date.now();
  return DEMO_ATTENDEES.map((d) => ({
    eventAddress,
    attendeeAddress: d.address,
    status: d.status,
    registeredAt: now - d.daysAgo * 24 * 60 * 60 * 1000,
    user: {
      authority: d.address,
      name: d.name,
      avatar: `https://api.dicebear.com/7.x/notionists-neutral/svg?seed=${d.address}&backgroundColor=B5FF1A`,
      createdAt: now - d.daysAgo * 24 * 60 * 60 * 1000,
    },
    reputation: d.reputation,
    checkedIn: d.checkedIn,
  }));
}

// =============================================================================
// Server-side demo augmentation for the AI matchmaker.
// =============================================================================
//
// Both /api/events/[address]/matches and /api/events/[address]/ai-match start
// from listRegistrations() (Supabase) + on-chain Registration PDAs to compute
// the checked-in candidate set. With no real attendees yet, the LLM has nobody
// to reason about and the demo falls flat.
//
// The helpers below let the routes "stage" demo attendees as checked-in with
// realistic traits/bios so the AI matchmaker actually produces a result during
// the demo. No chain calls happen for these synthetic wallets — the routes
// treat the demo set as a parallel, pre-resolved track.

// Personality profiles for each demo attendee. Trait keys cover every template
// in src/lib/matchTemplates.ts (tech / founder / conference / dating) so the
// matchmaker reads meaningful signal whichever template the event uses.
export const DEMO_TRAIT_PROFILES: Record<string, Record<string, StoredTraitValue>> = {
  // Maya Chen — Veteran Solana engineer hunting for protocol collaborators.
  "Hh6kDw1jKpQNXfWVc8U8eRtJoZmS5xK2pYbA9rN4qVxF": {
    role_tech: "Engineer",
    interests_tech: ["Solana", "Rust", "AI / ML"],
    seniority: "Veteran",
    looking_for: "Find collaborators",
    role_founder: "Founder",
    sector: "Crypto / DeFi",
    stage: "Seed",
    topics: ["Solana", "Rust"],
    role_conf: "Builder",
    goal: "Share",
  },
  // Arjun Patel — Founder, fintech/SaaS, seed-stage, recruiting.
  "Bn5tFqW8nRz3yC4mLdXjvU7sJpQbAeRkY2hT9oWdGmKx": {
    role_tech: "Founder",
    interests_tech: ["TypeScript", "AI / ML", "Frontend"],
    seniority: "Active",
    looking_for: "Hire / get hired",
    role_founder: "Founder",
    sector: "Fintech",
    stage: "Seed",
    topics: ["AI", "Product"],
    role_conf: "Builder",
    goal: "Recruit",
  },
  // Sofia Reyes — Mid-career consumer designer, here to learn.
  "Pq2WkR6nXcVbD8mF4tJyHsZ7L3eGuAoTpY5K1NhM9rBz": {
    role_tech: "Designer",
    interests_tech: ["Design systems", "Frontend", "AI / ML"],
    seniority: "Active",
    looking_for: "Learn",
    role_founder: "Operator",
    sector: "Consumer",
    topics: ["Product", "Research"],
    role_conf: "Builder",
    goal: "Learn",
  },
  // Dmitri Volkov — Veteran infra engineer, mentor energy.
  "Tw3MfL9pXeBcN5kHzVjqU8RaSyKdGbAo1Y4P7hT2QnDx": {
    role_tech: "Engineer",
    interests_tech: ["Infra / DevOps", "Rust", "Go"],
    seniority: "Veteran",
    looking_for: "Mentor others",
    role_founder: "Advisor / Angel",
    sector: "DevTools",
    topics: ["Infra", "Research"],
    role_conf: "Operator",
    goal: "Share",
  },
  // Aisha Ndiaye — Newcomer mobile engineer with climate focus.
  "Lr8KvJ4mWnRcD2pY5XeBqU7T3sFhAoZgN1bS9HtPkMyV": {
    role_tech: "Engineer",
    interests_tech: ["Mobile", "TypeScript", "AI / ML"],
    seniority: "Newcomer",
    looking_for: "Make friends",
    role_founder: "Operator",
    sector: "Climate",
    topics: ["Product", "Community"],
    role_conf: "Student",
    goal: "Learn",
  },
  // Jules Martin — Investor hunting crypto founders.
  "Ze6BfP3nMkLcW8qY2VxRdU5THsJyAoG1bN4pS7KhTmDv": {
    role_tech: "Investor",
    interests_tech: ["Crypto / DeFi", "Crypto / Web3", "AI / ML"],
    seniority: "Veteran",
    looking_for: "Hire / get hired",
    role_founder: "Investor",
    sector: "Crypto / DeFi",
    stage: "Pre-seed",
    check_size: "$50k–$250k",
    topics: ["Policy / Regulation", "Research"],
    role_conf: "Investor",
    goal: "Be recruited",
  },
  // Yuki Tanaka — Product lead, AI/SaaS, looking for cofounders.
  "Cq9RtL5mWfXbN3pY8KhVdU4TJsZyAoG2bS1NhP7TkMxR": {
    role_tech: "Product",
    interests_tech: ["AI / ML", "TypeScript", "Frontend"],
    seniority: "Active",
    looking_for: "Find collaborators",
    role_founder: "Founder",
    sector: "SaaS",
    stage: "Pre-seed",
    topics: ["AI", "Product"],
    role_conf: "Builder",
    goal: "Recruit",
  },
  // Noah Bergstrom — Mid-career crypto engineer, sharing energy.
  "Mp4VxR7nLcKbW9qY3FhUdT2SJsAoZyG5bN1pS8KhTmDr": {
    role_tech: "Engineer",
    interests_tech: ["Solana", "Crypto / DeFi", "Rust"],
    seniority: "Active",
    looking_for: "Find collaborators",
    role_founder: "Operator",
    sector: "Crypto / DeFi",
    topics: ["Solana", "Research"],
    role_conf: "Builder",
    goal: "Share",
  },
  // Leila Hassan — Veteran operator, climate/health, hiring.
  "Vt2HfP6mWnLcK8qY4RxBdU3TJsZyAoG1bN5pS9KhTmDx": {
    role_tech: "Other",
    interests_tech: ["AI / ML", "Healthcare", "Climate"],
    seniority: "Veteran",
    looking_for: "Hire / get hired",
    role_founder: "Operator",
    sector: "Healthcare",
    topics: ["Policy / Regulation", "Product"],
    role_conf: "Operator",
    goal: "Recruit",
  },
};

// One-line bios for the LLM's prompt context — short, evocative, on-brand.
export const DEMO_BIOS: Record<string, string> = {
  "Hh6kDw1jKpQNXfWVc8U8eRtJoZmS5xK2pYbA9rN4qVxF": "Solana engineer · shipped 3 protocols · looking for ML-curious cofounder.",
  "Bn5tFqW8nRz3yC4mLdXjvU7sJpQbAeRkY2hT9oWdGmKx": "Founder · seed-stage fintech · hiring senior engineers in NYC.",
  "Pq2WkR6nXcVbD8mF4tJyHsZ7L3eGuAoTpY5K1NhM9rBz": "Product designer · ex-consumer · obsessed with onboarding flows.",
  "Tw3MfL9pXeBcN5kHzVjqU8RaSyKdGbAo1Y4P7hT2QnDx": "Infra engineer · 10y at scale · always up for a debugging story.",
  "Lr8KvJ4mWnRcD2pY5XeBqU7T3sFhAoZgN1bS9HtPkMyV": "Mobile engineer · ex-React Native · building climate tools, first event.",
  "Ze6BfP3nMkLcW8qY2VxRdU5THsJyAoG1bN4pS7KhTmDv": "Investor · pre-seed crypto · $50–250k checks · ex-founder.",
  "Cq9RtL5mWfXbN3pY8KhVdU4TJsZyAoG2bS1NhP7TkMxR": "Product lead · AI/SaaS · looking for a technical cofounder this quarter.",
  "Mp4VxR7nLcKbW9qY3FhUdT2SJsAoZyG5bN1pS8KhTmDr": "Crypto engineer · Solana validator ops · here to swap notes.",
  "Vt2HfP6mWnLcK8qY4RxBdU3TJsZyAoG1bN5pS9KhTmDx": "Operator · climate × health · scaling a 40-person team.",
};

const TRAIT_SOURCE_NOW = () => Date.now();

export type DemoRegistrationBundle = {
  registration: RegistrationMetadata;
  user: UserMetadata;
  traits: UserTraits;
  profile: {
    reputation: number;
    eventsAttended: number;
    connectionsMade: number;
    badgesEarned: number;
  };
  checkedIn: boolean;
};

export function buildDemoRegistrationBundles(eventAddress: string): DemoRegistrationBundle[] {
  const now = TRAIT_SOURCE_NOW();
  return DEMO_ATTENDEES.map((d) => {
    const traitMap = DEMO_TRAIT_PROFILES[d.address] ?? {};
    const traits: UserTraits = {};
    for (const [k, v] of Object.entries(traitMap)) {
      traits[k] = { value: v, source: "user", updatedAt: now - d.daysAgo * 60 * 1000 };
    }
    return {
      registration: {
        eventAddress,
        attendeeAddress: d.address,
        status: d.status,
        registeredAt: now - d.daysAgo * 24 * 60 * 60 * 1000,
      },
      user: {
        authority: d.address,
        name: d.name,
        avatar: `https://api.dicebear.com/7.x/notionists-neutral/svg?seed=${d.address}&backgroundColor=B5FF1A`,
        bio: DEMO_BIOS[d.address],
        createdAt: now - (d.daysAgo + 30) * 24 * 60 * 60 * 1000,
      },
      traits,
      profile: {
        reputation: d.reputation,
        eventsAttended: Math.max(1, Math.floor(d.reputation / 200)),
        connectionsMade: Math.max(0, Math.floor(d.reputation / 80)),
        badgesEarned: Math.max(0, Math.floor(d.reputation / 300)),
      },
      // For the matchmaker demo, every approved attendee is "checked in" so
      // the LLM has bodies to reason over. The dashboard/check-in pages
      // independently maintain their own checkedIn state for the click-in flow.
      checkedIn: d.status === "approved",
    };
  });
}

export function isDemoWallet(addr: string): boolean {
  return addr in DEMO_TRAIT_PROFILES;
}
