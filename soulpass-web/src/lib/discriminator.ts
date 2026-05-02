import { sha256 } from "@noble/hashes/sha2.js";

const cache = new Map<string, Uint8Array>();

function digest(input: string): Uint8Array {
  if (cache.has(input)) return cache.get(input)!;
  const out = sha256(new TextEncoder().encode(input)).slice(0, 8);
  cache.set(input, out);
  return out;
}

export function instructionDiscriminator(name: string): Uint8Array {
  return digest(`global:${name}`);
}

export function accountDiscriminator(name: string): Uint8Array {
  return digest(`account:${name}`);
}
