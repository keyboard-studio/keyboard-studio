import { describe, expect, it } from "vitest";
import type { PlacementWorklist } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import {
  applyMarkGuards,
  MARKS_GUARD_GROUP,
  MARKS_UNWRAP_FROM_STORE,
  MARKS_UNWRAP_TO_STORE,
} from "./mark-guards.js";

const ACUTE = "́";

const BASE_KMN = [
  'store(&NAME) "Guard fixture"',
  "begin Unicode > use(main)",
  "group(main) using keys",
  '+ "a" > "a"',
  "",
].join("\n");

function worklist(overrides: Partial<PlacementWorklist> = {}): PlacementWorklist {
  return {
    ownLetterUnits: [],
    markUnits: [],
    blockedCombinations: [],
    ...overrides,
  };
}

describe("applyMarkGuards — blocking (FR-021 swallow)", () => {
  it("adds a guard group with one swallow rule per blocked pair + the match hop", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(
      ir,
      worklist({
        blockedCombinations: [
          { base: "k", mark: ACUTE },
          { base: "b", mark: ACUTE },
        ],
      }),
      "base-plus-mark",
    );
    expect(result.blockingRuleCount).toBe(2);
    const guard = result.ir.groups.find((g) => g.name === MARKS_GUARD_GROUP);
    expect(guard).toBeDefined();
    expect(guard?.usingKeys).toBe(false);
    // Swallow shape: context [base, mark] → output [base].
    expect(guard?.rules[0]?.context).toEqual([
      { kind: "char", value: "k" },
      { kind: "char", value: ACUTE },
    ]);
    expect(guard?.rules[0]?.output).toEqual([{ kind: "char", value: "k" }]);
    // The entry group gained a match > use(guard) hop.
    const main = result.ir.groups.find((g) => g.name === "main");
    const hop = main?.rules.find((r) => r.matchKind === "match");
    expect(hop?.output).toContainEqual({ kind: "useGroup", groupName: MARKS_GUARD_GROUP });
  });

  it("round-trips through the codec emitter", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(
      ir,
      worklist({ blockedCombinations: [{ base: "k", mark: ACUTE }] }),
      "base-plus-mark",
    );
    const emitted = emit(result.ir);
    expect(emitted).toContain(`group(${MARKS_GUARD_GROUP})`);
    expect(emitted).toContain("match > use(generated_marks_guard)");
  });

  it("is idempotent — re-applying replaces rather than duplicates", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const once = applyMarkGuards(
      ir,
      worklist({ blockedCombinations: [{ base: "k", mark: ACUTE }] }),
      "base-plus-mark",
    );
    const twice = applyMarkGuards(
      once.ir,
      worklist({ blockedCombinations: [{ base: "k", mark: ACUTE }] }),
      "base-plus-mark",
    );
    expect(twice.ir.groups.filter((g) => g.name === MARKS_GUARD_GROUP)).toHaveLength(1);
    const main = twice.ir.groups.find((g) => g.name === "main");
    expect(main?.rules.filter((r) => r.matchKind === "match")).toHaveLength(1);
  });
});

describe("applyMarkGuards — stepwise backspace unwrap", () => {
  it("generates the store pair + any/index backspace rule for ready-made units", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(
      ir,
      worklist({ ownLetterUnits: ["e", "é", "ệ"] }),
      "ready-made",
    );
    expect(result.unwrapPairCount).toBe(2); // é and ệ; plain e has no marks
    const from = result.ir.stores.find((s) => s.name === MARKS_UNWRAP_FROM_STORE);
    const to = result.ir.stores.find((s) => s.name === MARKS_UNWRAP_TO_STORE);
    expect(from?.items.map((i) => (i.kind === "char" ? i.value : "?"))).toEqual(["é", "ệ"]);
    // ệ (circumflex outermost in NFD order: underdot then circumflex) peels to ẹ.
    expect(to?.items.map((i) => (i.kind === "char" ? i.value : "?"))).toEqual(["e", "ẹ"]);
    const main = result.ir.groups.find((g) => g.name === "main");
    const rule = main?.rules.find((r) => r.nodeId === "gen-marks-unwrap-rule");
    expect(rule?.context).toEqual([
      { kind: "any", storeRef: MARKS_UNWRAP_FROM_STORE },
      { kind: "vkey", name: "K_BKSP", modifiers: [] },
    ]);
    expect(rule?.output).toEqual([
      { kind: "index", storeRef: MARKS_UNWRAP_TO_STORE, offset: 1 },
    ]);
  });

  it("generates nothing under the base-plus-mark form (native peel)", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(ir, worklist({ ownLetterUnits: ["é"] }), "base-plus-mark");
    expect(result.unwrapPairCount).toBe(0);
    expect(result.ir.stores.some((s) => s.name === MARKS_UNWRAP_FROM_STORE)).toBe(false);
  });

  it("returns the IR unchanged (same reference) when there is nothing to do", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(ir, worklist(), "base-plus-mark");
    expect(result.ir).toBe(ir);
  });
});
