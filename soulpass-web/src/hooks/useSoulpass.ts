"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { PublicKey } from "@solana/web3.js";
import { connection } from "@/lib/solana";
import { userPda } from "@/lib/pda";
import { decodeUserProfile, type UserProfile } from "@/lib/program";
import type { UserMetadata } from "@/lib/eventMetaStore";

export type SoulpassUser = {
  authority: string;
  privyEmail?: string;
  meta: UserMetadata | null;
  onchain: UserProfile | null;
};

export function useSoulpass() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];

  const [meta, setMeta] = useState<UserMetadata | null>(null);
  const [onchain, setOnchain] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    try {
      const authority = wallet.address;
      const [metaResp, profile] = await Promise.all([
        fetch(`/api/users/${authority}`)
          .then((r) => r.json())
          .then((j) => j.user as UserMetadata | null)
          .catch(() => null),
        (async () => {
          const [profilePda] = userPda(new PublicKey(authority));
          const acct = await connection.getAccountInfo(profilePda);
          return acct ? decodeUserProfile(acct.data) : null;
        })(),
      ]);
      setMeta(metaResp);
      setOnchain(profile);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated || !wallet) {
      const id = setTimeout(() => setLoading(false), 0);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [ready, authenticated, wallet, refresh]);

  const data: SoulpassUser | null = useMemo(() => {
    if (!wallet) return null;
    return {
      authority: wallet.address,
      privyEmail: user?.email?.address,
      meta,
      onchain,
    };
  }, [wallet, user, meta, onchain]);

  return {
    ready,
    authenticated,
    wallet,
    data,
    loading,
    refresh,
    isOnboarded: !!meta && !!onchain,
  };
}
