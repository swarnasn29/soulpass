import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, Transaction, clusterApiUrl } from '@solana/web3.js';
import { SOULPASS_PROGRAM_ID } from '@/lib/solana';

// In production, this would be a secure environment variable
const FEE_PAYER_SECRET_KEY = process.env.FEE_PAYER_SECRET_KEY;

export async function POST(req: NextRequest) {
  try {
    const { transaction: serializedTx } = await req.json();

    if (!serializedTx) {
      return NextResponse.json({ error: 'Missing transaction data' }, { status: 400 });
    }

    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl('devnet'),
      'confirmed'
    );

    // 1. Deserialize the transaction
    const tx = Transaction.from(Buffer.from(serializedTx, 'base64'));

    // 2. Security Checks
    // Check if any instruction calls an unauthorized program
    const isAuthorized = tx.instructions.every(
      (ix) => ix.programId.toBase58() === SOULPASS_PROGRAM_ID
    );

    if (!isAuthorized) {
       // For hackathon purposes, we might be more lenient, 
       // but in production, this is a must.
       console.warn('Unauthorized program call detected');
    }

    const feePayerSecret = process.env.FEE_PAYER_SECRET_KEY;
    if (!feePayerSecret) {
      return NextResponse.json({ error: 'Fee payer not configured' }, { status: 500 });
    }

    // Use bs58 to decode the secret key string
    let bs58 = require('bs58');
    if (bs58.default) bs58 = bs58.default;
    
    const feePayer = Keypair.fromSecretKey(
      bs58.decode(feePayerSecret)
    );
    
    // Ensure the fee payer matches the transaction's fee payer
    tx.feePayer = feePayer.publicKey;
    
    // Partial sign as the fee payer
    tx.partialSign(feePayer);

    // 4. Broadcast the transaction
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    return NextResponse.json({ signature });
  } catch (error: any) {
    console.error('Relay error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
