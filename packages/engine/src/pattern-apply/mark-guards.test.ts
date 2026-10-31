import { describe, expect, it } from "vitest";
import { createVirtualFS, type AttestedStack, type PlacementWorklist, type SimKeyInput } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { compile } from "../compiler/index.js";
import { simulate } from "../simulator/index.js";
import {
  applyMarkGuards,
  MARKS_ALLOWED_STORE_PREFIX,
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

const chars = (store: { items: { kind: string; value?: string }[] } | undefined): string[] =>
  (store?.items ?? []).map((i) => (i.kind === "char" ? i.value! : `?${i.kind}`));

describe("applyMarkGuards — blocking (FR-021 swallow; spec 106 FR-012)", () => {
  it("adds one buffer-start rule and one notany rule per mark, over a generated allowed store", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(
      ir,
      worklist({
        ownLetterUnits: ["a", "b", "k"],
        blockedCombinations: [
          { base: "k", mark: ACUTE },
          { base: "b", mark: ACUTE },
        ],
      }),
      "base-plus-mark",
    );
    expect(result.blockingRuleCount).toBe(2);
    const guard = result.ir.groups.find((g) => g.name === MARKS_GUARD_GROUP);
    expect(guard?.usingKeys).toBe(false);
    const store = `${MARKS_ALLOWED_STORE_PREFIX}0301`;
    // Buffer start first, then the notany rule (first match wins).
    expect(guard?.rules.map((r) => [r.context, r.output])).toEqual([
      [[{ kind: "raw", text: "nul" }, { kind: "char", value: ACUTE }], [{ kind: "nul" }]],
      [
        [{ kind: "notany", storeRef: store }, { kind: "char", value: ACUTE }],
        [{ kind: "context", offset: 1 }],
      ],
    ]);
    expect(chars(result.ir.stores.find((s) => s.name === store))).toEqual(["a"]);
    // The entry group gained a match > use(guard) hop.
    const main = result.ir.groups.find((g) => g.name === "main");
    const hop = main?.rules.find((r) => r.matchKind === "match");
    expect(hop?.output).toContainEqual({ kind: "useGroup", groupName: MARKS_GUARD_GROUP });
  });

  it("adds U+0020 to the allowed store when the space column is ticked", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(
      ir,
      worklist({ ownLetterUnits: ["a"], markUnits: [{ mark: ACUTE, inputOrder: "postfix" }], allowedContexts: { [ACUTE]: [" "] } }),
      "base-plus-mark",
    );
    expect(chars(result.ir.stores.find((s) => s.name === `${MARKS_ALLOWED_STORE_PREFIX}0301`))).toEqual([" ", "a"]);
  });

  it("lets a stacked mark follow the mark before it, and the precomposed prefix", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(
      ir,
      worklist({ ownLetterUnits: ["a"], markUnits: [{ mark: CIRCUMFLEX, inputOrder: "postfix" }, { mark: ACUTE, inputOrder: "postfix" }] }),
      "base-plus-mark",
      "peel",
      [{ base: "a", marks: [CIRCUMFLEX, ACUTE] }],
    );
    expect(chars(result.ir.stores.find((s) => s.name === `${MARKS_ALLOWED_STORE_PREFIX}0301`))).toEqual([
      "a",
      "â",
      CIRCUMFLEX,
    ]);
  });

  it("stacks on the case counterpart too, which ready-made shows as a precomposed capital", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(
      ir,
      worklist({ ownLetterUnits: ["a", "A"], markUnits: [{ mark: CIRCUMFLEX, inputOrder: "postfix" }, { mark: ACUTE, inputOrder: "postfix" }] }),
      "ready-made",
      "whole-stack",
      [{ base: "a", marks: [CIRCUMFLEX, ACUTE] }],
    );
    expect(chars(result.ir.stores.find((s) => s.name === `${MARKS_ALLOWED_STORE_PREFIX}0301`))).toEqual([
      "A",
      "a",
      "Â",
      "â",
      CIRCUMFLEX,
    ]);
  });

  it("when the mark's start-of-line box is ticked, drops the buffer-start rule and adds U+000A to its allowed store", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(
      ir,
      worklist({
        ownLetterUnits: ["a"],
        markUnits: [{ mark: ACUTE, inputOrder: "postfix" }],
        bareMarkAllowed: { [ACUTE]: true },
      }),
      "base-plus-mark",
    );
    const guard = result.ir.groups.find((g) => g.name === MARKS_GUARD_GROUP);
    expect(guard?.rules.map((r) => r.nodeId)).toEqual(["gen-marks-block-0301"]);
    expect(chars(result.ir.stores.find((s) => s.name === `${MARKS_ALLOWED_STORE_PREFIX}0301`))).toEqual(["\n", "a"]);
    expect(emit(result.ir)).toContain(`store(${MARKS_ALLOWED_STORE_PREFIX}0301) U+000A 'a'`);
  });

  it("per-mark: one ticked mark passes at buffer start while an unticked mark is still swallowed", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(
      ir,
      worklist({
        ownLetterUnits: ["a"],
        markUnits: [
          { mark: ACUTE, inputOrder: "postfix" },
          { mark: CIRCUMFLEX, inputOrder: "postfix" },
        ],
        bareMarkAllowed: { [ACUTE]: true },
      }),
      "base-plus-mark",
    );
    const guard = result.ir.groups.find((g) => g.name === MARKS_GUARD_GROUP);
    expect(guard?.rules.map((r) => r.nodeId)).toEqual([
      "gen-marks-block-0301",
      "gen-marks-start-0302",
      "gen-marks-block-0302",
    ]);
  });

  it("never puts nul or beep in a generated store (G8)", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(
      ir,
      worklist({ ownLetterUnits: ["a", "e", "é"], blockedCombinations: [{ base: "a", mark: ACUTE }] }),
      "ready-made",
    );
    const generated = result.ir.stores.filter((s) => s.name.startsWith("generated_marks_"));
    expect(generated.length).toBeGreaterThan(0);
    for (const s of generated) expect(s.items.every((i) => i.kind === "char")).toBe(true);
  });

  it("round-trips through the codec emitter", () => {
    const { ir } = parse(BASE_KMN, "guards");
    const result = applyMarkGuards(
      ir,
      worklist({ ownLetterUnits: ["a", "k"], blockedCombinations: [{ base: "k", mark: ACUTE }] }),
      "base-plus-mark",
    );
    const emitted = emit(result.ir);
    expect(emitted).toContain(`group(${MARKS_GUARD_GROUP})`);
    expect(emitted).toContain("match > use(generated_marks_guard)");
    // The combining mark must emit as a standalone U+XXXX token, never a quoted
    // literal that would attach to a neighbouring char in source.
    expect(emitted).toContain(`notany(${MARKS_ALLOWED_STORE_PREFIX}0301) U+0301 > context(1)`);
    expect(emitted).toContain("nul U+0301 > nul");
  });
});

// The guard as Keyman runs it: compile the emitted keyboard and type.
describe("applyMarkGuards — compiled behaviour", () => {
  const KEYS_KMN = [
    'store(&NAME) "Guard fixture"',
    "store(&TARGETS) 'any'",
    "begin Unicode > use(main)",
    "group(main) using keys",
    '+ [K_A] > "a"',
    '+ [K_K] > "k"',
    '+ [K_1] > "1"',
    "+ [K_SPACE] > U+0020",
    "+ [K_5] > U+0301",
    "+ [K_ENTER] > U+000A",
    "",
  ].join("\n");
  const type = (vkeys: string[]): SimKeyInput[] => vkeys.map((vkey) => ({ vkey, modifiers: [], caps: false }));

  async function build(allowSpace: boolean, startOfLineTicked: boolean) {
    const { ir } = parse(KEYS_KMN, "guards");
    const guarded = applyMarkGuards(
      ir,
      worklist({
        ownLetterUnits: ["a", "k"],
        markUnits: [{ mark: ACUTE, inputOrder: "postfix" }],
        blockedCombinations: [{ base: "k", mark: ACUTE }],
        ...(allowSpace ? { allowedContexts: { [ACUTE]: [" "] } } : {}),
        ...(startOfLineTicked ? { bareMarkAllowed: { [ACUTE]: true } } : {}),
      }),
      "base-plus-mark",
    );
    const vfs = createVirtualFS([{ path: "source/guards.kmn", content: emit(guarded.ir), isBinary: false }]);
    const compiled = await compile(vfs, "guards");
    expect(compiled.diagnostics.filter((d) => d.severity === "error" || d.severity === "fatal")).toEqual([]);
    return (vkeys: string[]) => simulate(compiled, type(vkeys)).finalOutput;
  }

  it("blocks the mark after an unchecked base, a digit and an unticked space; keeps it after a checked base", async () => {
    const run = await build(false, false);
    expect(run(["K_A", "K_5"])).toBe(`a${ACUTE}`);
    expect(run(["K_K", "K_5"])).toBe("k");
    expect(run(["K_1", "K_5"])).toBe("1");
    expect(run(["K_SPACE", "K_5"])).toBe(" ");
    expect(run(["K_5"])).toBe("");
  }, 60_000);

  it("allows the mark after a ticked space, and at buffer start when the start-of-line box is ticked", async () => {
    const run = await build(true, true);
    expect(run(["K_SPACE", "K_5"])).toBe(` ${ACUTE}`);
    expect(run(["K_5"])).toBe(ACUTE);
    expect(run(["K_1", "K_5"])).toBe("1");
  }, 60_000);

  // Issue #2374 verification gate: the "\n"-in-store idiom is unverified in
  // this codebase — no test typed Enter before. Ticked must pass the mark
  // after a real Enter press; unticked must swallow it there.
  it("gate: ticked mark passes after Enter; unticked mark is swallowed after Enter", async () => {
    const ticked = await build(false, true);
    expect(ticked(["K_ENTER", "K_5"])).toBe(`\n${ACUTE}`);
    const unticked = await build(false, false);
    expect(unticked(["K_ENTER", "K_5"])).toBe("\n");
  }, 120_000);
});

describe("applyMarkGuards — format version for notany()+context()", () => {
  const kmnAt = (version: string): string =>
    [
      'store(&NAME) "Guard fixture"',
      `store(&VERSION) '${version}'`,
      "store(&TARGETS) 'any'",
      "begin Unicode > use(main)",
      "group(main) using keys",
      '+ [K_A] > "a"',
      "",
    ].join("\n");
  const wl = worklist({
    ownLetterUnits: ["a"],
    markUnits: [{ mark: ACUTE, inputOrder: "postfix" }],
  });

  it.each([
    ["10.0", "14.0"],
    ["13.0", "14.0"],
    ["14.0", "14.0"],
    ["17.0", "17.0"],
  ])("a keyboard declaring &VERSION %s compiles with the guard and ends at %s", async (declared, expected) => {
    const { ir } = parse(kmnAt(declared), "guards");
    const guarded = applyMarkGuards(ir, wl, "base-plus-mark");
    const version = guarded.ir.stores.find((s) => s.isSystem && s.name.toUpperCase() === "VERSION");
    expect(chars(version).join("")).toBe(expected);
    const vfs = createVirtualFS([{ path: "source/guards.kmn", content: emit(guarded.ir), isBinary: false }]);
    const compiled = await compile(vfs, "guards");
    expect(compiled.diagnostics.filter((d) => d.severity === "error" || d.severity === "fatal")).toEqual([]);
  }, 60_000);
});

describe("applyMarkGuards — idempotency (spec 106 T016)", () => {
  it("is idempotent over its own emitted .kmn parsed back (the projection's path)", () => {
    const wl = worklist({ ownLetterUnits: ["a", "k"], blockedCombinations: [{ base: "k", mark: ACUTE }] });
    const once = emit(applyMarkGuards(parse(BASE_KMN, "guards").ir, wl, "base-plus-mark").ir);
    const twice = emit(applyMarkGuards(parse(once, "guards").ir, wl, "base-plus-mark").ir);
    expect(twice).toBe(once);
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
    // Only the guard for é's acute is generated; no backspace rules.
    const main = result.ir.groups.find((g) => g.name === "main");
    expect(main?.rules.some((r) => r.nodeId === "gen-marks-unwrap-rule")).toBe(false);
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
    expect(result.unwrapPairCount).toBe(0);
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
