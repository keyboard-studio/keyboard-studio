import { describe, expect, it } from "vitest";
import type { AttestedStack, PlacementWorklist } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import {
  applyMarkGuards,
  MARKS_GUARD_GROUP,
  MARKS_UNWRAP_FROM_STORE,
  MARKS_UNWRAP_TO_STORE,
  MARKS_WHOLESTACK_RULE_PREFIX,
} from "./mark-guards.js";

const ACUTE = "́";
const CIRCUMFLEX = "̂";

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

describe("applyMarkGuards — backspace answer gating (#2302)", () => {
  it("ready-made + whole-stack suppresses the unwrap generation (the follow pairing is native)", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(ir, worklist({ ownLetterUnits: ["e", "é"] }), "ready-made", "whole-stack");
    expect(result.unwrapPairCount).toBe(0);
    expect(result.ir.stores.some((s) => s.name === MARKS_UNWRAP_FROM_STORE)).toBe(false);
    // Nothing else to generate — the IR comes back unchanged.
    expect(result.ir).toBe(ir);
  });

  it("ready-made + peel generates the unwrap (the override pairing)", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(ir, worklist({ ownLetterUnits: ["e", "é"] }), "ready-made", "peel");
    expect(result.unwrapPairCount).toBe(1);
    expect(result.ir.stores.some((s) => s.name === MARKS_UNWRAP_FROM_STORE)).toBe(true);
  });

  it("base-plus-mark + peel generates nothing (native)", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(ir, worklist({ ownLetterUnits: ["é"] }), "base-plus-mark", "peel", [
      { base: "e", marks: [ACUTE] },
    ]);
    expect(result.wholeStackRuleCount).toBe(0);
    expect(result.ir).toBe(ir);
  });

  it("flipping the answer tears the previous pairing's generation down", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const wl = worklist({ ownLetterUnits: ["e", "é"] });
    const peeled = applyMarkGuards(ir, wl, "ready-made", "peel");
    expect(peeled.ir.stores.some((s) => s.name === MARKS_UNWRAP_FROM_STORE)).toBe(true);
    const stacked = applyMarkGuards(peeled.ir, wl, "ready-made", "whole-stack");
    expect(stacked.ir.stores.some((s) => s.name === MARKS_UNWRAP_FROM_STORE)).toBe(false);
    const main = stacked.ir.groups.find((g) => g.name === "main");
    expect(main?.rules.some((r) => r.nodeId === "gen-marks-unwrap-rule")).toBe(false);
  });
});

describe("applyMarkGuards — whole-stack backspace (base-plus-mark + whole-stack, #2302)", () => {
  const STACKS: AttestedStack[] = [
    { base: "e", marks: [ACUTE] },
    { base: "a", marks: [CIRCUMFLEX, ACUTE] },
    { base: "o", marks: [ACUTE] },
  ];

  function wholeStackRules(ir: ReturnType<typeof parse>["ir"]) {
    const main = ir.groups.find((g) => g.name === "main");
    return (main?.rules ?? []).filter((r) => r.nodeId.startsWith(MARKS_WHOLESTACK_RULE_PREFIX));
  }

  /** The character context of a rule, as a plain string (before the `+ [K_BKSP]`). */
  function contextString(rule: { context: readonly { kind: string; value?: string }[] }): string {
    return rule.context
      .filter((el) => el.kind === "char")
      .map((el) => el.value ?? "")
      .join("");
  }

  it("generates one rule per reachable sequence — every stack and each emitted prefix", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(ir, worklist(), "base-plus-mark", "whole-stack", STACKS);
    // e+´, a+ˆ, a+ˆ+´, o+´ — the two-mark stack contributes itself AND its prefix.
    expect(result.wholeStackRuleCount).toBe(4);
    const rules = wholeStackRules(result.ir);
    expect(rules.map(contextString).sort()).toEqual(
      ["e" + ACUTE, "a" + CIRCUMFLEX, "a" + CIRCUMFLEX + ACUTE, "o" + ACUTE].sort(),
    );
    // Every rule deletes its whole context and outputs nothing else.
    for (const rule of rules) {
      expect(rule.output).toEqual([{ kind: "nul" }]);
      expect(rule.context.slice(-2)).toEqual([
        { kind: "raw", text: "+" },
        { kind: "vkey", name: "K_BKSP", modifiers: [] },
      ]);
    }
  });

  it("orders rules longest-sequence-first so a multi-mark stack clears in one press", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(ir, worklist(), "base-plus-mark", "whole-stack", STACKS);
    const lengths = wholeStackRules(result.ir).map((r) => [...contextString(r)].length);
    expect(lengths).toEqual([...lengths].sort((a, b) => b - a));
    expect(lengths[0]).toBe(3); // a + circumflex + acute
  });

  it("emits rules the codec renders as context + [K_BKSP] > nul", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(ir, worklist(), "base-plus-mark", "whole-stack", STACKS);
    const emitted = emit(result.ir);
    expect(emitted).toContain("U+0061 U+0302 U+0301 + [K_BKSP] > nul");
    expect(emitted).toContain("U+0065 U+0301 + [K_BKSP] > nul");
  });

  it("excludes sequences whose base×mark pair is blocked — and everything built on one", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(
      ir,
      worklist({ blockedCombinations: [{ base: "a", mark: ACUTE }, { base: "o", mark: ACUTE }] }),
      "base-plus-mark",
      "whole-stack",
      STACKS,
    );
    // o+´ is blocked outright; a+ˆ survives but a+ˆ+´ is built on the blocked pair.
    expect(wholeStackRules(result.ir).map(contextString).sort()).toEqual(
      ["e" + ACUTE, "a" + CIRCUMFLEX].sort(),
    );
  });

  it("never touches plain letters — no rule matches a bare base", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(ir, worklist(), "base-plus-mark", "whole-stack", STACKS);
    for (const rule of wholeStackRules(result.ir)) {
      expect([...contextString(rule)].length).toBeGreaterThanOrEqual(2);
    }
    // The author's own key rule survives untouched.
    const main = result.ir.groups.find((g) => g.name === "main");
    expect(main?.rules.some((r) => r.nodeId === "gen-marks-wholestack-rule-1")).toBe(true);
    expect(emit(result.ir)).toContain("+ U+0061 > U+0061");
  });

  it("is idempotent, and switching back to peel tears the rules down", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const once = applyMarkGuards(ir, worklist(), "base-plus-mark", "whole-stack", STACKS);
    const twice = applyMarkGuards(once.ir, worklist(), "base-plus-mark", "whole-stack", STACKS);
    expect(emit(twice.ir)).toBe(emit(once.ir));
    const peeled = applyMarkGuards(once.ir, worklist(), "base-plus-mark", "peel", STACKS);
    expect(wholeStackRules(peeled.ir)).toHaveLength(0);
    expect(emit(peeled.ir)).not.toContain("K_BKSP");
  });

  it("generates nothing when the series recorded no stacks", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(ir, worklist(), "base-plus-mark", "whole-stack");
    expect(result.wholeStackRuleCount).toBe(0);
    expect(result.ir).toBe(ir);
  });
});

describe("applyMarkGuards — regression to an empty worklist (D-6)", () => {
  it("applying the same worklist twice yields byte-equal emitted .kmn", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const wl = worklist({ blockedCombinations: [{ base: "k", mark: ACUTE }] });
    const once = applyMarkGuards(ir, wl, "base-plus-mark");
    const twice = applyMarkGuards(once.ir, wl, "base-plus-mark");
    expect(emit(twice.ir)).toBe(emit(once.ir));
  });

  it("leaves no generated_marks_guard group, rules, or stores after a worklist with blocked pairs is followed by one with none", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const blocked = applyMarkGuards(
      ir,
      worklist({
        blockedCombinations: [{ base: "k", mark: ACUTE }],
        ownLetterUnits: ["e", "é"],
      }),
      "ready-made",
    );
    // Sanity: the first run actually produced the artifacts we expect to
    // later see torn down.
    expect(blocked.ir.groups.some((g) => g.name === MARKS_GUARD_GROUP)).toBe(true);
    expect(blocked.ir.stores.some((s) => s.name === MARKS_UNWRAP_FROM_STORE)).toBe(true);

    const cleared = applyMarkGuards(blocked.ir, worklist(), "ready-made");

    expect(cleared.ir.groups.some((g) => g.name === MARKS_GUARD_GROUP)).toBe(false);
    expect(cleared.ir.stores.some((s) => s.name === MARKS_UNWRAP_FROM_STORE)).toBe(false);
    expect(cleared.ir.stores.some((s) => s.name === MARKS_UNWRAP_TO_STORE)).toBe(false);
    const main = cleared.ir.groups.find((g) => g.name === "main");
    expect(main?.rules.some((r) => r.nodeId === "gen-marks-unwrap-rule")).toBe(false);
    expect(main?.rules.some((r) => r.matchKind === "match")).toBe(false);
    const emitted = emit(cleared.ir);
    expect(emitted).not.toContain(MARKS_GUARD_GROUP);
    expect(emitted).not.toContain(MARKS_UNWRAP_FROM_STORE);
    expect(emitted).not.toContain(MARKS_UNWRAP_TO_STORE);
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
