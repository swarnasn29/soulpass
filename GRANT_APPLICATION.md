# SoulPass — Agentic Engineering Grant Application

**Submit at**: https://superteam.fun/earn/grants/agentic-engineering
**Grant amount**: 200 USDG (fixed)

---

## Step 1: Basics

**Project Title**
> SoulPass

**One Line Description**
> The reputation layer for real-world communities — turning every event attendance and every handshake into permanent, on-chain proof of who you are as a networker.

**TG username**
> t.me/Swarn2003

**Wallet Address**
> 6N8aKqw63SSX9zr2RtmCVgHYcvHSYxoNfxgnkLQJsufH

---

## Step 2: Details

**Project Details**
> **The problem.** Real-world networking has no portable proof. Show up to 50 meetups, shake 200 hands, mentor 30 founders — and you walk away with a stack of business cards and a LinkedIn graph that can't tell a recruiter, a DAO, or a grant reviewer who actually knows you. Existing "proof-of-attendance" NFTs solve a tiny slice (one mint per event) and ignore the harder primitives: who you connected with, how peers rated you, and whether your reputation compounds across communities.
>
> **The solution.** SoulPass turns every event into a self-contained reputation event on Solana. Organizers create an event PDA. Attendees register, get checked in, scan each other's QR codes to record on-chain connection PDAs (sharded by sorted pubkey pair, so each handshake is a unique account), and rate each other on four axes after. Soul-bound badges drop automatically. A signed `i64` reputation score updates in real time using transparent on-program rules: +500 starting, +10 check-in, +5 per connection, ±25 no-show penalty, +15 per badge, 0–2 from peer ratings.
>
> **Why it can ship to non-crypto users.** Users never see the words *wallet*, *gas*, *seed phrase*, or *transaction*. They sign in with Google → Privy issues a TEE-backed embedded Solana wallet → the user signs only the instruction, our server cosigns as `feePayer` and broadcasts. Same security model as Pump.fun and Jupiter. At ~$0.003/check-in, **10,000 active users × 2 events/mo × 8 txns ≈ $320/mo total infra cost** — sponsoring gas is structurally cheap.
>
> **What the grant funds.** The 200 USDG covers Claude Pro + Codex subscriptions through the Colosseum Frontier 2026 submission window (May 11, 2026) and the first month of operations. SoulPass has been built almost entirely with agent-driven engineering — the entire on-chain program (5 PDAs, 7 instructions) and the Next.js 16 + Privy frontend were architected, written, and debugged inside Claude Code and Codex sessions. Continuing that workflow is what makes a 1-person team competitive against accelerator-backed cohorts.

**Deadline**
> May 11, 2026 (Asia/Kolkata) — Colosseum Frontier 2026 submission

**Proof of Work**
> - **Live on Solana devnet**: program ID `6oxNy4uApzwXVKAREsgxSGCSfjpCkRYFCz5aitVTkTyi` ([explorer](https://explorer.solana.com/address/6oxNy4uApzwXVKAREsgxSGCSfjpCkRYFCz5aitVTkTyi?cluster=devnet))
> - **GitHub repo**: https://github.com/swarnasn29/soulpass
> - **Architecture**: 5 PDA types (UserProfile, Event, Registration, Connection, Rating, Badge), single Anchor program in Rust, Next.js 16 + React 19 frontend, Privy embedded wallets with server-side cosigning relay at `/api/relay`
> - **Recent shipping velocity** (4 commits, last 3 days): full on-chain deploy, frontend scaffold, architecture restructure, repo flatten — all visible in git log
> - **Design system shipped**: brand.md + Figma file (`SoulPass.fig`) + Tailwind 4 + custom typography wired
> - **Strategic doc**: `SOULPASS_Scalable_Launch_Plan.docx` covering go-to-market, partner events, and economics
> - **Cost-engineered**: sub-$0.01 per user action, ~$320/mo infra at 10K MAU
> - **Market gap**: Colosseum Copilot's nearest-matching ML cluster ("NFT-Based Event Ticketing Platforms") shows **0 hackathon winners across 70 projects** — large unsolved space, no incumbent
> - **AI-native build**: full Claude Code + Codex session transcripts attached as proof of agentic-engineering workflow

**Personal X Profile**
> x.com/swarnasn29

**Personal GitHub Profile**
> github.com/swarnasn29

**Colosseum Crowdedness Score**
> ⚠️ **Action required**: SoulPass is not yet submitted to Colosseum, so the Copilot UI can't render an official score for it. Two paths:
> - **Recommended**: Submit SoulPass on https://arena.colosseum.org first, then visit https://copilot.colosseum.com → search "SoulPass" → screenshot the Crowdedness panel → upload to Google Drive (anyone-with-link) → paste the public link here.

**AI Session Transcript**
> Two files exported to project root — attach **both** to demonstrate cross-tool agentic workflow:
> - `./claude-session.jsonl` (Claude Code session)
> - `./codex-session.jsonl` (Codex session)

https://drive.google.com/file/d/16Yq_MIg6bPPZR4g0-9mFByi6lT6_Riiz/view?usp=sharing
---

## Step 3: Milestones

**Goals and Milestones**
> - **M1 — May 4, 2026**: program deployed; fee-payer wallet funded with 0.5 SOL; `/api/relay` whitelist gated to program ID.
> - **M2 — May 6, 2026**: First partner event signed (Bangalore Solana meetup or equivalent); end-to-end flow tested with ≥10 real users (onboarding → event create → check-in → 5 connections → rating).
> - **M3 — May 8, 2026**: Public beta opened; `/discover`, `/events/[address]`, `/scan`, `/profile`, `/u/[wallet]` all live with <100ms p95 sign-and-broadcast latency.
> - **M4 — May 10, 2026**: 5 partner events booked for post-launch (May–June 2026); 200+ unique `UserProfile` PDAs minted; landing page CTA + waitlist funnel live.
> - **M5 — May 11, 2026**: Colosseum Frontier 2026 submission complete (code, demo video, deck, Colosseum project page); 500+ on-chain `Connection` PDAs as judging-window proof.

**Primary KPI**
> **100 unique on-chain `Connection` PDAs created on devnet between launch and the Colosseum Frontier judging deadline (May 11, 2026).**
>
> Why this metric: Each `Connection` PDA is a sharded handshake account (`["conn", event, lo, hi]`) that requires two distinct authenticated users to scan each other's QR — it cannot be self-farmed and each one costs the server real SOL, so the number is structurally honest. 500 connections implies ≥10 real-world events with healthy attendee-to-attendee mixing, which simultaneously proves **(a)** product-market fit, **(b)** the partnership pipeline is real, and **(c)** the gasless UX actually clears the friction it claims to clear.

**Final Tranche Reminder** ✅
> To unlock the final tranche, submit:
> - Colosseum project link (after submission to https://arena.colosseum.org)
> - GitHub repo link (https://github.com/swarnasn29/soulpass)
> - AI subscription receipt (Claude Pro + Codex)

---

## Pre-submission checklist

- [x] `claude-session.jsonl` exported to project root (`./claude-session.jsonl`)
- [x] `codex-session.jsonl` exported to project root (`./codex-session.jsonl`)
- [ ] **Submit SoulPass to Colosseum** at https://arena.colosseum.org (so the Copilot Crowdedness panel exists)
- [X] Both session `.jsonl` files attached to the form's transcript field
- [X] Final review of Project Details + Milestones text above

**Submit at**: https://superteam.fun/earn/grants/agentic-engineering
