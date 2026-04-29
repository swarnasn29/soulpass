import { Connection, clusterApiUrl } from '@solana/web3.js';

export const SOLANA_NETWORK = 'devnet';
export const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(SOLANA_NETWORK);
export const connection = new Connection(endpoint, 'confirmed');

export const SOULPASS_PROGRAM_ID = '6oxNy4uApzwXVKAREsgxSGCSfjpCkRYFCz5aitVTkTyi';
