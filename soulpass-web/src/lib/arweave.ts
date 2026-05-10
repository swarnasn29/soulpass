// Server-only — Irys-backed permanent storage on Arweave.
//
// We bundle uploads through Irys (formerly Bundlr) and pay with SOL from the
// SoulPass fee-payer wallet. This keeps SoulPass fully Solana-native: no extra
// wallet to fund, no AR to acquire. Files < 100KB are free on Irys; larger
// payloads draw down the fee-payer's SOL via prepaid Irys credits.
//
// Public API is unchanged (uploadBytes, uploadJson, gatewayUrlFor) so call
// sites in /api/upload, /api/events, etc. don't need to know we swapped the
// backend.

import "server-only";
import { Uploader } from "@irys/upload";
import { Solana } from "@irys/upload-solana";
import bs58 from "bs58";
import BigNumber from "bignumber.js";

const NETWORK = (process.env.IRYS_NETWORK ?? "devnet").toLowerCase() as "devnet" | "mainnet";
const SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

// Irys gateway is canonical for fetching uploads — also accessible at
// arweave.net once mainnet uploads finalize on L1 Arweave.
const GATEWAY = (process.env.NEXT_PUBLIC_IRYS_GATEWAY || "https://gateway.irys.xyz").replace(
  /\/+$/,
  "",
);

// Build a base58 secret-key string from FEE_PAYER_SECRET_KEY which the env may
// hold either as base58 OR as a JSON byte array (Solana CLI keypair format).
// Irys-Solana wants a base58-encoded private key.
function feePayerSecretBase58(): string {
  const raw = process.env.FEE_PAYER_SECRET_KEY;
  if (!raw) throw new Error("FEE_PAYER_SECRET_KEY is not set — required for Irys uploads.");
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    const bytes = Uint8Array.from(JSON.parse(trimmed));
    return bs58.encode(bytes);
  }
  return trimmed;
}

// Cached client. The Irys Solana token client is heavy to construct (loads a
// Solana RPC connection + signer), so build it once per process.
let cached: Awaited<ReturnType<ReturnType<typeof Uploader>["withWallet"]>> | null = null;

async function getIrys() {
  if (cached) return cached;
  const builder = Uploader(Solana).withWallet(feePayerSecretBase58()).withRpc(SOLANA_RPC);
  const built = await (NETWORK === "mainnet" ? builder.mainnet() : builder.devnet());
  cached = built;
  return built;
}

export type ArweaveTag = { name: string; value: string };

export type ArweaveUploadResult = {
  txId: string;
  url: string;
  arUri: string; // ar://<txId> — durable, gateway-agnostic reference for on-chain pointers
  contentType: string;
  size: number;
};

const STANDARD_TAGS: ArweaveTag[] = [
  { name: "App-Name", value: "SoulPass" },
  { name: "App-Version", value: "1" },
];

// Irys treats anything ≤ FREE_TIER_BYTES as free — no funding needed.
const FREE_TIER_BYTES = 100 * 1024;

// When we DO need to fund, top up enough lamports for ~50 future uploads of
// the same size so we're not paying a fund-tx per upload. Floor at 0.005 SOL
// so trivial uploads don't trigger a fund every time we drain to dust.
const FUND_HEADROOM = 50;
const MIN_FUND_LAMPORTS = 5_000_000; // 0.005 SOL
// Hard ceiling — never auto-fund more than 0.05 SOL in one shot regardless
// of file size. Larger uploads should be funded manually via fundIrys().
const MAX_AUTO_FUND_LAMPORTS = 50_000_000; // 0.05 SOL

// Single-flight lock so concurrent uploads don't each fire a fund tx.
let fundingInFlight: Promise<void> | null = null;

async function ensureFunded(byteLength: number): Promise<void> {
  if (byteLength <= FREE_TIER_BYTES) return;

  const irys = await getIrys();
  const price: BigNumber = await irys.getPrice(byteLength);
  const loaded: BigNumber = await irys.getLoadedBalance();
  if (loaded.gte(price)) return;

  if (fundingInFlight) {
    await fundingInFlight;
    // After waiting, re-check — another concurrent upload may have funded enough.
    const again = await irys.getLoadedBalance();
    if (again.gte(price)) return;
  }

  fundingInFlight = (async () => {
    try {
      const headroom = price.multipliedBy(FUND_HEADROOM);
      const target = BigNumber.max(headroom, new BigNumber(MIN_FUND_LAMPORTS));
      const capped = BigNumber.min(target, new BigNumber(MAX_AUTO_FUND_LAMPORTS));
      // Subtract whatever's already loaded so we don't over-fund.
      const toFund = BigNumber.max(capped.minus(loaded), price.minus(loaded));
      if (toFund.lte(0)) return;

      console.log(
        `[storage] auto-funding Irys: ${toFund.toString()} lamports for ${byteLength}B upload (price=${price.toString()}, loaded=${loaded.toString()})`,
      );
      try {
        await irys.fund(toFund);
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        if (/insufficient|0x1\b|not enough/i.test(msg)) {
          throw new Error(
            `Server fee-payer wallet has insufficient SOL to sponsor this upload (needed ${toFund.toString()} lamports). Top up ${process.env.NEXT_PUBLIC_FEE_PAYER_PUBKEY ?? "the fee-payer wallet"} on ${process.env.IRYS_NETWORK ?? "devnet"}.`,
          );
        }
        throw e;
      }
    } finally {
      fundingInFlight = null;
    }
  })();

  await fundingInFlight;
}

export async function uploadBytes(
  data: Uint8Array,
  contentType: string,
  tags: ArweaveTag[] = [],
): Promise<ArweaveUploadResult> {
  await ensureFunded(data.byteLength);

  const irys = await getIrys();
  const allTags: ArweaveTag[] = [
    { name: "Content-Type", value: contentType },
    ...STANDARD_TAGS,
    ...tags,
  ];
  const buf = Buffer.from(data);

  // One retry path: if Irys still 402s right after we funded (balance not
  // reflected yet), wait briefly and retry once.
  try {
    const receipt = await irys.upload(buf, { tags: allTags });
    return {
      txId: receipt.id,
      url: `${GATEWAY}/${receipt.id}`,
      arUri: `ar://${receipt.id}`,
      contentType,
      size: data.byteLength,
    };
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (!/402|not enough balance/i.test(msg)) throw e;
    await new Promise((r) => setTimeout(r, 1500));
    await ensureFunded(data.byteLength);
    const receipt = await irys.upload(buf, { tags: allTags });
    return {
      txId: receipt.id,
      url: `${GATEWAY}/${receipt.id}`,
      arUri: `ar://${receipt.id}`,
      contentType,
      size: data.byteLength,
    };
  }
}

export async function uploadJson(value: unknown, tags: ArweaveTag[] = []): Promise<ArweaveUploadResult> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return uploadBytes(bytes, "application/json", tags);
}

export function gatewayUrlFor(arUriOrTxId: string): string {
  if (!arUriOrTxId) return "";
  if (arUriOrTxId.startsWith("ar://")) return `${GATEWAY}/${arUriOrTxId.slice(5)}`;
  if (arUriOrTxId.startsWith("http")) return arUriOrTxId;
  return `${GATEWAY}/${arUriOrTxId}`;
}

// Diagnostics — used by /api/storage/status and dev scripts to surface state.

export type StorageStatus = {
  network: "devnet" | "mainnet";
  bundlerAddress: string;
  loadedBalanceLamports: string;
  loadedBalanceSol: string;
  freeUnder100KB: boolean;
};

export async function getStorageStatus(): Promise<StorageStatus> {
  const irys = await getIrys();
  const bal = await irys.getLoadedBalance();
  return {
    network: NETWORK,
    bundlerAddress: irys.address ?? "(unknown)",
    loadedBalanceLamports: bal.toString(),
    // SOL has 9 decimals; format for display.
    loadedBalanceSol: (Number(bal.toString()) / 1e9).toFixed(6),
    freeUnder100KB: true,
  };
}

// Fund Irys with the given lamports drawn from the fee-payer wallet. Returns
// the funding tx id. Optional convenience for ops scripts.
export async function fundIrys(lamports: number): Promise<{ id: string; quantity: string }> {
  const irys = await getIrys();
  const r = await irys.fund(lamports);
  return { id: r.id, quantity: r.quantity.toString() };
}
