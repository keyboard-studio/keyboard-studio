/**
 * siblingAccents — pure placement-generation tests for the longpress
 * accelerator (accept ù on u -> propose the rest of u's diacritic family that
 * the language actually uses).
 *
 * The generator is INVENTORY-DRIVEN: siblings come only from the characters
 * the author put in their language. These tests pin that rule, the
 * lowercase/uppercase -> default/shift layer split, and the common-first
 * ordering.
 */

import { describe, it, expect } from "vitest";
import { siblingAccentPlacements } from "./siblingAccents.ts";

describe("siblingAccentPlacements", () => {
  it("offers only inventory siblings of the base, split by case into default/shift layers", () => {
    const inventory = ["ù", "ú", "û", "ü", "Ù", "Ú", "é"];
    const placements = siblingAccentPlacements("ù", "K_U", inventory);

    const lower = placements.filter((p) => p.layer === "default").map((p) => p.char);
    const upper = placements.filter((p) => p.layer === "shift").map((p) => p.char);

    // ù is the accepted char (excluded); é belongs to base "e" (excluded).
    expect(lower).toEqual(["ú", "û", "ü"]);
    expect(upper).toEqual(["Ù", "Ú"]);
    expect(placements.every((p) => p.hostKey === "K_U")).toBe(true);
  });

  it("adds ONLY characters in the inventory — never Unicode 'extras'", () => {
    // The language uses only ù and ú on base u. û ü ũ ů etc. must NOT appear
    // even though they are valid Unicode accents of u.
    const placements = siblingAccentPlacements("ù", "K_U", ["ù", "ú"]);
    expect(placements.map((p) => p.char)).toEqual(["ú"]);
  });

  it("orders siblings common-accents-first (grave, acute, circumflex, diaeresis, ...)", () => {
    // Inventory deliberately out of order; output must follow the priority.
    const inventory = ["e", "ë", "è", "ê", "é"];
    const lower = siblingAccentPlacements("é", "K_E", inventory)
      .filter((p) => p.layer === "default")
      .map((p) => p.char);
    // é is excluded (accepted); "e" is not accented (excluded).
    expect(lower).toEqual(["è", "ê", "ë"]);
  });

  it("places an uppercase-only sibling on the shift layer", () => {
    const placements = siblingAccentPlacements("è", "K_E", ["è", "È"]);
    expect(placements).toEqual([{ char: "È", hostKey: "K_E", layer: "shift" }]);
  });

  it("excludes the accepted char itself", () => {
    const chars = siblingAccentPlacements("à", "K_A", ["à", "á"]).map((p) => p.char);
    expect(chars).not.toContain("à");
    expect(chars).toEqual(["á"]);
  });

  it("offers Cyrillic siblings sharing a non-Latin base (script-neutral gate, shaped-bug fix)", () => {
    // и (U+0438) is the shared base; й (breve, U+0439) is accepted and
    // excluded, leaving its two OTHER inventory siblings: ѝ (grave, U+045D)
    // and ӥ (diaeresis, U+04E5). Under the old `/^[a-z]$/` Latin-only gate
    // this would have returned [] outright (baseLetterOf("й") === "и" fails
    // `/^[a-z]$/`) — this pins the broadened `\p{L}` gate actually returning
    // BOTH non-Latin siblings, not merely declining to crash on them.
    const placements = siblingAccentPlacements("й", "K_I", ["и", "й", "ѝ", "ӥ"]);
    const lower = placements
      .filter((p) => p.layer === "default")
      .map((p) => p.char);

    // и is the base letter (not itself accented — excluded); й is the
    // accepted char (excluded). Ordered grave-before-diaeresis per
    // DIACRITIC_PRIORITY.
    expect(lower).toEqual(["ѝ", "ӥ"]);
    expect(placements.every((p) => p.hostKey === "K_I")).toBe(true);
  });

  it("returns [] when no inventory character shares the base", () => {
    const placements = siblingAccentPlacements("ù", "K_U", ["ù", "é", "ñ"]);
    expect(placements).toEqual([]);
  });

  it("accepts a ReadonlySet inventory as well as an array", () => {
    const placements = siblingAccentPlacements(
      "à",
      "K_A",
      new Set(["à", "á", "â"]),
    );
    expect(placements.map((p) => p.char)).toEqual(["á", "â"]);
  });
});
