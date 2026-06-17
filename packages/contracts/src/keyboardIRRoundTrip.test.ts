import { describe, it, expect } from "vitest";
import { assertSemanticEquivalence } from "./keyboardIRRoundTrip.js";
import { makeTestIR, charItems } from "./fixtures/keyboard-ir.js";
import type {
  IRGroup,
  IRRule,
  IRStore,
  ContextElement,
  OutputElement,
  KeyboardIR,
} from "./keyboard-ir.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGroup(
  rules: IRRule[],
  name = "main",
  usingKeys = true,
): IRGroup {
  return { nodeId: `g#${name}`, name, usingKeys, readonly: false, rules };
}

function makeRule(
  context: ContextElement[],
  output: OutputElement[],
  id = `r#${Math.random().toString(36).slice(2)}`,
): IRRule {
  return { nodeId: id, context, output };
}

/** Rule: K_A -> "a" */
function ruleKA(): IRRule {
  return makeRule(
    [{ kind: "vkey", name: "K_A", modifiers: [] }],
    [{ kind: "char", value: "a" }],
  );
}

/** Rule: K_B -> "b" */
function ruleKB(): IRRule {
  return makeRule(
    [{ kind: "vkey", name: "K_B", modifiers: [] }],
    [{ kind: "char", value: "b" }],
  );
}

function makeStore(name: string, chars: string): IRStore {
  return {
    nodeId: `store#${name}`,
    name,
    items: charItems(chars),
    isSystem: false,
  };
}

// ---------------------------------------------------------------------------
// Identical-input case: two structurally identical IRs must be equivalent
// ---------------------------------------------------------------------------

describe("assertSemanticEquivalence", () => {
  it("reports equivalent for two identical IRs", () => {
    const ir = makeTestIR([makeGroup([ruleKA(), ruleKB()])]);
    const result = assertSemanticEquivalence(ir, ir);
    expect(result.equivalent).toBe(true);
    expect(result.differences).toHaveLength(0);
  });

  it("reports equivalent for deep-cloned identical IRs", () => {
    const ir = makeTestIR([makeGroup([ruleKA(), ruleKB()])]);
    const clone = JSON.parse(JSON.stringify(ir)) as KeyboardIR;
    const result = assertSemanticEquivalence(ir, clone);
    expect(result.equivalent).toBe(true);
    expect(result.differences).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Reorder-meaningless-list: stores sorted by name — different declaration
  // order should NOT produce a difference
  // ---------------------------------------------------------------------------

  it("reports equivalent when stores appear in different declaration order", () => {
    const storeA = makeStore("aaa", "abc");
    const storeZ = makeStore("zzz", "xyz");
    const irA = makeTestIR([makeGroup([ruleKA()])], [storeA, storeZ]);
    const irB = makeTestIR([makeGroup([ruleKA()])], [storeZ, storeA]);
    const result = assertSemanticEquivalence(irA, irB);
    expect(result.equivalent).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Modifier-flag normalization: SHIFT+CTRL and CTRL+SHIFT are the same chord
  // ---------------------------------------------------------------------------

  it("reports equivalent when modifier flags are in different order", () => {
    const ruleA = makeRule(
      [{ kind: "vkey", name: "K_A", modifiers: ["SHIFT", "CTRL"] }],
      [{ kind: "char", value: "A" }],
    );
    const ruleB = makeRule(
      [{ kind: "vkey", name: "K_A", modifiers: ["CTRL", "SHIFT"] }],
      [{ kind: "char", value: "A" }],
    );
    const irA = makeTestIR([makeGroup([ruleA])]);
    const irB = makeTestIR([makeGroup([ruleB])]);
    const result = assertSemanticEquivalence(irA, irB);
    expect(result.equivalent).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // BCP47 tag set: order of language tags is not meaningful
  // ---------------------------------------------------------------------------

  it("reports equivalent when bcp47 tags are in different order", () => {
    const base = makeTestIR([makeGroup([ruleKA()])]);
    const irA: KeyboardIR = {
      ...base,
      header: { ...base.header, bcp47: ["en-US", "fr-FR"] },
    };
    const irB: KeyboardIR = {
      ...base,
      header: { ...base.header, bcp47: ["fr-FR", "en-US"] },
    };
    const result = assertSemanticEquivalence(irA, irB);
    expect(result.equivalent).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Differing-rule case: one extra rule — must report not-equivalent with path
  // ---------------------------------------------------------------------------

  it("reports not-equivalent when a rule output differs", () => {
    const ruleAv1 = makeRule(
      [{ kind: "vkey", name: "K_A", modifiers: [] }],
      [{ kind: "char", value: "a" }],
      "r#rule0",
    );
    const ruleAv2 = makeRule(
      [{ kind: "vkey", name: "K_A", modifiers: [] }],
      [{ kind: "char", value: "x" }], // different output
      "r#rule0",
    );
    const irA = makeTestIR([makeGroup([ruleAv1])]);
    const irB = makeTestIR([makeGroup([ruleAv2])]);
    const result = assertSemanticEquivalence(irA, irB);
    expect(result.equivalent).toBe(false);
    expect(result.differences.length).toBeGreaterThan(0);
    // The diff path must point at the rule output, not just "groups"
    const outputDiff = result.differences.find((d) =>
      d.path.includes("output"),
    );
    expect(outputDiff).toBeDefined();
    expect(outputDiff?.reason).toMatch(/output element differs/);
  });

  it("reports not-equivalent with correct path when rule counts differ", () => {
    const irA = makeTestIR([makeGroup([ruleKA(), ruleKB()])]);
    const irB = makeTestIR([makeGroup([ruleKA()])]);
    const result = assertSemanticEquivalence(irA, irB);
    expect(result.equivalent).toBe(false);
    const diff = result.differences[0];
    expect(diff.path).toContain("rules");
    expect(diff.reason).toMatch(/rule count/);
  });

  // ---------------------------------------------------------------------------
  // Default-vs-absent: explicit false vs missing for isSystem, readonly, usingKeys
  // should be treated as equivalent
  // ---------------------------------------------------------------------------

  it("reports equivalent when isSystem is explicit false vs absent", () => {
    const storeExplicit: IRStore = {
      nodeId: "s#1",
      name: "foo",
      items: charItems("abc"),
      isSystem: false,
    };
    // Cast to suppress TS — we are deliberately testing the absent case
    const storeAbsent: IRStore = {
      nodeId: "s#2",
      name: "foo",
      items: charItems("abc"),
    } as unknown as IRStore;

    const irA = makeTestIR([makeGroup([ruleKA()])], [storeExplicit]);
    const irB = makeTestIR([makeGroup([ruleKA()])], [storeAbsent]);
    const result = assertSemanticEquivalence(irA, irB);
    expect(result.equivalent).toBe(true);
  });

  it("reports equivalent when readonly is explicit false vs absent on group", () => {
    const rule = ruleKA();
    const groupExplicit: IRGroup = {
      nodeId: "g#1",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [rule],
    };
    // Only `readonly` is absent — everything else matches groupExplicit
    const { readonly: _omitted, nodeId: _n, ...rest } = groupExplicit;
    const groupAbsent: IRGroup = { ...rest, nodeId: "g#2" } as unknown as IRGroup;

    const irA = makeTestIR([groupExplicit]);
    const irB = makeTestIR([groupAbsent]);
    const result = assertSemanticEquivalence(irA, irB);
    expect(result.equivalent).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // nodeId differences: different nodeIds on rules/stores/groups must be ignored
  // ---------------------------------------------------------------------------

  it("ignores nodeId differences on rules and groups", () => {
    const ruleA: IRRule = { nodeId: "UUID-AAA", context: [], output: [] };
    const ruleB: IRRule = { nodeId: "UUID-BBB", context: [], output: [] };
    const groupA: IRGroup = {
      nodeId: "g-AAA",
      name: "main",
      usingKeys: false,
      readonly: false,
      rules: [ruleA],
    };
    const groupB: IRGroup = {
      nodeId: "g-BBB",
      name: "main",
      usingKeys: false,
      readonly: false,
      rules: [ruleB],
    };
    const irA = makeTestIR([groupA]);
    const irB = makeTestIR([groupB]);
    const result = assertSemanticEquivalence(irA, irB);
    expect(result.equivalent).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Header field differences
  // ---------------------------------------------------------------------------

  it("reports not-equivalent when header name differs", () => {
    const base = makeTestIR([makeGroup([ruleKA()])]);
    const irA: KeyboardIR = { ...base, header: { ...base.header, name: "Keyboard A" } };
    const irB: KeyboardIR = { ...base, header: { ...base.header, name: "Keyboard B" } };
    const result = assertSemanticEquivalence(irA, irB);
    expect(result.equivalent).toBe(false);
    expect(result.differences[0].path).toBe("header.name");
  });

  it("reports not-equivalent when version differs", () => {
    const base = makeTestIR([makeGroup([ruleKA()])]);
    const irA: KeyboardIR = { ...base, header: { ...base.header, version: "1.0" } };
    const irB: KeyboardIR = { ...base, header: { ...base.header, version: "2.0" } };
    const result = assertSemanticEquivalence(irA, irB);
    expect(result.equivalent).toBe(false);
    expect(result.differences[0].path).toBe("header.version");
  });

  // ---------------------------------------------------------------------------
  // Store content differences
  // ---------------------------------------------------------------------------

  it("reports not-equivalent when store content differs", () => {
    const irA = makeTestIR([makeGroup([ruleKA()])], [makeStore("alpha", "abc")]);
    const irB = makeTestIR([makeGroup([ruleKA()])], [makeStore("alpha", "xyz")]);
    const result = assertSemanticEquivalence(irA, irB);
    expect(result.equivalent).toBe(false);
    const storeDiff = result.differences.find((d) => d.path.includes("alpha"));
    expect(storeDiff).toBeDefined();
  });

  it("reports not-equivalent when store is present in one IR only", () => {
    const irA = makeTestIR([makeGroup([ruleKA()])], [makeStore("extra", "abc")]);
    const irB = makeTestIR([makeGroup([ruleKA()])], []);
    const result = assertSemanticEquivalence(irA, irB);
    expect(result.equivalent).toBe(false);
    expect(result.differences[0].path).toBe("stores");
    expect(result.differences[0].reason).toMatch(/store count/);
  });

  // ---------------------------------------------------------------------------
  // Raw fragments
  // ---------------------------------------------------------------------------

  it("reports equivalent when raw fragments are in different order", () => {
    const rawA = { nodeId: "raw#1", origin: "imported" as const, sourceText: "c1", reason: "call/return" };
    const rawB = { nodeId: "raw#2", origin: "imported" as const, sourceText: "c2", reason: "call/return" };
    const irA: KeyboardIR = { ...makeTestIR([makeGroup([ruleKA()])]), raw: [rawA, rawB] };
    const irB: KeyboardIR = { ...makeTestIR([makeGroup([ruleKA()])]), raw: [rawB, rawA] };
    const result = assertSemanticEquivalence(irA, irB);
    expect(result.equivalent).toBe(true);
  });

  it("reports not-equivalent when raw fragment text differs", () => {
    const rawA = { nodeId: "raw#1", origin: "imported" as const, sourceText: "c1", reason: "call/return" };
    const rawB = { nodeId: "raw#2", origin: "imported" as const, sourceText: "DIFFERENT", reason: "call/return" };
    const irA: KeyboardIR = { ...makeTestIR([makeGroup([ruleKA()])]), raw: [rawA] };
    const irB: KeyboardIR = { ...makeTestIR([makeGroup([ruleKA()])]), raw: [rawB] };
    const result = assertSemanticEquivalence(irA, irB);
    expect(result.equivalent).toBe(false);
    const d = result.differences.find((x) => x.path.includes("sourceText"));
    expect(d).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // trailingComment is NOT semantic — must be ignored
  // ---------------------------------------------------------------------------

  it("ignores trailingComment differences on rules", () => {
    const ruleA: IRRule = {
      nodeId: "r#1",
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "char", value: "a" }],
      trailingComment: "/* old comment */",
    };
    const ruleB: IRRule = {
      nodeId: "r#1",
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "char", value: "a" }],
      trailingComment: "/* new comment */",
    };
    const irA = makeTestIR([makeGroup([ruleA])]);
    const irB = makeTestIR([makeGroup([ruleB])]);
    const result = assertSemanticEquivalence(irA, irB);
    expect(result.equivalent).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Group order IS semantic — reordering groups must produce a difference
  // ---------------------------------------------------------------------------

  it("reports not-equivalent when group order changes", () => {
    const g1 = makeGroup([ruleKA()], "alpha");
    const g2 = makeGroup([ruleKB()], "beta");
    const irA = makeTestIR([g1, g2]);
    const irB = makeTestIR([g2, g1]);
    const result = assertSemanticEquivalence(irA, irB);
    // The names will mismatch at groups[0].name
    expect(result.equivalent).toBe(false);
    const d = result.differences.find((x) => x.path.includes("name"));
    expect(d).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Rule order within a group IS semantic
  // ---------------------------------------------------------------------------

  it("reports not-equivalent when rule order within a group changes", () => {
    const r1 = makeRule(
      [{ kind: "vkey", name: "K_A", modifiers: [] }],
      [{ kind: "char", value: "a" }],
      "r#fixed-1",
    );
    const r2 = makeRule(
      [{ kind: "vkey", name: "K_B", modifiers: [] }],
      [{ kind: "char", value: "b" }],
      "r#fixed-2",
    );
    const irA = makeTestIR([makeGroup([r1, r2])]);
    const irB = makeTestIR([makeGroup([r2, r1])]);
    const result = assertSemanticEquivalence(irA, irB);
    expect(result.equivalent).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // All differences collected (non-short-circuiting)
  // ---------------------------------------------------------------------------

  it("collects multiple differences at once", () => {
    const base = makeTestIR([makeGroup([ruleKA()])]);
    const irA: KeyboardIR = {
      ...base,
      header: { ...base.header, name: "Name A", version: "1.0" },
    };
    const irB: KeyboardIR = {
      ...base,
      header: { ...base.header, name: "Name B", version: "2.0" },
    };
    const result = assertSemanticEquivalence(irA, irB);
    expect(result.equivalent).toBe(false);
    expect(result.differences.length).toBeGreaterThanOrEqual(2);
    const paths = result.differences.map((d) => d.path);
    expect(paths).toContain("header.name");
    expect(paths).toContain("header.version");
  });
});
