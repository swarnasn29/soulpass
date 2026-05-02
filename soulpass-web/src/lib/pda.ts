import { PublicKey } from "@solana/web3.js";
import { SOULPASS_PROGRAM_ID } from "./solana";

const enc = new TextEncoder();

export function userPda(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [enc.encode("user"), authority.toBuffer()],
    SOULPASS_PROGRAM_ID,
  );
}

export function eventPda(organizer: PublicKey, eventId: bigint): [PublicKey, number] {
  const idBuf = new Uint8Array(8);
  new DataView(idBuf.buffer).setBigUint64(0, BigInt(eventId), true);
  return PublicKey.findProgramAddressSync(
    [enc.encode("event"), organizer.toBuffer(), idBuf],
    SOULPASS_PROGRAM_ID,
  );
}

export function registrationPda(eventAddr: PublicKey, attendee: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [enc.encode("reg"), eventAddr.toBuffer(), attendee.toBuffer()],
    SOULPASS_PROGRAM_ID,
  );
}

export function connectionPda(
  eventAddr: PublicKey,
  userA: PublicKey,
  userB: PublicKey,
): {
  pda: PublicKey;
  bump: number;
  lo: PublicKey;
  hi: PublicKey;
} {
  const [lo, hi] = userA.toBuffer().compare(userB.toBuffer()) < 0
    ? [userA, userB]
    : [userB, userA];
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [enc.encode("conn"), eventAddr.toBuffer(), lo.toBuffer(), hi.toBuffer()],
    SOULPASS_PROGRAM_ID,
  );
  return { pda, bump, lo, hi };
}

export function ratingPda(
  eventAddr: PublicKey,
  rater: PublicKey,
  ratee: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [enc.encode("rate"), eventAddr.toBuffer(), rater.toBuffer(), ratee.toBuffer()],
    SOULPASS_PROGRAM_ID,
  );
}

export function eventBadgePda(
  owner: PublicKey,
  eventAddr: PublicKey,
  kind: number,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [enc.encode("badge-evt"), owner.toBuffer(), eventAddr.toBuffer(), Uint8Array.from([kind])],
    SOULPASS_PROGRAM_ID,
  );
}

export function lifetimeBadgePda(owner: PublicKey, kind: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [enc.encode("badge-life"), owner.toBuffer(), Uint8Array.from([kind])],
    SOULPASS_PROGRAM_ID,
  );
}
