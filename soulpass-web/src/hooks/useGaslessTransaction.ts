"use client";

import { useCallback } from "react";
import { useSignTransaction } from "@privy-io/react-auth/solana";
import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { connection, FEE_PAYER_PUBKEY, SOLANA_NETWORK } from "@/lib/solana";
import type { ConnectedStandardSolanaWallet } from "@privy-io/js-sdk-core";

export function useGaslessTransaction() {
  const { signTransaction } = useSignTransaction();

  const send = useCallback(
    async (params: {
      instructions: TransactionInstruction[];
      walletAddress: string;
      walletProvider: ConnectedStandardSolanaWallet;
    }) => {
      const userKey = new PublicKey(params.walletAddress);
      void userKey;

      const { blockhash } = await connection.getLatestBlockhash("confirmed");

      const message = new TransactionMessage({
        payerKey: FEE_PAYER_PUBKEY,
        recentBlockhash: blockhash,
        instructions: params.instructions,
      }).compileToV0Message();

      const tx = new VersionedTransaction(message);
      const serialized = tx.serialize();

      const { signedTransaction } = await signTransaction({
        transaction: serialized,
        wallet: params.walletProvider,
        chain: `solana:${SOLANA_NETWORK}` as const,
      });

      const res = await fetch("/api/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction: Buffer.from(signedTransaction).toString("base64"),
          versioned: true,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Relay failed");

      const sig: string = json.signature;
      const conf = await connection.confirmTransaction(sig, "confirmed");
      if (conf.value.err) {
        throw new Error("Transaction failed on-chain: " + JSON.stringify(conf.value.err));
      }
      return sig;
    },
    [signTransaction],
  );

  return { send };
}
