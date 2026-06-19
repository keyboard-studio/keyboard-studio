import { describe, it, expect } from "vitest";
import { emitPlacementMap } from "./index.js";
import { parse } from "../codec/parse.js";
import type { PlacementCandidate } from "@keyboard-studio/contracts";

/** Flatten the codepoint-keyed Map returned by emitPlacementMap into a plain array. */
function flatCandidates(ir: Parameters<typeof emitPlacementMap>[0]): PlacementCandidate[] {
  return [...emitPlacementMap(ir).values()].flat();
}

// ---------------------------------------------------------------------------
// KMN builder helpers
// ---------------------------------------------------------------------------

function unicodeKmn(rules: string): string {
  return [
    "store(&VERSION) '10.0'",
    "store(&TARGETS) 'any'",
    "begin Unicode > use(main)",
    "group(main) using keys",
    rules,
  ].join("\n");
}

function ansiKmn(rules: string): string {
  return [
    "store(&VERSION) '10.0'",
    "store(&TARGETS) 'any'",
    "begin ANSI > use(main)",
    "group(main) using keys",
    rules,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("emitPlacementMap", () => {
  it("simple direct placement: + [K_B] > U+0253 produces a K_B direct candidate with U+0253", () => {
    const { ir } = parse(unicodeKmn("+ [K_B] > U+0253"), "kb-b");
    const candidates = flatCandidates(ir);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    const b = candidates.find((c) => c.vkey === "K_B");
    expect(b).toBeDefined();
    expect(b?.mechanism).toBe("direct");
    expect(b?.modifiers).toEqual([]);
    expect(b?.priorSource).toBe("corpus");
    expect(b?.vkey).toBe("K_B");
  });

  it("return value is a Map keyed by 4-char hex codepoint", () => {
    const { ir } = parse(unicodeKmn("+ [K_B] > U+0253"), "kb-b-map");
    const result = emitPlacementMap(ir);
    expect(result).toBeInstanceOf(Map);
    expect(result.has("0253")).toBe(true);
    const bucket = result.get("0253");
    expect(bucket).toBeDefined();
    expect(bucket?.[0]?.vkey).toBe("K_B");
  });

  it("mnemonic keyboard excluded: ANSI-only keyboard returns empty Map", () => {
    const { ir } = parse(ansiKmn("+ [K_B] > 'b'"), "kb-mnemonic");
    const result = emitPlacementMap(ir);
    expect(result.size).toBe(0);
  });

  it("PUA codepoint dropped: rule outputting U+E001 not in result", () => {
    const { ir } = parse(unicodeKmn("+ [K_A] > U+E001"), "kb-pua");
    const candidates = flatCandidates(ir);
    const pua = candidates.find((c) => c.vkey === "K_A");
    expect(pua).toBeUndefined();
  });

  it("RALT modifier preserved: + [RALT K_B] > U+0253 yields modifiers ['RALT']", () => {
    const { ir } = parse(unicodeKmn("+ [RALT K_B] > U+0253"), "kb-ralt");
    const candidates = flatCandidates(ir);
    const b = candidates.find((c) => c.vkey === "K_B");
    expect(b).toBeDefined();
    expect(b?.modifiers).toContain("RALT");
  });

  it("conditional rule skipped: any(s) + [K_B] > index(s,1) not in result", () => {
    const kmn = [
      "store(&VERSION) '10.0'",
      "store(&TARGETS) 'any'",
      "store(myStore) 'abc'",
      "begin Unicode > use(main)",
      "group(main) using keys",
      "any(myStore) + [K_B] > index(myStore, 1)",
    ].join("\n");
    const { ir } = parse(kmn, "kb-cond");
    const candidates = flatCandidates(ir);
    // The rule has an 'any' context element, so it should be skipped
    expect(candidates.find((c) => c.vkey === "K_B")).toBeUndefined();
  });

  it("multiple direct rules all produce candidates", () => {
    const kmn = unicodeKmn(
      ["+ [K_B] > U+0253", "+ [K_D] > U+0257", "+ [K_N] > U+014B"].join("\n"),
    );
    const { ir } = parse(kmn, "kb-multi");
    const candidates = flatCandidates(ir);
    const vkeys = candidates.map((c) => c.vkey);
    expect(vkeys).toContain("K_B");
    expect(vkeys).toContain("K_D");
    expect(vkeys).toContain("K_N");
  });

  it("SMP codepoint (> U+FFFF) is excluded", () => {
    // U+1F600 is an SMP codepoint
    const { ir } = parse(unicodeKmn("+ [K_A] > U+1F600"), "kb-smp");
    const candidates = flatCandidates(ir);
    expect(candidates.find((c) => c.vkey === "K_A")).toBeUndefined();
  });

  it("control character (U+0000) is excluded", () => {
    const { ir } = parse(unicodeKmn("+ [K_A] > U+0000"), "kb-null");
    const candidates = flatCandidates(ir);
    expect(candidates.find((c) => c.vkey === "K_A")).toBeUndefined();
  });

  it("deadkey output rule is excluded (v1 scope)", () => {
    const kmn = [
      "store(&VERSION) '10.0'",
      "store(&TARGETS) 'any'",
      "begin Unicode > use(main)",
      "group(main) using keys",
      "+ [K_A] > dk(acute)",
    ].join("\n");
    const { ir } = parse(kmn, "kb-dk");
    const candidates = flatCandidates(ir);
    expect(candidates.find((c) => c.vkey === "K_A")).toBeUndefined();
  });

  it("all returned candidates have mechanism 'direct' and priorSource 'corpus'", () => {
    const kmn = unicodeKmn(
      ["+ [K_B] > U+0253", "+ [RALT K_D] > U+0257"].join("\n"),
    );
    const { ir } = parse(kmn, "kb-check-fields");
    const candidates = flatCandidates(ir);
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(c.mechanism).toBe("direct");
      expect(c.priorSource).toBe("corpus");
      expect(c.priorCount).toBe(1);
      expect(c.confidence).toBe(0.5);
    }
  });
});
