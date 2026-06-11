/**
 * Tests for computeSha256Hex (hash.ts).
 *
 * Uses a precomputed SHA-256 vector:
 *   sha256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
 * (FIPS 180-4 test vector A.1)
 *
 * Also tests the empty-string vector:
 *   sha256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
 */

import { describe, it, expect } from "vitest";
import { computeSha256Hex } from "./hash.js";

describe("computeSha256Hex", () => {
  it("returns the known SHA-256 hex for 'abc' (FIPS 180-4 test vector)", async () => {
    const result = await computeSha256Hex("abc");
    expect(result).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("returns the known SHA-256 hex for the empty string", async () => {
    const result = await computeSha256Hex("");
    expect(result).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("returns a 64-character lowercase hex string", async () => {
    const result = await computeSha256Hex("hello world");
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic: same input produces same hash on repeated calls", async () => {
    const text = "keyboard-studio test determinism";
    const [a, b] = await Promise.all([computeSha256Hex(text), computeSha256Hex(text)]);
    expect(a).toBe(b);
  });

  it("produces different hashes for different inputs", async () => {
    const h1 = await computeSha256Hex("foo");
    const h2 = await computeSha256Hex("bar");
    expect(h1).not.toBe(h2);
  });
});
