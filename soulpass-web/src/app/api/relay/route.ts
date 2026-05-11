import { NextRequest, NextResponse } from "next/server";
import { Connection, VersionedTransaction, Transaction, clusterApiUrl } from "@solana/web3.js";
import { SOULPASS_PROGRAM_ID } from "@/lib/solana";
import { getFeePayer } from "@/lib/feePayer";
import { authErrorResponse, requireSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Auth gate — Privy session required. The fee-payer wallet pays SOL for every
  // relay, so unauthenticated submissions would let any visitor drain the wallet.
  try {
    await requireSession(req);
  } catch (e) {
    const resp = authErrorResponse(e);
    if (resp) return resp;
    throw e;
  }

  let body: { transaction?: string; versioned?: boolean } | null = null;
  try {
    body = (await req.json()) as { transaction?: string; versioned?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.transaction) {
    return NextResponse.json({ error: "Missing transaction" }, { status: 400 });
  }

  const raw = Buffer.from(body.transaction, "base64");

  let feePayer;
  try {
    feePayer = getFeePayer();
  } catch (e) {
    // Don't leak the underlying error — could mention key paths or env names.
    const msg = (e as Error).message?.includes("FEE_PAYER_SECRET_KEY")
      ? "Fee-payer not configured"
      : "Server misconfigured";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl("devnet");
  const connection = new Connection(rpc, "confirmed");

  const programId = SOULPASS_PROGRAM_ID.toBase58();
  const allowedExtras = new Set<string>([
    "11111111111111111111111111111111", // SystemProgram
    "ComputeBudget111111111111111111111111111111", // Compute budget — for priority fees
  ]);

  try {
    if (body.versioned) {
      const tx = VersionedTransaction.deserialize(raw);

      // Whitelist: every program invocation must be SoulPass or system/compute budget
      const staticKeys = tx.message.staticAccountKeys.map((k) => k.toBase58());
      for (const ix of tx.message.compiledInstructions) {
        const pid = staticKeys[ix.programIdIndex];
        if (pid !== programId && !allowedExtras.has(pid)) {
          return NextResponse.json(
            { error: `Disallowed program in transaction: ${pid}` },
            { status: 400 },
          );
        }
      }

      const txFeePayer = staticKeys[0];
      if (txFeePayer !== feePayer.publicKey.toBase58()) {
        return NextResponse.json(
          { error: `Transaction fee payer must be ${feePayer.publicKey.toBase58()}` },
          { status: 400 },
        );
      }

      tx.sign([feePayer]);
      const sig = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      return NextResponse.json({ signature: sig });
    }

    // Legacy transactions
    const tx = Transaction.from(raw);

    for (const ix of tx.instructions) {
      const pid = ix.programId.toBase58();
      if (pid !== programId && !allowedExtras.has(pid)) {
        return NextResponse.json(
          { error: `Disallowed program in transaction: ${pid}` },
          { status: 400 },
        );
      }
    }

    if (!tx.feePayer || tx.feePayer.toBase58() !== feePayer.publicKey.toBase58()) {
      return NextResponse.json(
        { error: `Transaction fee payer must be ${feePayer.publicKey.toBase58()}` },
        { status: 400 },
      );
    }

    tx.partialSign(feePayer);

    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    return NextResponse.json({ signature: sig });
  } catch (err) {
    // Surface only the program/preflight error — these are useful to clients
    // and don't leak server internals.
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
