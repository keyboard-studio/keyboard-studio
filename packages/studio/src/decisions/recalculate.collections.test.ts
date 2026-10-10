// Scenario 5 tests (spec 093 T008): collection values recompute PER ITEM
// under the general rule — suggested items (`derived`/`extracted`)
// recompute, hand-set items (`asked`) stay, and orphaned hand-set items
// are shown, not deleted. This is spec 014's repropagate contract
// (R2/R4/R6) restated over any collection carrying per-item provenance
// (090 FR-006's ruled flat enum), not just the touch surface.

import { describe, it, expect } from "vitest";
import type { QuestionModule } from "../survey/types.ts";
import type { Decision, DecisionId, DecisionSet } from "./decisionTypes.ts";
import type { ExtractContext } from "./extractContext.ts";
import { providerFromModules } from "./replayKeyboard.ts";
import { recalculate } from "./recalculate.ts";

const mod = (partial: Partial<QuestionModule> & { id: string }): QuestionModule => ({
  definition: { id: partial.id, type: "text", prompt: partial.id },
  fixtures: { valid: [], invalid: [] },
  ...partial,
} as QuestionModule);

const rec = (partial: Partial<Decision> & { id: DecisionId }): Decision =>
  ({ value: undefined, provenance: "asked", ...partial }) as Decision;

const CTX = { ir: null, catalog: null } as ExtractContext;

interface Item {
  id: string;
  provenance: "asked" | "derived" | "extracted";
  label?: string;
}

// windows-layout drives carved-layout, whose value is the landed
// collection shape: an object carrying an item array with per-item
// provenance (CarvedLayoutValue.removals).
const layoutModule = mod({ id: "q_layout", provides: ["windows-layout"] });
const carveModule = mod({
  id: "q_carve",
  provides: ["carved-layout"],
  requires: ["windows-layout"],
});
const MODULES = [layoutModule, carveModule];
const ORDER: DecisionId[] = ["windows-layout", "carved-layout"];

function runWith(freshItems: Item[], currentItems: Item[]) {
  const decisions: DecisionSet = {
    "windows-layout": rec({ id: "windows-layout", value: "intl", provenance: "asked" }),
    "carved-layout": rec({
      id: "carved-layout",
      value: { removals: currentItems },
      provenance: "derived",
    }),
  };
  const out = recalculate(
    {
      providerFor: providerFromModules(MODULES),
      modules: MODULES,
      extractContext: CTX,
      recomputeValue: () => ({ removals: freshItems }),
    },
    { decisions, changed: new Set<DecisionId>(["windows-layout"]), order: ORDER },
  );
  const value = out.decisions["carved-layout"]?.value as { removals: Item[] };
  return { out, items: value.removals };
}

describe("recalculate — scenario 5: collections recompute per item", () => {
  it("suggested items recompute; hand-set items stay; new suggestions append", () => {
    const { out, items } = runWith(
      [
        { id: "a", provenance: "derived", label: "a-fresh" },
        { id: "e", provenance: "derived", label: "e-new" },
      ],
      [
        { id: "a", provenance: "derived", label: "a-stale" },
        { id: "b", provenance: "asked", label: "b-mine" },
      ],
    );
    expect(out.recomputed).toEqual(["carved-layout"]);
    expect(items).toEqual([
      { id: "a", provenance: "derived", label: "a-fresh" }, // recomputed
      { id: "b", provenance: "asked", label: "b-mine" }, // hand-set, kept
      { id: "e", provenance: "derived", label: "e-new" }, // new suggestion
    ]);
  });

  it("a withdrawn suggestion is dropped; a hand-set item in the same position is not (R6)", () => {
    const { items } = runWith(
      [{ id: "a", provenance: "derived", label: "a-fresh" }],
      [
        { id: "a", provenance: "derived" },
        { id: "d", provenance: "extracted", label: "d-withdrawn" },
      ],
    );
    expect(items.map((i) => i.id)).toEqual(["a"]);
  });

  it("orphaned hand-set items are kept and reported as shown-not-deleted (R6)", () => {
    const { out, items } = runWith(
      [{ id: "a", provenance: "derived", label: "a-fresh" }],
      [
        { id: "a", provenance: "derived" },
        { id: "gone", provenance: "asked", label: "my-removal" },
      ],
    );
    // The hand-set item whose basis vanished is still in the value…
    expect(items.map((i) => i.id)).toEqual(["a", "gone"]);
    // …and the decision is reported so the surface can show it.
    expect(out.orphaned).toEqual(["carved-layout"]);
  });

  it("a bare array value is a collection too", () => {
    const decisions: DecisionSet = {
      "windows-layout": rec({ id: "windows-layout", value: "intl", provenance: "asked" }),
      "carved-layout": rec({
        id: "carved-layout",
        value: [{ id: "a", provenance: "derived", label: "stale" }],
        provenance: "derived",
      }),
    };
    const out = recalculate(
      {
        providerFor: providerFromModules(MODULES),
        modules: MODULES,
        extractContext: CTX,
        recomputeValue: () => [{ id: "a", provenance: "derived", label: "fresh" }],
      },
      { decisions, changed: new Set<DecisionId>(["windows-layout"]), order: ORDER },
    );
    expect(out.decisions["carved-layout"]?.value).toEqual([
      { id: "a", provenance: "derived", label: "fresh" },
    ]);
  });

  it("no fresh list → the collection is kept untouched", () => {
    const decisions: DecisionSet = {
      "windows-layout": rec({ id: "windows-layout", value: "intl", provenance: "asked" }),
      "carved-layout": rec({
        id: "carved-layout",
        value: { removals: [{ id: "a", provenance: "derived" }] },
        provenance: "derived",
      }),
    };
    const out = recalculate(
      {
        providerFor: providerFromModules(MODULES),
        modules: MODULES,
        extractContext: CTX,
        recomputeValue: () => undefined,
      },
      { decisions, changed: new Set<DecisionId>(["windows-layout"]), order: ORDER },
    );
    expect(out.decisions["carved-layout"]).toBe(decisions["carved-layout"]);
    expect(out.recomputed).toEqual([]);
  });
});
