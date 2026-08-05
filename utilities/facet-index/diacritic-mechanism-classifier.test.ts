/**
 * Diacritic-mechanism classifier unit tests (spec 043 US2; FR-020; AS #1).
 *
 * Fixtures use the real codec. Combining-mark OUTPUT (U+0301 etc.) → a
 * stacking-combining site; a `dk(NNNN)` compose rule (deadkey in context, base
 * after it) → a replacing-cycling site; both present → multi-family; neither →
 * none. Deadkeys must be HEX (`dk(0001)`) — a named deadkey is opaque.
 */

import { describe, it, expect } from "vitest";

import { parse } from "../../packages/engine/src/codec/index.js";
import { classifyDiacriticMechanism, diacriticMechanismFallback } from "./diacritic-mechanism-classifier.js";
import type { FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const DEF: FacetDefinition = {
  id: "diacritic-mechanism",
  title: "Diacritic mechanism",
  description: "How the base applies diacritics (axis A4).",
  valueType: "enum",
  limits: { values: ["stacking-combining", "replacing-cycling", "multi-family", "none"], open: false },
  likelihoodSemantics: "plurality mechanism over diacritic-input rules; multi-family when both attested",
  derivation: { archetype: "rule-structure", classifierId: "diacritic-mechanism-classifier", fallbackChain: ["content-derived", "undetermined"] },
  feedsSessionFacets: ["source.diacritic-mechanism"],
  schemaVersion: 1,
};

const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'Test'
store(&TARGETS) 'any'

begin Unicode > use(main)

group(main) using keys
`;

describe("classifyDiacriticMechanism", () => {
  it("combining-mark output → stacking-combining", () => {
    const kmn = `${HEADER}\n+ [K_A] > 'a'\n+ [K_1] > U+0301\n+ [K_2] > U+0300\n`;
    const { ir } = parse(kmn, "stacking");
    const result = classifyDiacriticMechanism(ir, DEF)!;
    expect(result.value).toBe("stacking-combining");
    expect(result.provenanceTier).toBe("content-derived");
    expect(result.evidenceSize).toBe(2);
  });

  it("deadkey compose rules → replacing-cycling (arming rule is not a site)", () => {
    const kmn = `${HEADER}\n+ [K_QUOTE] > dk(0001)\ndk(0001) + 'a' > U+00E1\ndk(0001) + 'e' > U+00E9\n`;
    const { ir } = parse(kmn, "replacing");
    const result = classifyDiacriticMechanism(ir, DEF)!;
    expect(result.value).toBe("replacing-cycling");
    expect(result.evidenceSize).toBe(2); // two composes; the `> dk()` arming rule is not a site
  });

  it("both mechanisms present → multi-family", () => {
    const kmn = `${HEADER}\n+ [K_1] > U+0301\n+ [K_QUOTE] > dk(0001)\ndk(0001) + 'a' > U+00E1\n`;
    const { ir } = parse(kmn, "multi");
    const result = classifyDiacriticMechanism(ir, DEF)!;
    expect(result.value).toBe("multi-family");
  });

  it("table composition over a PLAIN base → stacking (the el_pasifika idiom)", () => {
    // any(plainVowels) + markKey > index(accentedStore) — no dk(), no raw
    // combining output; the mark is ADDED to a plain base.
    const kmn = `${HEADER}store(vwl) 'a' 'e' 'i'\nstore(acc) U+00E1 U+00E9 U+00ED\n+ any(vwl) > index(vwl,1)\nany(vwl) + [K_1] > index(acc,1)\n`;
    const { ir } = parse(kmn, "table-add");
    const result = classifyDiacriticMechanism(ir, DEF)!;
    expect(result.value).toBe("stacking-combining");
  });

  it("table composition over an ALREADY-ACCENTED base → replacing (the telex idiom)", () => {
    // any(accentedBase) + key > index(otherAccentedStore) — the mark is SWAPPED.
    const kmn = `${HEADER}store(sac) U+00E1 U+00E9 U+00ED\nstore(grv) U+00E0 U+00E8 U+00EC\nany(sac) + [K_1] > index(grv,1)\n`;
    const { ir } = parse(kmn, "table-replace");
    const result = classifyDiacriticMechanism(ir, DEF)!;
    expect(result.value).toBe("replacing-cycling");
  });

  it("no diacritic-input rule → content-derived none", () => {
    const kmn = `${HEADER}\n+ [K_A] > 'a'\n+ [K_B] > 'b'\n`;
    const { ir } = parse(kmn, "none");
    const result = classifyDiacriticMechanism(ir, DEF)!;
    expect(result.value).toBe("none");
    expect(result.provenanceTier).toBe("content-derived");
    expect(result.evidenceSize).toBe(0);
  });

  it("no rule surface → null (fall through)", () => {
    const { ir } = parse(HEADER, "empty");
    expect(classifyDiacriticMechanism(ir, DEF)).toBeNull();
  });
});

describe("diacriticMechanismFallback", () => {
  it("returns an honest undetermined fallback-only record", () => {
    const result = diacriticMechanismFallback({ id: "broken" } as unknown as ScannedKeyboard, DEF);
    expect(result.analysisOutcome).toBe("fallback-only");
    expect(result.provenanceTier).not.toBe("content-derived");
    expect(result.value).toBeUndefined();
  });
});
