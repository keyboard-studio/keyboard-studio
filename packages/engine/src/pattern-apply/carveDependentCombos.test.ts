// Regression: carving a character must also drop the DERIVED combos that
// depend on it — the backspace-unwrap (deconstruction) pair and any
// unreferenced store still listing it — so that both touch-layout consumers
// stop reporting the character as produced.
//
// The shipped defect this pins, reproduced on `sil_cameroon_qwerty`: carving
// `æ` removed its producing rule and its deadkey output slot, but left `æ`
// sitting in `store(comp-dia)` — the output half of
//
//     store(composed) "…ǽ…ǣ…"          <- composable outputs
//     store(comp-dia) "…æ…æ…"          <- the same, minus one diacritic
//     any(composed) + [K_BKSP] > index(comp-dia,1)
//
// `collectCharContributors` skipped that rule wholesale (correct for "is this
// how you type æ?", wrong for "does this slot depend on æ?"), so `comp-dia`
// kept `æ`, which kept `æ` inside `buildProducedSet`, which made BOTH touch
// paths conclude it was still produced and leave its keycap standing:
//
//   * adapt   — `collectCarvedKeycapTexts`' survivor guard saw a live
//               cross-paired producer and dropped `æ` from the carved set, so
//               `applyCarveKeycapRemovalsToVfs` never blanked the keycap.
//   * reseed  — `deriveDesktopModifications` (studio) diffs
//               `buildProducedSet(baseIr)` against the carve-projected IR; `æ`
//               was in both, so it never entered `mods.removals`.
//
// Nominating the slot fixes both at once, which is why this test asserts
// against those two consumers rather than only against the contributor list:
// they are the surfaces the author actually sees, and neither needed a change
// of its own.
//
// Fixture is embedded (not the `../keyboards` checkout) so this runs everywhere.

import { describe, it, expect } from "vitest";
import type { IRRule, IRStore, KeyboardIR } from "@keyboard-studio/contracts";
import { buildProducedSet } from "@keyboard-studio/contracts";
import { collectCharContributors } from "./collectCharContributors.js";
import { applyStoreSlotRemovals } from "./applyStoreSlotRemovals.js";
import { carveFilterIr } from "./carveFilterIr.js";
import { collectCarvedKeycapTexts } from "./applyCarveKeycapRemovalsToVfs.js";

const AE = "æ"; // æ
const AE_ACUTE = "ǽ"; // ǽ  (æ + acute)
const AE_MACRON = "ǣ"; // ǣ  (æ + macron)

function makeStore(nodeId: string, name: string, items: IRStore["items"]): IRStore {
  return { nodeId, name, items, isSystem: false };
}

function makeRule(nodeId: string, context: IRRule["context"], output: IRRule["output"]): IRRule {
  return { nodeId, context, output };
}

/**
 * Cameroon-shaped fixture: a single-function producer for `æ`, a deadkey
 * fan-out pair that also emits it, the generated backspace-unwrap pair that
 * lists it twice, and an unreferenced legacy alphabet store that still
 * declares it.
 */
function makeIR(): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "t", name: "T", bcp47: [], copyright: "", version: "1.0",
      targets: [], storeDirectives: [],
    },
    stores: [
      // Generated deconstruction pair — cross-paired via index(comp-dia,1).
      makeStore("s-composed", "composed", [
        { kind: "char", value: AE_ACUTE },
        { kind: "char", value: AE_MACRON },
        { kind: "char", value: "é" }, // é — unrelated, must survive
      ]),
      makeStore("s-compdia", "comp-dia", [
        { kind: "char", value: AE },
        { kind: "char", value: AE },
        { kind: "char", value: "e" },
      ]),
      // Deadkey fan-out pair — a genuine producer of æ at index 1.
      makeStore("s-dkf", "dkf003b", [
        { kind: "char", value: "a" },
        { kind: "char", value: "a" },
      ]),
      makeStore("s-dkt", "dkt003b", [
        { kind: "char", value: "ɑ" }, // ɑ — unrelated
        { kind: "char", value: AE },
      ]),
      // Referenced by nothing at all (the `letter`/`lc`/`uc` shape).
      makeStore("s-legacy", "letter", [
        { kind: "char", value: "a" },
        { kind: "char", value: AE },
      ]),
    ],
    groups: [{
      nodeId: "g1", name: "main", usingKeys: true, readonly: false,
      rules: [
        // Single-function producer.
        makeRule("r-direct", [{ kind: "vkey", name: "K_F", modifiers: [] }], [
          { kind: "char", value: AE },
        ]),
        // Deadkey fan-out.
        makeRule("r-fanout", [
          { kind: "deadkey", id: 0x003b },
          { kind: "any", storeRef: "dkf003b" },
        ], [{ kind: "index", storeRef: "dkt003b", offset: 2 }]),
        // The generated backspace unwrap.
        makeRule("r-unwrap", [
          { kind: "any", storeRef: "composed" },
          { kind: "raw", text: "+" },
          { kind: "vkey", name: "K_BKSP", modifiers: [] },
        ], [{ kind: "index", storeRef: "comp-dia", offset: 1 }]),
      ],
    }],
    comments: [], raw: [], recognizedPatterns: [],
  } as KeyboardIR;
}

/** The carve projection the studio applies: slot nul-fill, then whole-node filter. */
function carve(ir: KeyboardIR, target: string) {
  const contributors = collectCharContributors(ir, target);
  const slotIds = new Set(contributors.storeSlotIds);
  const wholeNodeIds = new Set(contributors.ruleNodeIds);
  const removal = applyStoreSlotRemovals(ir, slotIds);
  return {
    contributors,
    slotIds,
    wholeNodeIds,
    warnings: removal.warnings,
    ir: carveFilterIr(removal.ir, wholeNodeIds),
  };
}

function itemsOf(ir: KeyboardIR, storeName: string): string[] {
  const store = ir.stores.find((s) => s.name === storeName);
  if (store === undefined) throw new Error(`no store ${storeName}`);
  return store.items.map((i) => (i.kind === "char" ? i.value : `<${i.kind}>`));
}

describe("carve: derived combos that depend on the carved character", () => {
  it("nominates the backspace-unwrap slots for removal, but never as a producing method", () => {
    const { contributors } = carve(makeIR(), AE);

    expect(contributors.storeSlotIds).toContain("s-compdia#0");
    expect(contributors.storeSlotIds).toContain("s-compdia#1");

    // The unwrap rule is a correction, not a method: it must never be offered
    // as a whole-rule delete (its other rows serve other characters) and its
    // slots must never be badged `produced`.
    expect(contributors.ruleNodeIds).not.toContain("r-unwrap");
    const unwrapSlotIndexes = contributors.storeSlots
      .map((s, i) => ({ ...s, i }))
      .filter((s) => s.slotId.startsWith("s-compdia#"));
    expect(unwrapSlotIndexes).toHaveLength(2);
    for (const slot of unwrapSlotIndexes) {
      expect(slot.role).toBe("input");
      const descriptor = contributors.descriptors[contributors.ruleNodeIds.length + slot.i];
      expect(descriptor?.producedRole).toBe("used");
    }
  });

  it("drops the now-dead composed combos in lockstep with their unwrap partners", () => {
    const { ir, warnings } = carve(makeIR(), AE);
    expect(warnings).toEqual([]);

    // ǽ and ǣ were reachable only by composing onto æ, so both rows go — and
    // the coordinated pair stays aligned (applyStoreSlotRemovals' pairing
    // graph does this; the fix only had to nominate the comp-dia side).
    expect(itemsOf(ir, "composed")).toEqual(["é"]);
    expect(itemsOf(ir, "comp-dia")).toEqual(["e"]);
  });

  it("prunes an unreferenced store that still lists the character", () => {
    const { ir } = carve(makeIR(), AE);
    expect(itemsOf(ir, "letter")).toEqual(["a"]);
  });

  it("removes the character from the produced set — the reseed path's removals diff", () => {
    const base = makeIR();
    const { ir } = carve(base, AE);
    const before = buildProducedSet(base);
    const after = buildProducedSet(ir);

    expect(before.has(AE)).toBe(true);
    expect(after.has(AE)).toBe(false);
    // This diff IS `deriveDesktopModifications`' `removals`. Only `æ` appears:
    // `ǽ`/`ǣ` were never in the produced set to begin with, because `composed`
    // is an `any()`-consumed INPUT store and the unwrap rule DECONSTRUCTS
    // rather than produces. Their rows are still dropped (asserted above) —
    // they are dead weight referencing a removed character, not lost output.
    expect([...before].filter((c) => !after.has(c))).toEqual([AE]);
  });

  it("blanks the keycap — the adapt path's survivor guard no longer sees a live producer", () => {
    const base = makeIR();
    const { slotIds, wholeNodeIds } = carve(base, AE);
    const carved = collectCarvedKeycapTexts(base, { slotIds, wholeNodeIds });
    expect(carved.has(AE)).toBe(true);
  });

  it("does not over-reach: an unrelated character keeps every mechanism", () => {
    const { ir } = carve(makeIR(), AE);
    const produced = buildProducedSet(ir);
    // `e` is the untouched third row of the unwrap pair.
    expect(produced.has("e")).toBe(true);
    // `ɑ` shares the deadkey fan-out store with æ but sits at another slot.
    expect(produced.has("ɑ")).toBe(true);
    // ...and the surviving unwrap row keeps both halves aligned.
    expect(itemsOf(ir, "composed")).toEqual(["é"]);
    expect(itemsOf(ir, "comp-dia")).toEqual(["e"]);
  });

  it("a carved character that is only the INPUT half of an unwrap row drops that row too", () => {
    // Carving ǽ (which sits in `composed`, the input side) must take its
    // comp-dia partner with it — the mirror of the æ case above.
    const { ir } = carve(makeIR(), AE_ACUTE);
    expect(itemsOf(ir, "composed")).toEqual([AE_MACRON, "é"]);
    expect(itemsOf(ir, "comp-dia")).toEqual([AE, "e"]);
  });
});
