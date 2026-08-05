/**
 * Spare-key-budget classifier unit tests (spec 043 US2; FR-022; AS #3).
 *
 * Fixtures use the real codec, generating rules over the stock `kbdus` physical
 * key set so the SHIFT / AltGr saturation boundaries (half of N) are exercised
 * honestly. Reserved (Ctrl/Alt) chords are excluded from the budget.
 */

import { describe, it, expect } from "vitest";

import { parse } from "../../packages/engine/src/codec/index.js";
import { classifySpareKeyBudget, spareKeyBudgetFallback } from "./spare-key-budget-classifier.js";
import { loadBaseLayoutTable, DEFAULT_BASELAYOUT } from "./base-layout.js";
import type { FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const DEF: FacetDefinition = {
  id: "spare-key-budget",
  title: "Spare-key budget",
  description: "Room to place more characters (axis A7).",
  valueType: "enum",
  limits: { values: ["many", "ralt-only", "fully-booked"], open: false },
  likelihoodSemantics: "SHIFT/AltGr-plane saturation over the stock key set",
  derivation: { archetype: "rule-structure", classifierId: "spare-key-budget-classifier", fallbackChain: ["content-derived", "undetermined"] },
  feedsSessionFacets: ["source.spare-key-budget"],
  schemaVersion: 1,
};

const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'Test'
store(&TARGETS) 'any'

begin Unicode > use(main)

group(main) using keys
`;

/** Every stock kbdus physical key vkey (the placement universe). */
const STOCK_VKEYS = [...(loadBaseLayoutTable().get(DEFAULT_BASELAYOUT)?.keys() ?? [])];

function rulesFor(modifier: string): string {
  // One output char per key; the output value is irrelevant to the plane count.
  return STOCK_VKEYS.map((vk) => `+ [${modifier} ${vk}] > 'x'`).join("\n");
}

describe("classifySpareKeyBudget", () => {
  it("few shift binds → many", () => {
    const kmn = `${HEADER}\n+ [SHIFT K_A] > 'A'\n+ [SHIFT K_B] > 'B'\n+ [SHIFT K_C] > 'C'\n`;
    const { ir } = parse(kmn, "many");
    const result = classifySpareKeyBudget(ir, DEF)!;
    expect(result.value).toBe("many");
    expect(result.provenanceTier).toBe("content-derived");
  });

  it("full SHIFT plane, empty AltGr → ralt-only", () => {
    const kmn = `${HEADER}\n${rulesFor("SHIFT")}\n`;
    const { ir } = parse(kmn, "ralt-only");
    const result = classifySpareKeyBudget(ir, DEF)!;
    expect(result.value).toBe("ralt-only");
  });

  it("full SHIFT and AltGr planes → fully-booked", () => {
    const kmn = `${HEADER}\n${rulesFor("SHIFT")}\n${rulesFor("RALT")}\n`;
    const { ir } = parse(kmn, "fully-booked");
    const result = classifySpareKeyBudget(ir, DEF)!;
    expect(result.value).toBe("fully-booked");
  });

  it("reserved Ctrl chords are excluded from the budget (→ many)", () => {
    const kmn = `${HEADER}\n${rulesFor("CTRL")}\n`;
    const { ir } = parse(kmn, "reserved");
    const result = classifySpareKeyBudget(ir, DEF)!;
    expect(result.value).toBe("many"); // Ctrl chords do not consume shift/AltGr budget
    expect(result.evidenceSize).toBe(0);
  });

  it("no physical-key rules → null (fall through)", () => {
    const { ir } = parse(HEADER, "empty");
    expect(classifySpareKeyBudget(ir, DEF)).toBeNull();
  });
});

describe("spareKeyBudgetFallback", () => {
  it("returns an honest undetermined fallback-only record", () => {
    const result = spareKeyBudgetFallback({ id: "broken" } as unknown as ScannedKeyboard, DEF);
    expect(result.analysisOutcome).toBe("fallback-only");
    expect(result.provenanceTier).not.toBe("content-derived");
  });
});
