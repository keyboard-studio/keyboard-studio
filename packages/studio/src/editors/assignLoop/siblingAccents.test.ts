/**
 * siblingAccents — pure placement-generation tests for the longpress
 * accelerator (accept ù on u -> propose the rest of u's diacritic family).
 *
 * `caseCounterpart` is stubbed here (never the real engine export) so these
 * tests pin the module's own contract — ordering, the 6-cap, and the
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
 *  handles those without a locale). */
const asciiCaseCounterpart: CaseCounterpartFn = (char) => {
  const upper = char.toUpperCase();
  if (upper === char) return null;
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

describe("siblingAccentPlacements", () => {
  it("à-family: accepting à on K_A proposes the rest of a's family plus every uppercase, excluding à itself", () => {
    const placements = siblingAccentPlacements(
      "à",
      "K_A",
      asciiCaseCounterpart,
    );

    const lower = placements.filter((p) => p.layer === "default");
    const upper = placements.filter((p) => p.layer === "shift");

    // a's family (grave, acute, circumflex, diaeresis, tilde, ring-above)
    // hits the 6-cap exactly; à itself is excluded from the lowercase list.
    expect(lower.map((p) => p.char)).toEqual(["á", "â", "ä", "ã", "å"]);
    // Every lowercase candidate (à included) gets an uppercase placement —
    // only the ACCEPTED CHAR's own lowercase placement is excluded, not its
    // uppercase counterpart.
    expect(upper.map((p) => p.char)).toEqual(["À", "Á", "Â", "Ä", "Ã", "Å"]);
    expect(placements.every((p) => p.hostKey === "K_A")).toBe(true);
  });

  it("u-family: accepting ù on K_U proposes the rest of u's family (6-cap) plus all uppercase counterparts", () => {
    const placements = siblingAccentPlacements(
      "ù",
      "K_U",
      asciiCaseCounterpart,
    );

    const lower = placements.filter((p) => p.layer === "default");
    const upper = placements.filter((p) => p.layer === "shift");

    expect(lower.map((p) => p.char)).toEqual(["ú", "û", "ü", "ũ", "ů"]);
    expect(upper.map((p) => p.char)).toEqual(["Ù", "Ú", "Û", "Ü", "Ũ", "Ů"]);
  });

  it("e-family: the priority order reaches cedilla (e with ring-above has no precomposed form) and still caps at 6", () => {
    const placements = siblingAccentPlacements(
      "é",
      "K_E",
      asciiCaseCounterpart,
    );

    const lower = placements.filter((p) => p.layer === "default");
    // grave, [accepted acute excluded], circumflex, diaeresis, tilde,
    // [ring-above has no precomposed e-form, skipped], cedilla — 6 total
    // candidates considered, 5 remain after excluding the accepted é.
    expect(lower.map((p) => p.char)).toEqual(["è", "ê", "ë", "ẽ", "ȩ"]);
    expect(lower.length).toBeLessThanOrEqual(6);
  });

  it("caps the candidate set at 6 even when more of the priority list would compose", () => {
    // Every mark in the priority list happens to compose against "a", so the
    // 6-cap is exercised by "a" itself (used directly, not an accepted
    // sibling) to confirm cedilla/ogonek/caron/macron/dot-above never appear.
    const placements = siblingAccentPlacements(
      "a",
      "K_A",
      asciiCaseCounterpart,
    );
    const lower = placements.filter((p) => p.layer === "default");
    expect(lower.length).toBe(6);
    expect(lower.map((p) => p.char)).toEqual([
      "à",
      "á",
      "â",
      "ä",
      "ã",
      "å",
    ]);
  });

  it("excludes a candidate's shift placement when caseCounterpart reports no confident uppercase, but keeps its default placement", () => {
    const placements = siblingAccentPlacements(
      "a",
      "K_A",
      caseCounterpartExcept("â"),
    );
    const lower = placements.filter((p) => p.layer === "default");
    const upper = placements.filter((p) => p.layer === "shift");

    expect(lower.map((p) => p.char)).toContain("â");
    expect(upper.map((p) => p.char)).not.toContain("Â");
    // Every other sibling still gets its uppercase.
    expect(upper.map((p) => p.char)).toEqual(["À", "Á", "Ä", "Ã", "Å"]);
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

  it("returns [] for a base with no composable siblings under any priority mark", () => {
    // "q" has no precomposed accented forms in Unicode for any mark in the
    // priority list.
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
