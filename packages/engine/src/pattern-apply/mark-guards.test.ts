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

// Fixture with a pre-existing foreign match rule (a use() hop to some other
// group that has nothing to do with the marks guard).
const FOREIGN_MATCH_KMN = [
  'store(&NAME) "Guard fixture"',
  "begin Unicode > use(main)",
  "group(main) using keys",
  '+ "a" > "a"',
  "match > use(somewhere_else)",
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
    // The swallow rule itself, verbatim: [base, mark] context > [base]. The
    // combining mark must emit as a standalone U+XXXX token, never a quoted
    // literal that would attach to a neighbouring char in source.
    expect(emitted).toContain("U+006B U+0301 > U+006B");
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
      { kind: "raw", text: "+" },
      { kind: "vkey", name: "K_BKSP", modifiers: [] },
    ]);
    expect(rule?.output).toEqual([
      { kind: "index", storeRef: MARKS_UNWRAP_TO_STORE, offset: 1 },
    ]);
  });

  it("emits a valid any(...) + [K_BKSP] > index(...) line (no leading +)", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(
      ir,
      worklist({ ownLetterUnits: ["e", "é"] }),
      "ready-made",
    );
    const emitted = emit(result.ir);
    expect(emitted).toContain(
      `any(${MARKS_UNWRAP_FROM_STORE}) + [K_BKSP] > index(${MARKS_UNWRAP_TO_STORE}, 1)`,
    );
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

describe("applyMarkGuards — guard-hop purity, idempotency, ordering", () => {
  it("does not mutate an existing match rule from the input IR (purity)", () => {
    const { ir } = parse(FOREIGN_MATCH_KMN, "guards");
    const before = JSON.parse(JSON.stringify(ir));
    applyMarkGuards(
      ir,
      worklist({ blockedCombinations: [{ base: "k", mark: ACUTE }] }),
      "base-plus-mark",
    );
    expect(JSON.parse(JSON.stringify(ir))).toEqual(before);
  });

  it("skips the guard hop (and leaves the rule untouched) when an existing match rule already ends with a foreign use()", () => {
    const { ir } = parse(FOREIGN_MATCH_KMN, "guards");
    const result = applyMarkGuards(
      ir,
      worklist({ blockedCombinations: [{ base: "k", mark: ACUTE }] }),
      "base-plus-mark",
    );
    expect(result.guardHopSkipped).toBe(true);
    const main = result.ir.groups.find((g) => g.name === "main");
    const match = main?.rules.find((r) => r.matchKind === "match");
    expect(match?.output).toEqual([{ kind: "raw", text: "use(somewhere_else)" }]);
    expect(
      match?.output.some((o) => o.kind === "useGroup" && o.groupName === MARKS_GUARD_GROUP),
    ).toBe(false);
  });

  it("does not append a second useGroup when re-applied against an already-hopped match rule", () => {
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
    const main = twice.ir.groups.find((g) => g.name === "main");
    const match = main?.rules.find((r) => r.matchKind === "match");
    expect(
      match?.output.filter((o) => o.kind === "useGroup" && o.groupName === MARKS_GUARD_GROUP),
    ).toHaveLength(1);
  });

  it("inserts the unwrap rule before an existing match/nomatch rule (kmcmplib ordering)", () => {
    const { ir } = parse(FOREIGN_MATCH_KMN, "guards");
    const result = applyMarkGuards(
      ir,
      worklist({ ownLetterUnits: ["e", "é"] }),
      "ready-made",
    );
    const main = result.ir.groups.find((g) => g.name === "main");
    const rules = main?.rules ?? [];
    const unwrapIndex = rules.findIndex((r) => r.nodeId === "gen-marks-unwrap-rule");
    const matchIndex = rules.findIndex((r) => r.matchKind === "match");
    expect(unwrapIndex).toBeGreaterThanOrEqual(0);
    expect(matchIndex).toBeGreaterThanOrEqual(0);
    expect(unwrapIndex).toBeLessThan(matchIndex);
  });
});
