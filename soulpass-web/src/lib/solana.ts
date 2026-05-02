import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

export const SOLANA_NETWORK = "devnet";

export const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(SOLANA_NETWORK);

export const SOULPASS_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_SOULPASS_PROGRAM_ID ||
    "6oxNy4uApzwXVKAREsgxSGCSfjpCkRYFCz5aitVTkTyi",
);

export const FEE_PAYER_PUBKEY = new PublicKey(
  process.env.NEXT_PUBLIC_FEE_PAYER_PUBKEY ||
    "B3z8anU87cVhswHMbsntFTYjM27gkqefczQzJPrNavtv",
);

export const connection = new Connection(RPC_URL, "confirmed");

export function explorer(addressOrSig: string, kind: "tx" | "address" = "address") {
  const path = kind === "tx" ? "tx" : "address";
  return `https://explorer.solana.com/${path}/${addressOrSig}?cluster=${SOLANA_NETWORK}`;
}
