"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { RPC_URL, SOLANA_NETWORK } from "./solana";

export default function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";

  if (!appId) {
    // Render children without Privy when not configured (so the marketing page still loads).
    return <>{children}</>;
  }

  const wsUrl = RPC_URL.replace(/^https?/, RPC_URL.startsWith("https") ? "wss" : "ws");

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["google", "email", "apple", "wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#B5FF1A",
          logo: "/logo.svg",
          showWalletLoginFirst: false,
          walletList: ["phantom", "backpack"],
        },
        embeddedWallets: {
          solana: { createOnLogin: "all-users" },
          showWalletUIs: false,
        },
        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors({ shouldAutoConnect: true }),
          },
        },
        solana: {
          rpcs: {
            [`solana:${SOLANA_NETWORK}` as const]: {
              rpc: createSolanaRpc(RPC_URL),
              rpcSubscriptions: createSolanaRpcSubscriptions(wsUrl),
            },
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
