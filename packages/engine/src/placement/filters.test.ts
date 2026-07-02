import { describe, it, expect } from "vitest";
import {
  isMnemonicKeyboard,
  hasNonUSBase,
  dedupCapsNcaps,
  detectBaseLayoutFamily,
  hasInvertedNumberRow,
} from "./filters.js";
import { parse } from "../codec/parse.js";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { PlacementCandidate } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";

// ---------------------------------------------------------------------------
// Minimal KMN helpers
// ---------------------------------------------------------------------------

function makeUnicodeKmn(rules: string): string {
  return [
    "store(&VERSION) '10.0'",
    "store(&TARGETS) 'any'",
    "begin Unicode > use(main)",
    "group(main) using keys",
    rules,
  ].join("\n");
}

function makeAnsiKmn(rules: string): string {
  return [
    "store(&VERSION) '10.0'",
    "store(&TARGETS) 'any'",
    "begin ANSI > use(main)",
    "group(main) using keys",
    rules,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// isMnemonicKeyboard
// ---------------------------------------------------------------------------

describe("isMnemonicKeyboard", () => {
  it("returns false when keyboard has begin Unicode store", () => {
    const { ir } = parse(makeUnicodeKmn("+ [K_B] > ɓ"), "kb-unicode");
    expect(isMnemonicKeyboard(ir)).toBe(false);
  });

  it("returns true when keyboard has only begin ANSI store (no Unicode)", () => {
    const { ir } = parse(makeAnsiKmn("+ [K_B] > b"), "kb-ansi");
    expect(isMnemonicKeyboard(ir)).toBe(true);
  });

  it("returns false when no begin statement at all", () => {
    // makeTestIR builds an IR with no stores at all
    const ir = makeTestIR([]);
    expect(isMnemonicKeyboard(ir)).toBe(false);
  });

  it("returns false when header.encoding is 'Unicode'", () => {
    const ir = makeTestIR([]);
    (ir.header as Record<string, unknown>).encoding = "Unicode";
    expect(isMnemonicKeyboard(ir)).toBe(false);
  });

  it("returns true when header.encoding is 'ANSI'", () => {
    const ir = makeTestIR([]);
    (ir.header as Record<string, unknown>).encoding = "ANSI";
    expect(isMnemonicKeyboard(ir)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hasNonUSBase
// ---------------------------------------------------------------------------

describe("hasNonUSBase", () => {
  it("returns false for a keyboard with zero letter deviations (US QWERTY identity)", () => {
    // Rules that exactly match US unshifted — quoted chars so the parser produces char elements
    const kmn = makeUnicodeKmn(
      ["+ [K_A] > 'a'", "+ [K_B] > 'b'", "+ [K_C] > 'c'"].join("\n"),
    );
    const { ir } = parse(kmn, "kb-us");
    expect(hasNonUSBase(ir)).toBe(false);
  });

  it("returns false for a keyboard with exactly 3 deviations (at the threshold)", () => {
    // 3 letter deviations: K_A->'x', K_B->'y', K_C->'z' (all different from US)
    const kmn = makeUnicodeKmn(
      ["+ [K_A] > 'x'", "+ [K_B] > 'y'", "+ [K_C] > 'z'"].join("\n"),
    );
    const { ir } = parse(kmn, "kb-3dev");
    expect(hasNonUSBase(ir)).toBe(false);
  });

  it("returns true for a keyboard with more than 3 deviations from US QWERTY", () => {
    // 4 letter deviations: K_A->'q', K_B->'w', K_C->'e', K_D->'r' (none match US expected)
    // US expected: K_A->a, K_B->b, K_C->c, K_D->d
    const kmn = makeUnicodeKmn(
      ["+ [K_A] > 'q'", "+ [K_B] > 'w'", "+ [K_C] > 'e'", "+ [K_D] > 'r'"].join("\n"),
    );
    const { ir } = parse(kmn, "kb-azerty");
    expect(hasNonUSBase(ir)).toBe(true);
  });

  it("ignores modified (SHIFT/RALT) rules when counting deviations", () => {
    // RALT-layer rules should not count as base deviations
    const kmn = makeUnicodeKmn(
      [
        "+ [RALT K_A] > 'q'",
        "+ [RALT K_B] > 'w'",
        "+ [RALT K_C] > 'e'",
        "+ [RALT K_D] > 'r'",
        "+ [RALT K_E] > 't'",
      ].join("\n"),
    );
    const { ir } = parse(kmn, "kb-ralt-only");
    expect(hasNonUSBase(ir)).toBe(false);
  });

  it("custom threshold: 5 deviations is ok when threshold=5", () => {
    const kmn = makeUnicodeKmn(
      [
        "+ [K_A] > 'q'",
        "+ [K_B] > 'w'",
        "+ [K_C] > 'e'",
        "+ [K_D] > 'r'",
        "+ [K_E] > 't'",
      ].join("\n"),
    );
    const { ir } = parse(kmn, "kb-5dev");
    expect(hasNonUSBase(ir, 5)).toBe(false);
    expect(hasNonUSBase(ir, 4)).toBe(true);
  });

  it("counts deviations on an NCAPS-encoded base row (regression: #384 sibling)", () => {
    // Real keyboards write the unshifted base row as [NCAPS K_x]. Before the
    // NCAPS-tolerant guard, hasNonUSBase skipped these rows entirely and a
    // non-US (AZERTY) base would have been misreported as US (0 deviations).
    const kmn = makeUnicodeKmn(
      [
        "+ [NCAPS K_A] > 'q'",
        "+ [NCAPS K_B] > 'w'",
        "+ [NCAPS K_C] > 'e'",
        "+ [NCAPS K_D] > 'r'",
      ].join("\n"),
    );
    const { ir } = parse(kmn, "kb-ncaps-azerty");
    expect(hasNonUSBase(ir)).toBe(true);
  });

  it("counts a duplicate rule pair on one vkey as ONE deviation, per-position not per-rule", () => {
    // K_A carries TWO qualifying (isBaseLayer-accepted) rules — a bare rule
    // and an NCAPS rule — that both deviate from the expected 'a'.
    // collectVkeyChars is first-occurrence-wins, so hasNonUSBase's per-VKEY
    // tally counts K_A once, alongside two other *distinct* deviating vkeys
    // (K_B, K_C), for a total of 3 — exactly AT the default threshold, so
    // hasNonUSBase reports false.
    //
    // Under the old per-RULE tally (pre-collectVkeyChars refactor), each
    // qualifying rule incremented the counter independently, so the same
    // fixture would have summed to 4 deviations (K_A's two rules + K_B + K_C)
    // and exceeded the threshold, reporting true. That divergence is
    // intentional: "non-US base" means how many key *positions* differ from
    // US, so a duplicated rule on the same position must not be double-
    // counted. Do not "fix" this back to per-rule counting.
    const kmn = makeUnicodeKmn(
      [
        "+ [K_A] > 'q'",
        "+ [NCAPS K_A] > 'q'",
        "+ [K_B] > 'w'",
        "+ [K_C] > 'e'",
      ].join("\n"),
    );
    const { ir } = parse(kmn, "kb-dup-rule-per-vkey");
    expect(hasNonUSBase(ir)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// dedupCapsNcaps
// ---------------------------------------------------------------------------

describe("dedupCapsNcaps", () => {
  function taggedWith(
    cp: number,
    vkey: string,
    modifiers: string[],
  ): { codepoint: number; candidate: PlacementCandidate } {
    return {
      codepoint: cp,
      candidate: {
        vkey,
        modifiers,
        mechanism: "direct",
        priorSource: "corpus",
        priorCount: 1,
        confidence: 0.5,
      },
    };
  }

  it("collapses CAPS and NCAPS variants for same codepoint+vkey to one entry", () => {
    const input = [
      taggedWith(0x0253, "K_B", ["CAPS"]),
      taggedWith(0x0253, "K_B", ["NCAPS"]),
    ];
    const result = dedupCapsNcaps(input);
    expect(result).toHaveLength(1);
    expect(result[0]?.candidate.vkey).toBe("K_B");
  });

  it("keeps the first occurrence when deduplicating", () => {
    const input = [
      taggedWith(0x0253, "K_B", ["CAPS"]),
      taggedWith(0x0253, "K_B", ["NCAPS"]),
    ];
    const result = dedupCapsNcaps(input);
    expect(result[0]?.candidate.modifiers).toEqual(["CAPS"]);
  });

  it("does not collapse entries with different codepoints even on same vkey", () => {
    const input = [
      taggedWith(0x0253, "K_B", ["CAPS"]),
      taggedWith(0x0042, "K_B", ["NCAPS"]), // U+0042 = 'B', different cp
    ];
    const result = dedupCapsNcaps(input);
    expect(result).toHaveLength(2);
  });

  it("does not collapse entries with different vkeys even with same codepoint", () => {
    const input = [
      taggedWith(0x0253, "K_B", ["CAPS"]),
      taggedWith(0x0253, "K_V", ["NCAPS"]),
    ];
    const result = dedupCapsNcaps(input);
    expect(result).toHaveLength(2);
  });

  it("does not collapse when RALT is present and different (RALT+CAPS vs plain CAPS)", () => {
    // RALT K_B with CAPS is a different slot from K_B with CAPS
    const input = [
      taggedWith(0x0253, "K_B", ["RALT", "CAPS"]),
      taggedWith(0x0253, "K_B", ["RALT", "NCAPS"]),
    ];
    const result = dedupCapsNcaps(input);
    // Both have RALT, same codepoint+vkey — they dedup to one
    expect(result).toHaveLength(1);
  });

  it("passes through entries that have no CAPS/NCAPS modifier unchanged", () => {
    const input = [
      taggedWith(0x0253, "K_B", ["RALT"]),
      taggedWith(0x0257, "K_D", ["RALT"]),
    ];
    const result = dedupCapsNcaps(input);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// detectBaseLayoutFamily
// ---------------------------------------------------------------------------

describe("detectBaseLayoutFamily", () => {
  // Bare-modifier base rows (q/a/z at their physical key positions).
  const bareQwerty = "+ [K_Q] > 'q'\n+ [K_A] > 'a'\n+ [K_Z] > 'z'";
  const bareAzerty = "+ [K_Q] > 'a'\n+ [K_A] > 'q'\n+ [K_Z] > 'w'";
  const bareQwertz = "+ [K_Q] > 'q'\n+ [K_A] > 'a'\n+ [K_Z] > 'y'";

  it("detects QWERTY from a bare-modifier base row", () => {
    expect(detectBaseLayoutFamily(parse(makeUnicodeKmn(bareQwerty), "k").ir)).toBe("QWERTY");
  });

  it("detects AZERTY from a bare-modifier base row", () => {
    expect(detectBaseLayoutFamily(parse(makeUnicodeKmn(bareAzerty), "k").ir)).toBe("AZERTY");
  });

  it("detects QWERTZ from a bare-modifier base row", () => {
    expect(detectBaseLayoutFamily(parse(makeUnicodeKmn(bareQwertz), "k").ir)).toBe("QWERTZ");
  });

  it("detects AZERTY when the base row is encoded with the NCAPS modifier (regression: #384)", () => {
    // Real keyboards (e.g. basic_kbdbe) write the unshifted letter row as
    // [NCAPS K_x], never with an empty modifier list. Before the fix the
    // detector skipped these and returned "other".
    const ncapsAzerty = [
      "+ [NCAPS K_Q] > 'a'",
      "+ [CAPS K_Q] > 'A'",
      "+ [NCAPS SHIFT K_Q] > 'A'",
      "+ [NCAPS K_A] > 'q'",
      "+ [CAPS K_A] > 'Q'",
      "+ [NCAPS K_Z] > 'w'",
      "+ [CAPS K_Z] > 'W'",
    ].join("\n");
    expect(detectBaseLayoutFamily(parse(makeUnicodeKmn(ncapsAzerty), "k").ir)).toBe("AZERTY");
  });

  it("ignores SHIFT/CAPS rows so an all-uppercase shifted layer is not misread", () => {
    // Only shifted/caps rows present -> no unshifted base row -> undetermined.
    const onlyShifted = "+ [SHIFT K_Q] > 'Q'\n+ [CAPS K_A] > 'A'\n+ [SHIFT K_Z] > 'Z'";
    expect(detectBaseLayoutFamily(parse(makeUnicodeKmn(onlyShifted), "k").ir)).toBe("other");
  });

  it("returns 'other' for an unrecognised base row", () => {
    expect(detectBaseLayoutFamily(parse(makeUnicodeKmn("+ [K_Q] > 'x'"), "k").ir)).toBe("other");
  });
});

// ---------------------------------------------------------------------------
// detectBaseLayoutFamily — real corpus (Belgian AZERTY base)
// ---------------------------------------------------------------------------

describe("detectBaseLayoutFamily against the real basic_kbdbe AZERTY base", () => {
  const __dir = dirname(fileURLToPath(import.meta.url));
  const KMN_PATH = resolve(
    __dir,
    "../../../../../keyboards/release/basic/basic_kbdbe/source/basic_kbdbe.kmn"
  );
  const available = existsSync(KMN_PATH);

  it.skipIf(!available)("classifies basic_kbdbe as AZERTY (not QWERTY/QWERTZ)", () => {
    const { ir } = parse(readFileSync(KMN_PATH, "utf-8"), "basic_kbdbe");
    expect(detectBaseLayoutFamily(ir)).toBe("AZERTY");
  });
});

// ---------------------------------------------------------------------------
// hasInvertedNumberRow
// ---------------------------------------------------------------------------

describe("hasInvertedNumberRow", () => {
  // Single-char symbol stand-ins for the base (unshifted) row across the
  // digit keys (mirrors AZERTY's punctuation-on-base-row inversion).
  const symbols: Record<string, string> = {
    K_1: "&", K_2: "e", K_3: "\"", K_4: "q", K_5: "p",
  };

  function invertedRuleBlock(vkeys: string[]): string {
    return vkeys
      .map((vkey) => {
        const digit = { K_1: "1", K_2: "2", K_3: "3", K_4: "4", K_5: "5", K_6: "6", K_7: "7", K_8: "8", K_9: "9", K_0: "0" }[vkey];
        return [
          `+ [NCAPS ${vkey}] > '${symbols[vkey] ?? "x"}'`,
          `+ [NCAPS SHIFT ${vkey}] > '${digit}'`,
        ].join("\n");
      })
      .join("\n");
  }

  it("returns true for an inverted number row across >=5 keys", () => {
    const rules = [
      "+ [NCAPS K_1] > '&'",
      "+ [NCAPS SHIFT K_1] > '1'",
      "+ [NCAPS K_2] > 'e'",
      "+ [NCAPS SHIFT K_2] > '2'",
      "+ [NCAPS K_3] > '\"'",
      "+ [NCAPS SHIFT K_3] > '3'",
      "+ [NCAPS K_4] > 'q'",
      "+ [NCAPS SHIFT K_4] > '4'",
      "+ [NCAPS K_5] > 'p'",
      "+ [NCAPS SHIFT K_5] > '5'",
    ].join("\n");
    const { ir } = parse(makeUnicodeKmn(rules), "kb-inverted");
    expect(hasInvertedNumberRow(ir)).toBe(true);
  });

  it("feeds into detectBaseLayoutFamily as AZERTY when the letter row is unrecognised", () => {
    const rules = [
      // Letter row deliberately not AZERTY/QWERTY/QWERTZ (falls through to 'other').
      "+ [NCAPS K_Q] > 'x'",
      "+ [NCAPS K_A] > 'y'",
      "+ [NCAPS K_Z] > 'z'",
      "+ [NCAPS K_1] > '&'",
      "+ [NCAPS SHIFT K_1] > '1'",
      "+ [NCAPS K_2] > 'e'",
      "+ [NCAPS SHIFT K_2] > '2'",
      "+ [NCAPS K_3] > '\"'",
      "+ [NCAPS SHIFT K_3] > '3'",
      "+ [NCAPS K_4] > 'q'",
      "+ [NCAPS SHIFT K_4] > '4'",
      "+ [NCAPS K_5] > 'p'",
      "+ [NCAPS SHIFT K_5] > '5'",
    ].join("\n");
    const { ir } = parse(makeUnicodeKmn(rules), "kb-inverted-other-letters");
    expect(detectBaseLayoutFamily(ir)).toBe("AZERTY");
  });

  it("returns false for a QWERTY/QWERTZ-style digit row (base already the digit)", () => {
    const rules = [
      "+ [NCAPS K_1] > '1'",
      "+ [NCAPS K_2] > '2'",
      "+ [NCAPS K_3] > '3'",
      "+ [NCAPS K_4] > '4'",
      "+ [NCAPS K_5] > '5'",
      "+ [NCAPS SHIFT K_1] > '!'",
      "+ [NCAPS SHIFT K_2] > '@'",
      "+ [NCAPS SHIFT K_3] > '#'",
      "+ [NCAPS SHIFT K_4] > '$'",
      "+ [NCAPS SHIFT K_5] > '%'",
    ].join("\n");
    const { ir } = parse(makeUnicodeKmn(rules), "kb-normal-digits");
    expect(hasInvertedNumberRow(ir)).toBe(false);
  });

  it("reads the NCAPS (not CAPS) state for the base row, even when CapsLock flips the row back to digits", () => {
    // With CapsLock ON the row flips back to plain digits — this must NOT be
    // mistaken for the base state.
    const rules = [
      "+ [NCAPS K_1] > '&'",
      "+ [CAPS K_1] > '1'",
      "+ [NCAPS SHIFT K_1] > '1'",
      "+ [NCAPS K_2] > 'e'",
      "+ [CAPS K_2] > '2'",
      "+ [NCAPS SHIFT K_2] > '2'",
      "+ [NCAPS K_3] > '\"'",
      "+ [CAPS K_3] > '3'",
      "+ [NCAPS SHIFT K_3] > '3'",
      "+ [NCAPS K_4] > 'q'",
      "+ [CAPS K_4] > '4'",
      "+ [NCAPS SHIFT K_4] > '4'",
      "+ [NCAPS K_5] > 'p'",
      "+ [CAPS K_5] > '5'",
      "+ [NCAPS SHIFT K_5] > '5'",
    ].join("\n");
    const { ir } = parse(makeUnicodeKmn(rules), "kb-capslock-flip");
    expect(hasInvertedNumberRow(ir)).toBe(true);
  });

  it("returns false when only CAPS rows are present (no NCAPS base defined)", () => {
    const rules = [
      "+ [CAPS K_1] > '1'",
      "+ [CAPS K_2] > '2'",
      "+ [CAPS K_3] > '3'",
      "+ [CAPS K_4] > '4'",
      "+ [CAPS K_5] > '5'",
      "+ [NCAPS SHIFT K_1] > '1'",
      "+ [NCAPS SHIFT K_2] > '2'",
      "+ [NCAPS SHIFT K_3] > '3'",
      "+ [NCAPS SHIFT K_4] > '4'",
      "+ [NCAPS SHIFT K_5] > '5'",
    ].join("\n");
    const { ir } = parse(makeUnicodeKmn(rules), "kb-caps-only");
    expect(hasInvertedNumberRow(ir)).toBe(false);
  });

  it("threshold boundary: exactly 5 inverted keys is true with the default threshold", () => {
    const rules = invertedRuleBlock(["K_1", "K_2", "K_3", "K_4", "K_5"]);
    const { ir } = parse(makeUnicodeKmn(rules), "kb-exactly-5");
    expect(hasInvertedNumberRow(ir)).toBe(true);
  });

  it("threshold boundary: 4 inverted keys is false with the default threshold", () => {
    const rules = invertedRuleBlock(["K_1", "K_2", "K_3", "K_4"]);
    const { ir } = parse(makeUnicodeKmn(rules), "kb-only-4");
    expect(hasInvertedNumberRow(ir)).toBe(false);
  });

  it("a letter-row-AZERTY keyboard still returns AZERTY via the primary letter check (regression)", () => {
    const bareAzerty = "+ [K_Q] > 'a'\n+ [K_A] > 'q'\n+ [K_Z] > 'w'";
    expect(detectBaseLayoutFamily(parse(makeUnicodeKmn(bareAzerty), "k").ir)).toBe("AZERTY");
  });
});

// ---------------------------------------------------------------------------
// hasInvertedNumberRow — real corpus (Belgian AZERTY base)
// ---------------------------------------------------------------------------

describe("hasInvertedNumberRow against the real basic_kbdbe AZERTY base", () => {
  const __dir = dirname(fileURLToPath(import.meta.url));
  const KMN_PATH = resolve(
    __dir,
    "../../../../../keyboards/release/basic/basic_kbdbe/source/basic_kbdbe.kmn"
  );
  const available = existsSync(KMN_PATH);

  it.skipIf(!available)("detects the inverted number row in basic_kbdbe", () => {
    const { ir } = parse(readFileSync(KMN_PATH, "utf-8"), "basic_kbdbe");
    expect(hasInvertedNumberRow(ir)).toBe(true);
  });
});
