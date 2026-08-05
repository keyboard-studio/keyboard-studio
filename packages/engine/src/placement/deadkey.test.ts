/**
 * Unit tests for deadkey.ts — placement-priors v2 deadkey/store-index
 * extraction. Fixtures are modeled on corpus snippets attested by
 * docs/keyboard-index.md's ghana / bukawa rows:
 *   - shape (a) store-index: release/g/ghana/source/ghana.kmn:76
 *     `dk(003b) + any(dkf003b) > index(dkt003b, 2)`, and its `+`-less sibling
 *     idiom from release/a/amazigh_latin/source/amazigh_latin.kmn:254 (see
 *     "the '+' context-marker is optional" test below).
 *   - shape (b) literal deadkey: bukawa.kmn:22's `dk(bkt) + "N" > U+014A`
 *     idiom is itself OPAQUE in the real corpus (named, non-hex `dk(bkt)` —
 *     see the codec's NAMED_DEADKEY opaque reason), so it never reaches
 *     typed IR; these fixtures use a NUMERIC `dk(NNNN)` id (the shape this
 *     module can actually see), matching release/basic/basic_kbdcherp's
 *     real numeric-deadkey attestation of the identical rule shape.
 */

import { describe, it, expect } from "vitest";
import { parse } from "../codec/parse.js";
import { emitPlacementMap } from "./index.js";
import { extractDeadkeyCandidates, DEADKEY_SKIP_REASONS, type DeadkeySkipCounts } from "./deadkey.js";

// ---------------------------------------------------------------------------
// KMN builder helpers
// ---------------------------------------------------------------------------

function unicodeKmn(body: string): string {
  return [
    "store(&VERSION) '10.0'",
    "store(&TARGETS) 'any'",
    "begin Unicode > use(main)",
    ...body.split("\n"),
  ].join("\n");
}

function extract(kmnBody: string, kbId = "kb-dk") {
  const { ir } = parse(unicodeKmn(kmnBody), kbId);
  const skipCounts: DeadkeySkipCounts = new Map();
  const candidates = extractDeadkeyCandidates(ir, skipCounts);
  return { candidates, skipCounts, ir };
}

// ---------------------------------------------------------------------------
// Shape (a): dk(...) + any(charStore) > index(store, N) — "store-index"
// ---------------------------------------------------------------------------

describe("extractDeadkeyCandidates — shape (a) store-index", () => {
  it("ghana-style (explicit '+'): dk(003b) + any(dkf003b) > index(dkt003b,2)", () => {
    const { candidates, skipCounts } = extract(
      [
        "store(dkf003b) 'f'",
        "store(dkt003b) U+0192",
        "group(main) using keys",
        "+ [K_COLON] > dk(003b)",
        "dk(003b) + any(dkf003b) > index(dkt003b, 2)",
      ].join("\n"),
    );
    expect(candidates).toEqual([
      {
        codepoint: 0x0192,
        candidate: {
          vkey: "K_F",
          modifiers: [],
          mechanism: "store-index",
          priorSource: "corpus",
          priorCount: 1,
          confidence: 0.5,
          baseLetter: "f",
        },
      },
    ]);
    expect(skipCounts.size).toBe(0);
  });

  it("amazigh-style (no '+' separator) extracts identically", () => {
    const { candidates } = extract(
      [
        "store(dkf003b) 'f'",
        "store(dkt003b) U+0192",
        "group(main) using keys",
        "+ [K_COLON] > dk(003b)",
        "dk(003b) any(dkf003b) > index(dkt003b, 2)",
      ].join("\n"),
    );
    expect(candidates[0]?.codepoint).toBe(0x0192);
    expect(candidates[0]?.candidate.mechanism).toBe("store-index");
    expect(candidates[0]?.candidate.baseLetter).toBe("f");
  });

  it("extracts one candidate per paired (baseLetter, outputChar) position", () => {
    const { candidates } = extract(
      [
        "store(dkf003b) 'a' 'e' 'f'",
        "store(dkt003b) U+00E0 U+00E8 U+0192",
        "group(main) using keys",
        "+ [K_COLON] > dk(003b)",
        "dk(003b) + any(dkf003b) > index(dkt003b, 2)",
      ].join("\n"),
    );
    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c.candidate.baseLetter)).toEqual(["a", "e", "f"]);
    expect(candidates.map((c) => c.candidate.vkey)).toEqual(["K_A", "K_E", "K_F"]);
  });

  it("groups a rule lives in do not need 'using keys' — deadkey-consumer groups often lack it", () => {
    const { ir } = parse(
      unicodeKmn(
        [
          "store(dkf003b) 'f'",
          "store(dkt003b) U+0192",
          "group(main) using keys",
          "+ [K_COLON] > dk(003b)",
          "group(deadkeys)",
          "dk(003b) any(dkf003b) > index(dkt003b, 2)",
        ].join("\n"),
      ),
      "kb-no-usingkeys",
    );
    expect(ir.groups.find((g) => g.name === "deadkeys")?.usingKeys).toBe(false);
    const skipCounts: DeadkeySkipCounts = new Map();
    const candidates = extractDeadkeyCandidates(ir, skipCounts);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.candidate.mechanism).toBe("store-index");
  });
});

// ---------------------------------------------------------------------------
// Shape (b): dk(...) + "X" > singleChar — "deadkey"
// ---------------------------------------------------------------------------

describe("extractDeadkeyCandidates — shape (b) literal deadkey", () => {
  it("numeric dk(NNNN) + literal char > single char (bukawa idiom, numeric form)", () => {
    const { candidates, skipCounts } = extract(
      [
        "group(main) using keys",
        '+ "[" > dk(200)',
        'dk(200) + "N" > U+014A',
      ].join("\n"),
    );
    expect(candidates).toEqual([
      {
        codepoint: 0x014a,
        candidate: {
          vkey: "K_N",
          modifiers: [],
          mechanism: "deadkey",
          priorSource: "corpus",
          priorCount: 1,
          confidence: 0.5,
          baseLetter: "N",
        },
      },
    ]);
    expect(skipCounts.size).toBe(0);
  });

  it("baseLetter case is resolved to the same vkey regardless of case", () => {
    const { candidates } = extract(
      ['group(main) using keys', 'dk(200) + "n" > U+014B'].join("\n"),
    );
    expect(candidates[0]?.candidate.vkey).toBe("K_N");
    expect(candidates[0]?.candidate.baseLetter).toBe("n");
  });
});

// ---------------------------------------------------------------------------
// Skip-loudly reasons — every discard is counted, never silent
// ---------------------------------------------------------------------------

describe("extractDeadkeyCandidates — skip-loudly reasons", () => {
  it("multi-deadkey context is skipped and counted", () => {
    const { candidates, skipCounts } = extract(
      ['group(main) using keys', 'dk(200) dk(201) + "x" > U+0301'].join("\n"),
    );
    expect(candidates).toEqual([]);
    expect(skipCounts.get(DEADKEY_SKIP_REASONS.MULTI_DEADKEY)).toBe(1);
  });

  it("any() over a non-char (vkey) store is skipped and counted", () => {
    const { candidates, skipCounts } = extract(
      [
        "store(vowKeys) [K_A] [K_E]",
        "store(out) U+0101 U+0113",
        "group(main) using keys",
        "dk(200) + any(vowKeys) > index(out, 2)",
      ].join("\n"),
    );
    expect(candidates).toEqual([]);
    expect(skipCounts.get(DEADKEY_SKIP_REASONS.NON_CHAR_STORE)).toBe(1);
  });

  it("mismatched store lengths are skipped and counted", () => {
    const { candidates, skipCounts } = extract(
      [
        "store(inStore) 'a' 'e'",
        "store(outStore) U+0101",
        "group(main) using keys",
        "dk(200) + any(inStore) > index(outStore, 2)",
      ].join("\n"),
    );
    expect(candidates).toEqual([]);
    expect(skipCounts.get(DEADKEY_SKIP_REASONS.STORE_LENGTH_MISMATCH)).toBe(1);
  });

  it("multi-element output (index + trailing combining mark) is skipped and counted", () => {
    const { candidates, skipCounts } = extract(
      [
        "store(inStore) 'a'",
        "store(outStore) U+0061",
        "group(main) using keys",
        "dk(200) + any(inStore) > index(outStore, 2) U+0301",
      ].join("\n"),
    );
    expect(candidates).toEqual([]);
    expect(skipCounts.get(DEADKEY_SKIP_REASONS.MULTI_ELEMENT_OUTPUT)).toBe(1);
  });

  it("context()-bearing rules are skipped and counted", () => {
    const { candidates, skipCounts } = extract(
      ['group(main) using keys', 'dk(200) context(1) > U+0301'].join("\n"),
    );
    expect(candidates).toEqual([]);
    expect(skipCounts.get(DEADKEY_SKIP_REASONS.CONTEXT_BEARING)).toBe(1);
  });

  it("platform-gated ($keymanweb:) rules are skipped and counted", () => {
    const { candidates, skipCounts } = extract(
      ['group(main) using keys', '$keymanweb: dk(200) + "n" > U+014B'].join("\n"),
    );
    expect(candidates).toEqual([]);
    expect(skipCounts.get(DEADKEY_SKIP_REASONS.PLATFORM_GATED)).toBe(1);
  });

  it("an unmapped base letter (punctuation, not a US letter key) is skipped and counted", () => {
    const { candidates, skipCounts } = extract(
      ['group(main) using keys', 'dk(200) + "/" > U+0301'].join("\n"),
    );
    expect(candidates).toEqual([]);
    expect(skipCounts.get(DEADKEY_SKIP_REASONS.UNMAPPED_BASE_LETTER)).toBe(1);
  });

  it("an unrecognized deadkey context shape (e.g. dk + notany()) is skipped and counted", () => {
    const { candidates, skipCounts } = extract(
      [
        "store(s) 'a'",
        "group(main) using keys",
        "dk(200) notany(s) > U+0301",
      ].join("\n"),
    );
    expect(candidates).toEqual([]);
    expect(skipCounts.get(DEADKEY_SKIP_REASONS.UNRECOGNIZED_SHAPE)).toBe(1);
  });

  it("does not record a trigger key on the emitted candidate (mechanism-only, no modifiers)", () => {
    const { candidates } = extract(
      ['group(main) using keys', 'dk(200) + "n" > U+014B'].join("\n"),
    );
    expect(candidates[0]?.candidate.modifiers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Integration: emitPlacementMap merges direct + deadkey/store-index candidates
// ---------------------------------------------------------------------------

describe("emitPlacementMap — v2 deadkey merge", () => {
  it("U+0192 carries both the direct RALT candidate and the store-index candidate (ghana-style)", () => {
    const { ir } = parse(
      unicodeKmn(
        [
          "store(dkf003b) 'f'",
          "store(dkt003b) U+0192",
          "group(main) using keys",
          "+ [K_COLON] > dk(003b)",
          "+ [RALT K_F] > U+0192",
          "dk(003b) + any(dkf003b) > index(dkt003b, 2)",
        ].join("\n"),
      ),
      "kb-0192",
    );
    const map = emitPlacementMap(ir);
    const candidates = map.get("0192") ?? [];
    expect(candidates).toHaveLength(2);
    expect(candidates.some((c) => c.mechanism === "direct" && c.modifiers.includes("RALT"))).toBe(
      true,
    );
    expect(
      candidates.some((c) => c.mechanism === "store-index" && c.baseLetter === "f"),
    ).toBe(true);
  });

  it("accumulates counted skip reasons into a caller-supplied Map", () => {
    const { ir } = parse(
      unicodeKmn(['group(main) using keys', 'dk(200) dk(201) + "x" > U+0301'].join("\n")),
      "kb-skipcount",
    );
    const skipCounts: DeadkeySkipCounts = new Map();
    emitPlacementMap(ir, skipCounts);
    expect(skipCounts.get(DEADKEY_SKIP_REASONS.MULTI_DEADKEY)).toBe(1);
  });
});
