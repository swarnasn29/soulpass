// Tiny borsh helpers — only the schema bits we need to encode our instructions
// and decode our accounts. Avoids a heavyweight `borsh` runtime dep.

export class Writer {
  buf: number[] = [];
  u8(n: number) { this.buf.push(n & 0xff); }
  u32(n: number) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n >>> 0, true);
    for (const x of b) this.buf.push(x);
  }
  u64(n: bigint) {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
    for (const x of b) this.buf.push(x);
  }
  i64(n: bigint) {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigInt64(0, BigInt(n), true);
    for (const x of b) this.buf.push(x);
  }
  bool(b: boolean) { this.u8(b ? 1 : 0); }
  bytes(b: Uint8Array) { for (const x of b) this.buf.push(x); }
  string(s: string) {
    const b = new TextEncoder().encode(s);
    this.u32(b.length);
    this.bytes(b);
  }
  optionString(s: string | null | undefined) {
    if (s === null || s === undefined) { this.u8(0); }
    else { this.u8(1); this.string(s); }
  }
  out(): Uint8Array { return Uint8Array.from(this.buf); }
}

export class Reader {
  off = 0;
  constructor(public buf: Buffer) {}

  private dv() {
    return new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength);
  }
  u8() { const v = this.dv().getUint8(this.off); this.off += 1; return v; }
  u32() { const v = this.dv().getUint32(this.off, true); this.off += 4; return v; }
  u64() { const v = this.dv().getBigUint64(this.off, true); this.off += 8; return v; }
  i64() { const v = this.dv().getBigInt64(this.off, true); this.off += 8; return v; }
  bool() { return this.u8() === 1; }
  pubkey() {
    const slice = this.buf.subarray(this.off, this.off + 32);
    this.off += 32;
    return new Uint8Array(slice);
  }
  string() {
    const len = this.u32();
    const s = this.buf.subarray(this.off, this.off + len).toString("utf8");
    this.off += len;
    return s;
  }
}
