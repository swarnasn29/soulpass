import { useWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import { Transaction, PublicKey } from '@solana/web3.js';
import { connection } from '@/lib/solana';

export function useGaslessTransaction() {
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();

  const sendGaslessTransaction = async (transaction: Transaction) => {
    try {
      const wallet = wallets[0];
      if (!wallet) throw new Error('No wallet connected');

      // 1. Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;

      // 2. Set fee payer
      const feePayerPubkey = new PublicKey(process.env.NEXT_PUBLIC_FEE_PAYER_PUBKEY || 'SouL111111111111111111111111111111111111111');
      transaction.feePayer = feePayerPubkey;

      // 3. Request signature from user's Privy wallet
      const { signedTransaction } = await signTransaction({
        transaction: transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        }),
        wallet: wallet,
      });

      // 4. Send to our relay API
      const response = await fetch('/api/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction: Buffer.from(signedTransaction).toString('base64'),
        }),
      });

      const { signature, error } = await response.json();
      if (error) throw new Error(error);

      // 5. Wait for confirmation
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      if (confirmation.value.err) throw new Error('Transaction failed on-chain');

      return signature;
    } catch (error) {
      console.error('Gasless txn error:', error);
      throw error;
    }
  };

  return { sendGaslessTransaction };
}
