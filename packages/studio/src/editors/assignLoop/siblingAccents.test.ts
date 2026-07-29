/**
 * siblingAccents — pure placement-generation tests for the longpress
 * accelerator (accept ù on u -> propose the rest of u's diacritic family).
 *
 * `caseCounterpart` is stubbed here (never the real engine export) so these
 * tests pin the module's own contract — the common-first ordering, the
 * NO-CAP full-family rule, the single-mark (no-stack) filter, and the
 * accepted-char exclusion rule — independent of locale casing behaviour,
 * which the engine's own `casePair.test.ts` already covers.
 */

import { describe, it, expect } from "vitest";
import {
  siblingAccentPlacements,
  type CaseCounterpartFn,
} from "./siblingAccents.ts";

/** Plain ASCII-case counterpart stub — every lowercase Latin letter has one,
 *  mirroring `caseCounterpart`'s real toUpper behaviour for unaccented and
 *  precomposed-accented Latin letters (`String.prototype.toUpperCase`
 *  handles those without a locale). Returns null when the uppercase is not a
 *  single code point, mirroring the real guard. */
const asciiCaseCounterpart: CaseCounterpartFn = (char) => {
  const upper = char.toUpperCase();
  if (upper === char || [...upper].length !== 1) return null;
  return { counterpart: upper, direction: "toUpper" };
};

/** A stub that reports no confident uppercase for one specific char —
 *  exercises the "some siblings have no uppercase" branch (RULE 3 guard)
 *  without pulling in a real no-uppercase Latin letter. */
function caseCounterpartExcept(excluded: string): CaseCounterpartFn {
  return (char) => {
    if (char === excluded) return null;
    return asciiCaseCounterpart(char);
  };
}

/** The common-first prefix every base's family must lead with, in order:
 *  grave, acute, circumflex, diaeresis, tilde, ring-above (RULE 2 priority). */
const A_COMMON_PREFIX = ["à", "á", "â", "ä", "ã", "å"];

describe("siblingAccentPlacements", () => {
  it("à-family: leads with the common accents in priority order, excludes à itself from the lowercase set", () => {
    const placements = siblingAccentPlacements(
      "à",
      "K_A",
      asciiCaseCounterpart,
    );
    const lower = placements.filter((p) => p.layer === "default").map((p) => p.char);
    const upper = placements.filter((p) => p.layer === "shift").map((p) => p.char);

    // à excluded from lowercase (the caller already placed it); the remaining
    // common accents still lead, in priority order.
    expect(lower.slice(0, 5)).toEqual(["á", "â", "ä", "ã", "å"]);
    expect(lower).not.toContain("à");
    // Every lowercase candidate (à included) gets an uppercase placement —
    // only the ACCEPTED CHAR's own lowercase placement is excluded, not its
    // uppercase counterpart. So the uppercase set leads with À.
    expect(upper.slice(0, 6)).toEqual(["À", "Á", "Â", "Ä", "Ã", "Å"]);
    expect(placements.every((p) => p.hostKey === "K_A")).toBe(true);
  });

  it("NO CAP: offers the full single-mark family, not a curated top-N", () => {
    // Base "a" used directly (not an accepted sibling) so nothing is excluded.
    const lower = siblingAccentPlacements("a", "K_A", asciiCaseCounterpart)
      .filter((p) => p.layer === "default")
      .map((p) => p.char);

    // Common accents lead, in priority order...
    expect(lower.slice(0, 6)).toEqual(A_COMMON_PREFIX);
    // ...and the set is NOT capped at 6 — it keeps going past the common tier
    // into every other single-mark precomposed form of "a".
    expect(lower.length).toBeGreaterThan(6);
    expect(lower).toEqual(
      expect.arrayContaining(["ā", "ą", "ǎ", "ȧ", "ă", "ạ"]),
    );
  });

  it("single-mark only: never offers a double-diacritic stack", () => {
    // u+diaeresis+acute (ǘ, U+01D8) is reachable via the single source mark
    // U+0344 but is a two-mark stack — it must be filtered out.
    const chars = siblingAccentPlacements("u", "K_U", asciiCaseCounterpart).map(
      (p) => p.char,
    );
    expect(chars).not.toContain("ǘ");
    expect(chars).not.toContain("Ǘ");
    // Every offered sibling decomposes to exactly base + ONE combining mark.
    for (const c of chars) {
      expect([...c.normalize("NFD")].length).toBe(2);
    }
  });

  it("u-family: accepting ù excludes ù from lowercase but keeps Ù in the uppercase set", () => {
    const placements = siblingAccentPlacements("ù", "K_U", asciiCaseCounterpart);
    const lower = placements.filter((p) => p.layer === "default").map((p) => p.char);
    const upper = placements.filter((p) => p.layer === "shift").map((p) => p.char);

    expect(lower.slice(0, 5)).toEqual(["ú", "û", "ü", "ũ", "ů"]);
    expect(lower).not.toContain("ù");
    expect(upper.slice(0, 6)).toEqual(["Ù", "Ú", "Û", "Ü", "Ũ", "Ů"]);
    // Uppercase forms all live on the shift layer, lowercase on default.
    expect(placements.filter((p) => p.layer === "shift").every((p) => p.char === p.char.toUpperCase())).toBe(true);
  });

  it("e-family: the priority order reaches cedilla (e has no ring-above form) ahead of the rarer marks", () => {
    const lower = siblingAccentPlacements("é", "K_E", asciiCaseCounterpart)
      .filter((p) => p.layer === "default")
      .map((p) => p.char);
    // grave, [accepted acute excluded], circumflex, diaeresis, tilde,
    // [ring-above has no precomposed e-form, skipped], cedilla — cedilla is
    // reached because ring-above does not compose for "e".
    expect(lower.slice(0, 5)).toEqual(["è", "ê", "ë", "ẽ", "ȩ"]);
    expect(lower).not.toContain("é");
  });

  it("excludes a candidate's shift placement when caseCounterpart reports no confident uppercase, but keeps its default placement", () => {
    const placements = siblingAccentPlacements(
      "a",
      "K_A",
      caseCounterpartExcept("â"),
    );
    const lower = placements.filter((p) => p.layer === "default").map((p) => p.char);
    const upper = placements.filter((p) => p.layer === "shift").map((p) => p.char);

    expect(lower).toContain("â");
    expect(upper).not.toContain("Â");
    // Every other common sibling still gets its uppercase, in order.
    expect(upper.slice(0, 5)).toEqual(["À", "Á", "Ä", "Ã", "Å"]);
  });

  it("returns [] for a non-Latin base (Latin-only scope gate)", () => {
    // "б" (Cyrillic) is not a plain a-z/A-Z base, so the accelerator
    // declines rather than guessing a Cyrillic diacritic family — the
    // Latin-only scope this module documents (a future extension, not
    // implemented here).
    const placements = siblingAccentPlacements(
      "б",
      "K_B",
      asciiCaseCounterpart,
    );
    expect(placements).toEqual([]);
  });

  it("returns [] for a base with no composable siblings under any combining mark", () => {
    // "q" has no precomposed accented forms in Unicode.
    const placements = siblingAccentPlacements(
      "q",
      "K_Q",
      asciiCaseCounterpart,
    );
    expect(placements).toEqual([]);
  });

  it("passes the bcp47 tag through to caseCounterpartFn unchanged", () => {
    const seen: Array<string | undefined> = [];
    const recording: CaseCounterpartFn = (char, bcp47) => {
      seen.push(bcp47);
      return asciiCaseCounterpart(char, bcp47);
    };
    siblingAccentPlacements("à", "K_A", recording, "tr");
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((tag) => tag === "tr")).toBe(true);
  });
});
