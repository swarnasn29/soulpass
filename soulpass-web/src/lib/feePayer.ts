import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

let cached: Keypair | null = null;

export function getFeePayer(): Keypair {
  if (cached) return cached;

  const secret = process.env.FEE_PAYER_SECRET_KEY;
  if (!secret) {
    throw new Error(
      "FEE_PAYER_SECRET_KEY is not set on the server. The relay needs it to cosign and broadcast.",
    );
  }

  // Accept either base58 or JSON array (Solana CLI keypair format).
  let keyBytes: Uint8Array;
  if (secret.trim().startsWith("[")) {
    keyBytes = Uint8Array.from(JSON.parse(secret));
  } else {
    keyBytes = bs58.decode(secret);
  }

  cached = Keypair.fromSecretKey(keyBytes);
  return cached;
}
