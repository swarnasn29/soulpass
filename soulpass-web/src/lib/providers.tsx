'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import { SOLANA_NETWORK } from './solana';

export default function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'client-placeholder';
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['google', 'email', 'apple'],
        appearance: {
          theme: 'dark',
          accentColor: '#676FFF',
        },
        embeddedWallets: {
          solana: {
            createOnLogin: 'all-users',
          },
          showWalletUIs: false, // Crucial for gasless invisible UX
        },
        solana: {
          rpcs: {
            [`solana:${SOLANA_NETWORK}` as const]: {
              rpc: createSolanaRpc(rpcUrl),
              rpcSubscriptions: createSolanaRpcSubscriptions(rpcUrl.replace('https://', 'wss://')),
            },
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
