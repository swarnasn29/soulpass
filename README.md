# SoulPass

> **Web2 simplicity. Web3 permanence.**
> The reputation layer for real-world communities — turning every event attendance and every handshake into permanent, on-chain proof of who you are as a networker.

Built on Solana. Submission target: **Colosseum Frontier 2026**.

## What's in here

```
soulpass/
├── soulpass-program/      # Anchor (Rust) — all on-chain logic
└── soulpass-web/          # Next.js 16 + Privy — user-facing app
```

### Live deployment

- **Devnet program ID**: `6oxNy4uApzwXVKAREsgxSGCSfjpCkRYFCz5aitVTkTyi`
- **Fee payer wallet**: `B3z8anU87cVhswHMbsntFTYjM27gkqefczQzJPrNavtv` (server-side only — pays SOL on every user action)

## The non-negotiable UX vision

Users **never** see the words *wallet*, *gas*, *seed phrase*, or *transaction*.

| ❌ Status quo | ✅ SoulPass |
| --- | --- |
| Install Phantom | Sign in with Google |
| Back up seed phrase | None — Privy TEE-backed embedded wallet |
| Buy SOL for gas | Zero gas (we sponsor every action) |
| Approve every popup | Invisible signing, sub-100ms |
| "Mint an NFT" | "You earned a badge!" |

## Architecture

```
┌────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│  Privy embedded    │    │  /api/relay         │    │  Solana devnet      │
│  Solana wallet     │ →  │  (Next.js API,      │ →  │  SoulPass program   │
│  (TEE, no popup)   │    │   whitelist + cosign│    │  (5 PDAs, 1 program)│
└────────────────────┘    └─────────────────────┘    └─────────────────────┘
       client                  server                    on-chain
```

The user wallet signs only the **instructions**. The SoulPass server wallet signs as `feePayer` and broadcasts. Same security model as Pump.fun and Jupiter.

## On-chain primitives

All accounts are PDAs — there is no centralized DB for reputation, attendance, badges, or connections.

| PDA | Seeds | Holds |
| --- | --- | --- |
| `UserProfile` | `["user", authority]` | name, metadata URI, reputation (signed i64), counters |
| `Event` | `["event", organizer, event_id_le]` | title, time window, capacity, counters, status |
| `Registration` | `["reg", event, attendee]` | proof of registration, check-in flag, no-show flag |
| `Connection` | `["conn", event, lo, hi]` | sharded handshake record (lo/hi = sorted pubkeys) |
| `Rating` | `["rate", event, rater, ratee]` | 4-axis peer rating |
| `Badge` (event) | `["badge-evt", owner, event, kind]` | event-bound soul-bound badge |
| `Badge` (lifetime) | `["badge-life", owner, kind]` | lifetime soul-bound badge |

Reputation rules (program constants):

- New profile: **+500** starting rep
- Check-in: **+10**
- Connection: **+5** each side
- Peer rating: **0–2** based on average
- Badge earned: **+15**
- No-show penalty: **−25**

## Quick start (web app)

```bash
cd soulpass-web
npm install
cp .env.example .env.local
# Edit .env.local — set NEXT_PUBLIC_PRIVY_APP_ID and FEE_PAYER_SECRET_KEY
npm run dev
```

See [`soulpass-web/README.md`](soulpass-web/README.md) for full env + routes documentation.

## Quick start (program)

```bash
cd soulpass-program
cargo build-sbf
solana program deploy \
  target/deploy/soulpass.so \
  -k ../soulpass-web/payer-keypair.json \
  --program-id target/deploy/soulpass-keypair.json \
  --url https://api.devnet.solana.com
```

> **Note:** `cargo build-sbf` is preferred over `anchor build` for this workspace because Anchor 0.32's IDL safety check is incompatible with the bundled Rust 1.79 SBF toolchain. The program compiles fine with `anchor-lang = "0.30.1"` and the IDL feature disabled.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Marketing landing |
| `/onboarding` | Pick handle → init `UserProfile` PDA |
| `/discover` | Browse events, see your rep |
| `/events/new` | Organizer creates an event |
| `/events/[address]` | Event detail + register/cancel |
| `/events/[address]/check-in` | Organizer scans attendees |
| `/scan` | Show your QR + scan others to record connections |
| `/profile` | Your rep, badges, sharable QR |
| `/u/[wallet]` | Public profile (server-rendered) |

## Cost economics

Everything is gasless to users. Server pays:

| Action | SOL cost | USD @ $150/SOL |
| --- | --- | --- |
| Register / cancel | ~0.000005 | $0.00075 |
| Check-in | ~0.00002 | $0.003 |
| Connection | ~0.000005 | $0.00075 |
| Rating | ~0.000005 | $0.00075 |

At 10,000 active users × 2 events/mo × 8 txns: **~$320/mo total infrastructure cost.**

## License

MIT. Logo and brand mark from the SoulPass design (see `SoulPass.fig`).
