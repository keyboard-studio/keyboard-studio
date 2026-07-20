/**
 * Directionality classifier unit tests (spec 043 US3; FR-031; AS #2). An RTL
 * produced script → rtl; both directions → bidi-aware; LTR → ltr.
 */

import { describe, it, expect } from "vitest";

import { parse } from "../../packages/engine/src/codec/index.js";
import { classifyDirectionality, directionalityFallback } from "./directionality-classifier.js";
import type { FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const DEF: FacetDefinition = {
  id: "directionality",
  title: "Directionality",
  description: "Writing direction of the produced characters.",
  valueType: "enum",
  limits: { values: ["ltr", "rtl", "bidi-aware"], open: false },
  likelihoodSemantics: "direction of the attested produced scripts",
  derivation: { archetype: "character-content", classifierId: "directionality-classifier", fallbackChain: ["content-derived", "undetermined"] },
  feedsSessionFacets: [],
  schemaVersion: 1,
};

const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'Test'
store(&TARGETS) 'any'

begin Unicode > use(main)

group(main) using keys
`;

describe("classifyDirectionality", () => {
  it("Latin output → ltr", () => {
    const { ir } = parse(`${HEADER}\n+ [K_A] > 'a'\n+ [K_B] > 'b'\n`, "ltr");
    expect(classifyDirectionality(ir, DEF)!.value).toBe("ltr");
  });

  it("Arabic output → rtl", () => {
    const { ir } = parse(`${HEADER}\n+ [K_A] > U+0628\n+ [K_B] > U+062A\n`, "rtl");
    expect(classifyDirectionality(ir, DEF)!.value).toBe("rtl");
  });

  it("mixed Arabic + Latin output → bidi-aware", () => {
    const { ir } = parse(`${HEADER}\n+ [K_A] > U+0628\n+ [K_B] > 'b'\n`, "bidi");
    expect(classifyDirectionality(ir, DEF)!.value).toBe("bidi-aware");
  });

  it("no concrete script (digits only) → null (fall through)", () => {
    const { ir } = parse(`${HEADER}\n+ [K_1] > '1'\n`, "neutral");
    expect(classifyDirectionality(ir, DEF)).toBeNull();
  });
});

describe("directionalityFallback", () => {
  it("returns an honest undetermined fallback-only record", () => {
    const result = directionalityFallback({ id: "x" } as unknown as ScannedKeyboard, DEF);
    expect(result.analysisOutcome).toBe("fallback-only");
    expect(result.provenanceTier).not.toBe("content-derived");
  });
});
