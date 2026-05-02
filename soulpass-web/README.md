# SoulPass — Web

Next.js 16 + Privy + Solana web app for SoulPass. The reputation layer for real-world communities.

## Quick start

```bash
npm install
cp .env.example .env.local
# Add your NEXT_PUBLIC_PRIVY_APP_ID and FEE_PAYER_SECRET_KEY
npm run dev
```

Open http://localhost:3000.

## Environment

| Variable | Where it's used | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Client — Privy auth | Yes for auth |
| `NEXT_PUBLIC_SOULPASS_PROGRAM_ID` | Client — program ID | Defaults to deployed |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Client + server — RPC endpoint | Defaults to public devnet |
| `NEXT_PUBLIC_FEE_PAYER_PUBKEY` | Client — sets `transaction.feePayer` | Yes |
| `FEE_PAYER_SECRET_KEY` | **Server only** — relay cosigns + broadcasts | Yes |

`FEE_PAYER_SECRET_KEY` accepts either a base58 string or a JSON byte array (Solana CLI keypair format).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Next.js app (client)                                            │
│  • Privy social login → invisible Solana wallet (TEE-backed)    │
│  • Builds VersionedTransaction with feePayer = SoulPass server  │
│  • User wallet signs instructions only                          │
└────────────────────────────┬────────────────────────────────────┘
                             │ POST /api/relay { txn base64 }
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Relay (Next.js API route, Node runtime)                         │
│  • Whitelists program IDs (SoulPass + System + ComputeBudget)   │
│  • Per-IP rate limit                                            │
│  • Validates fee payer matches our server wallet                │
│  • Cosigns as feePayer and broadcasts via Helius/devnet RPC     │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Solana program (deployed on devnet)                             │
│  Program ID: 6oxNy4uApzwXVKAREsgxSGCSfjpCkRYFCz5aitVTkTyi        │
│  • UserProfile / Event / Registration / Connection / Rating /   │
│    Badge — all PDAs, no centralized state                       │
└─────────────────────────────────────────────────────────────────┘
```

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Marketing landing |
| `/onboarding` | Pick handle → init `UserProfile` PDA |
| `/discover` | Browse events, see your reputation |
| `/events/new` | Organizer creates an event |
| `/events/[address]` | Event detail + register/cancel |
| `/events/[address]/check-in` | Organizer scans attendees |
| `/scan` | Show your QR + scan others to record connections |
| `/profile` | Your rep, badges, sharable QR |
| `/u/[wallet]` | Public profile (server-rendered) |

## On-chain instructions (all gasless)

All user-initiated transactions are routed through `/api/relay` with the SoulPass server wallet as fee payer:

- `initialize_user(name, metadata_uri)`
- `update_user_profile(name?, metadata_uri?)`
- `create_event(event_id, title, description, metadata_uri, start_ts, end_ts, capacity)`
- `register_for_event` / `cancel_registration`
- `check_in` (organizer signs)
- `record_connection` (one of the two participants signs; the other only needs to be checked-in)
- `submit_rating(helpfulness, knowledge, vibe, reliability)`
- `mark_no_show` (backend crank, after end + 6h grace)
- `award_event_badge(kind)` / `award_lifetime_badge(kind)`

## Build

```bash
npm run build && npm run start
```

For Vercel: set the env vars listed above in the project settings. The relay needs the secret key, so use a server-only environment variable (no `NEXT_PUBLIC_` prefix).

## Contracts

The Anchor program lives in `../soulpass-program`. Build & redeploy from there:

```bash
cd ../soulpass-program
cargo build-sbf
solana program deploy \
  target/deploy/soulpass.so \
  -k ../soulpass-web/payer-keypair.json \
  --program-id target/deploy/soulpass-keypair.json \
  --url https://api.devnet.solana.com
```

If you change the deployed program ID, update both `Anchor.toml` and `NEXT_PUBLIC_SOULPASS_PROGRAM_ID`.
