// Tests for compileCarveSuppression — the carve-suppression behaviour compiler
// (spec 076, issue #1802, FR-019 / FR-020 / FR-021; ruling §§2–6, 10).
//
// TDD contract (T008): these tests FAIL until T009 implements
// `./carveSuppression.js`. They pin the exact contract T009 must satisfy.
// The expected failure mode before T009 is "Failed to resolve import
// ./carveSuppression.js" — a missing module, not a syntax error.
//
// ---------------------------------------------------------------------------
// Contract under test (T009 must implement exactly this)
// ---------------------------------------------------------------------------
//   compileCarveSuppression(
//     ir: KeyboardIR,
//     dispositions: CarveDisposition[],
//     options?: { loud?: boolean },
//   ): { ir: KeyboardIR; restorations: SuppressionRestoration[] }
//
//   restoreCarveSuppression(
//     ir: KeyboardIR,
//     restorations: readonly SuppressionRestoration[],
//   ): KeyboardIR
//
// Semantics:
// - The input is the PRE-carve IR (carved rules still present). `dispositions`
//   carry per-combination decisions; `comboId` is the rule `nodeId`
//   (store-slot comboIds `<storeNodeId>#<index>` belong to T013, not here).
// - `block` → the carved rule is rewritten IN PLACE (same index in
//   `group.rules`, keeping its shadowing position) with the shape-correct verb
//   (FR-020) and `ownedByBehaviour: "carve-suppression"` (FR-021).
// - `allow-host` → the carved rule is REMOVED (no suppression rule emitted;
//   the combination falls through to the host layout, FR-019 scenario 6).
// - `loud: true` appends `beep` to the verb (`nul beep`, `context beep`);
//   default (absent/false) is soft. Never bare `beep`.
// - A deadkey-arming rule `+ [K_X] > dk(id)` whose every consumer was carved
//   is DERIVED-rewritten to `> nul` (an armed key with no consumers is itself
//   a leak, FR-020) even though it carries no disposition of its own.
// - Un-carve (FR-021): `restorations` records everything needed to restore the
//   originals; `restoreCarveSuppression` is the inverse. This is the "compiler's
//   inverse" option (not "purely additive": the rewrite replaces output text,
//   so restoration records are required).
// - The input IR is never mutated; the result is a fresh IR.
// - Rules already carrying `ownedByBehaviour` are never carve targets (FR-021:
//   recogniser-lifted rules are not author content and not carve targets).
// - Unknown `comboId`s are ignored without crashing.
// ---------------------------------------------------------------------------
//
// The local `SuppressionRestoration` / `SuppressionResult` interfaces below
// mirror what T009 must export from the module (structural typing: the tests
// only depend on the runtime shapes).

import { describe, it, expect } from "vitest";
import { compileCarveSuppression, restoreCarveSuppression } from "./carveSuppression.js";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import {
  irGroup,
  vkeyRule,
  charRule,
  charStore,
} from "@keyboard-studio/contracts/fixtures";
import type {
  CarveDisposition,
  IRRule,
  KeyboardIR,
  OutputElement,
} from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Local contract mirrors (see header)
// ---------------------------------------------------------------------------

interface SuppressionRestoration {
  /** "rewritten" for block dispositions (and derived arming rewrites); "removed" for allow-host; "guard" for T013 synthesized slot guards. */
  kind: "rewritten" | "removed" | "guard";
  groupNodeId: string;
  /** Index in group.rules where the carved rule lived (for "guard": the insertion index). */
  index: number;
  /** The original rule, verbatim, for restoration on un-carve. Absent for "guard". */
  originalRule?: IRRule;
  /** The synthesized guard's nodeId, for removal on un-carve. Set only for "guard". */
  synthesizedNodeId?: string;
  /** True when the rewrite was derived (deadkey-arming rule), not disposition-driven. */
  derived?: boolean;
}

interface SuppressionResult {
  ir: KeyboardIR;
  restorations: SuppressionRestoration[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function blockDisposition(comboId: string): CarveDisposition {
  return { comboId, disposition: "block", provenance: "closed-keyboard-card" };
}

function allowDisposition(comboId: string): CarveDisposition {
  return { comboId, disposition: "allow-host", provenance: "closed-keyboard-card-declined" };
}

function findRule(ir: KeyboardIR, nodeId: string): IRRule | undefined {
  for (const group of ir.groups) {
    const rule = group.rules.find((r) => r.nodeId === nodeId);
    if (rule) return rule;
  }
  return undefined;
}

function ruleIndex(ir: KeyboardIR, groupNodeId: string, nodeId: string): number {
  const group = ir.groups.find((g) => g.nodeId === groupNodeId);
  return group ? group.rules.findIndex((r) => r.nodeId === nodeId) : -1;
}

function snapshot(ir: KeyboardIR): string {
  return JSON.stringify(ir);
}

/** A bare-key rule `+ [K_E] > "é"`. */
function bareKeyRule(nodeId: string, vkey = "K_E", output: string | OutputElement[] = "é"): IRRule {
  return vkeyRule({ nodeId, vkey, output });
}

/** A text-context rule `'a' + [K_Q] > "x"`. */
function textContextRule(nodeId: string): IRRule {
  return charRule({
    nodeId,
    context: [
      { kind: "char", value: "a" },
      { kind: "vkey", name: "K_Q", modifiers: [] },
    ],
    output: "x",
  });
}

/** A deadkey-only-context rule `dk(1) + [K_A] > "a"`. */
function deadkeyContextRule(nodeId: string, dkId = 1): IRRule {
  return charRule({
    nodeId,
    context: [
      { kind: "deadkey", id: dkId },
      { kind: "vkey", name: "K_A", modifiers: [] },
    ],
    output: "a",
  });
}

/** A mixed text+deadkey-context rule `'a' dk(1) + [K_A] > "à"`. */
function mixedContextRule(nodeId: string, dkId = 1): IRRule {
  return charRule({
    nodeId,
    context: [
      { kind: "char", value: "a" },
      { kind: "deadkey", id: dkId },
      { kind: "vkey", name: "K_A", modifiers: [] },
    ],
    output: "à",
  });
}

/** A deadkey-arming rule `+ [K_X] > dk(1)`. */
function armingRule(nodeId: string, dkId = 1): IRRule {
  return vkeyRule({ nodeId, vkey: "K_X", output: [{ kind: "deadkey", id: dkId }] });
}

function testIr(rules: IRRule[]): KeyboardIR {
  return makeTestIR([irGroup({ nodeId: "group#main", name: "main", rules })], [
    charStore({ nodeId: "store#vowels", name: "vowels", chars: "aeiou" }),
  ]);
}

// ---------------------------------------------------------------------------
// 1. Verb table (FR-020)
// ---------------------------------------------------------------------------

describe("compileCarveSuppression — verb per LHS shape (FR-020)", () => {
  it("bare-key carve rewrites to `> nul` (FR-020, scenario 2)", () => {
    const ir = testIr([bareKeyRule("r1")]);
    const before = snapshot(ir);
    const result: SuppressionResult = compileCarveSuppression(ir, [blockDisposition("r1")]);

    const rewritten = findRule(result.ir, "r1");
    expect(rewritten).toBeDefined();
    expect(rewritten!.output).toEqual([{ kind: "nul" }]);
    // LHS untouched: still matches the bare key.
    expect(rewritten!.context).toEqual(ir.groups[0]!.rules[0]!.context);
    // Input not mutated.
    expect(snapshot(ir)).toBe(before);
  });

  it("bare-key with modifiers `+ [RALT K_E]` rewrites to `> nul` (FR-020)", () => {
    const rule = vkeyRule({ nodeId: "r1", vkey: "K_E", modifiers: ["RALT"], output: "€" });
    const ir = testIr([rule]);
    const result: SuppressionResult = compileCarveSuppression(ir, [blockDisposition("r1")]);

    expect(findRule(result.ir, "r1")!.output).toEqual([{ kind: "nul" }]);
  });

  it("text-context carve rewrites to `> context` (FR-020, scenario 3)", () => {
    const ir = testIr([textContextRule("r2")]);
    const result: SuppressionResult = compileCarveSuppression(ir, [blockDisposition("r2")]);

    const rewritten = findRule(result.ir, "r2")!;
    expect(rewritten.output).toEqual([{ kind: "context", offset: 0 }]);
    expect(rewritten.context).toEqual(ir.groups[0]!.rules[0]!.context);
  });

  it("`any(store)` context carve rewrites to `> context` (FR-020)", () => {
    const rule = charRule({
      nodeId: "r3",
      context: [
        { kind: "any", storeRef: "vowels" },
        { kind: "vkey", name: "K_X", modifiers: [] },
      ],
      output: "y",
    });
    const ir = testIr([rule]);
    const result: SuppressionResult = compileCarveSuppression(ir, [blockDisposition("r3")]);

    expect(findRule(result.ir, "r3")!.output).toEqual([{ kind: "context", offset: 0 }]);
  });

  it("`notany(store)` context carve rewrites to `> context` (FR-020)", () => {
    const rule = charRule({
      nodeId: "r4",
      context: [
        { kind: "notany", storeRef: "vowels" },
        { kind: "vkey", name: "K_X", modifiers: [] },
      ],
      output: "y",
    });
    const ir = testIr([rule]);
    const result: SuppressionResult = compileCarveSuppression(ir, [blockDisposition("r4")]);

    expect(findRule(result.ir, "r4")!.output).toEqual([{ kind: "context", offset: 0 }]);
  });

  it("deadkey-only context carve rewrites to `> nul` (FR-020, scenario 4)", () => {
    const ir = testIr([deadkeyContextRule("r5")]);
    const result: SuppressionResult = compileCarveSuppression(ir, [blockDisposition("r5")]);

    const rewritten = findRule(result.ir, "r5")!;
    expect(rewritten.output).toEqual([{ kind: "nul" }]);
    // The deadkey marker is still consumed (LHS unchanged) — no armed leak.
    expect(rewritten.context).toEqual(ir.groups[0]!.rules[0]!.context);
  });

  it("mixed text+deadkey context carve rewrites to `> context` (FR-020)", () => {
    const ir = testIr([mixedContextRule("r6")]);
    const result: SuppressionResult = compileCarveSuppression(ir, [blockDisposition("r6")]);

    // The `a` must survive: `> nul` would eat it (FR-020 "Never" column).
    expect(findRule(result.ir, "r6")!.output).toEqual([{ kind: "context", offset: 0 }]);
  });

  it("deadkey-arming rule whose last consumer was carved rewrites to `> nul` (FR-020)", () => {
    const ir = testIr([armingRule("arm"), deadkeyContextRule("consumer")]);
    const result: SuppressionResult = compileCarveSuppression(ir, [blockDisposition("consumer")]);

    // The consumer itself: deadkey-only context → nul.
    expect(findRule(result.ir, "consumer")!.output).toEqual([{ kind: "nul" }]);
    // The arming rule is derived-rewritten: an armed key with no consumers is a leak.
    const armRewritten = findRule(result.ir, "arm")!;
    expect(armRewritten.output).toEqual([{ kind: "nul" }]);
    expect(armRewritten.ownedByBehaviour).toBe("carve-suppression");
    // The restoration set records the derived rewrite.
    const armRestoration = result.restorations.find((r) => r.originalRule?.nodeId === "arm");
    expect(armRestoration).toBeDefined();
    expect(armRestoration!.kind).toBe("rewritten");
    expect(armRestoration!.derived).toBe(true);
  });

  it("arming rule survives when another consumer is not carved (FR-020)", () => {
    const survivor = charRule({
      nodeId: "survivor",
      context: [
        { kind: "deadkey", id: 1 },
        { kind: "vkey", name: "K_B", modifiers: [] },
      ],
      output: "b",
    });
    const ir = testIr([armingRule("arm"), deadkeyContextRule("consumer"), survivor]);
    const result: SuppressionResult = compileCarveSuppression(ir, [blockDisposition("consumer")]);

    // The deadkey still has a live consumer: the arming rule must keep arming it.
    expect(findRule(result.ir, "arm")!.output).toEqual([{ kind: "deadkey", id: 1 }]);
    expect(findRule(result.ir, "arm")!.ownedByBehaviour).toBeUndefined();
    expect(findRule(result.ir, "survivor")!.output).toEqual([{ kind: "char", value: "b" }]);
  });
});

// ---------------------------------------------------------------------------
// 2. Loud (FR-020, A6)
// ---------------------------------------------------------------------------

describe("compileCarveSuppression — loud appends beep, never bare (FR-020)", () => {
  it("loud bare-key carve emits `> nul beep` (scenario 2)", () => {
    const ir = testIr([bareKeyRule("r1")]);
    const result: SuppressionResult = compileCarveSuppression(ir, [blockDisposition("r1")], {
      loud: true,
    });

    expect(findRule(result.ir, "r1")!.output).toEqual([{ kind: "nul" }, { kind: "beep" }]);
  });

  it("loud text-context carve emits `> context beep` (scenario 3)", () => {
    const ir = testIr([textContextRule("r2")]);
    const result: SuppressionResult = compileCarveSuppression(ir, [blockDisposition("r2")], {
      loud: true,
    });

    expect(findRule(result.ir, "r2")!.output).toEqual([
      { kind: "context", offset: 0 },
      { kind: "beep" },
    ]);
  });

  it("loud deadkey-context carve emits `> nul beep` (scenario 4)", () => {
    const ir = testIr([deadkeyContextRule("r5")]);
    const result: SuppressionResult = compileCarveSuppression(ir, [blockDisposition("r5")], {
      loud: true,
    });

    expect(findRule(result.ir, "r5")!.output).toEqual([{ kind: "nul" }, { kind: "beep" }]);
  });

  it("loud never emits a bare `beep` output on any shape", () => {
    const ir = testIr([
      bareKeyRule("r1"),
      textContextRule("r2"),
      deadkeyContextRule("r5"),
      mixedContextRule("r6"),
    ]);
    const result: SuppressionResult = compileCarveSuppression(
      ir,
      ["r1", "r2", "r5", "r6"].map(blockDisposition),
      { loud: true },
    );

    for (const group of result.ir.groups) {
      for (const rule of group.rules) {
        expect(rule.output).not.toEqual([{ kind: "beep" }]);
      }
    }
  });

  it("default is soft: no beep without the loud flag", () => {
    const ir = testIr([bareKeyRule("r1"), textContextRule("r2")]);
    const result: SuppressionResult = compileCarveSuppression(ir, [
      blockDisposition("r1"),
      blockDisposition("r2"),
    ]);

    expect(findRule(result.ir, "r1")!.output).toEqual([{ kind: "nul" }]);
    expect(findRule(result.ir, "r2")!.output).toEqual([{ kind: "context", offset: 0 }]);
  });
});

// ---------------------------------------------------------------------------
// 3. Ownership (FR-021, FR-002)
// ---------------------------------------------------------------------------

describe("compileCarveSuppression — ownership (FR-021)", () => {
  it("every rewritten rule carries ownedByBehaviour 'carve-suppression'", () => {
    const ir = testIr([
      bareKeyRule("r1"),
      textContextRule("r2"),
      deadkeyContextRule("r5"),
      mixedContextRule("r6"),
      armingRule("arm"),
      deadkeyContextRule("consumer"),
    ]);
    const result: SuppressionResult = compileCarveSuppression(ir, [
      blockDisposition("r1"),
      blockDisposition("r2"),
      blockDisposition("r5"),
      blockDisposition("r6"),
      blockDisposition("consumer"),
    ]);

    for (const nodeId of ["r1", "r2", "r5", "r6", "arm", "consumer"]) {
      expect(findRule(result.ir, nodeId)!.ownedByBehaviour).toBe("carve-suppression");
    }
  });

  it("the ownership marker is mutually exclusive with ownedByPattern (FR-002)", () => {
    const patterned = vkeyRule({
      nodeId: "r1",
      vkey: "K_E",
      output: "é",
      ownedByPattern: "some-pattern",
    });
    const ir = testIr([patterned]);
    const result: SuppressionResult = compileCarveSuppression(ir, [blockDisposition("r1")]);

    const rewritten = findRule(result.ir, "r1")!;
    expect(rewritten.ownedByBehaviour).toBe("carve-suppression");
    // FR-002: the two markers MUST be mutually exclusive on one rule.
    expect(rewritten.ownedByPattern).toBeUndefined();
  });

  it("already-owned rules are never carve targets (FR-021)", () => {
    const owned = vkeyRule({
      nodeId: "r1",
      vkey: "K_E",
      output: [{ kind: "nul" }],
      ownedByBehaviour: "carve-suppression",
    });
    const ir = testIr([owned]);
    const before = snapshot(ir);
    const result: SuppressionResult = compileCarveSuppression(ir, [blockDisposition("r1")]);

    // Not double-processed: left exactly as it was.
    expect(snapshot(result.ir)).toBe(before);
    expect(result.restorations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Dispositions (FR-019)
// ---------------------------------------------------------------------------

describe("compileCarveSuppression — dispositions (FR-019)", () => {
  it("block rewrites in place, keeping the shadowing position (scenario 2)", () => {
    const ir = testIr([bareKeyRule("r1"), bareKeyRule("r2"), bareKeyRule("r3")]);
    const result: SuppressionResult = compileCarveSuppression(ir, [blockDisposition("r2")]);

    const rules = result.ir.groups[0]!.rules;
    expect(rules).toHaveLength(3);
    // Same node, same index — the suppression inherits the carved rule's priority.
    expect(ruleIndex(result.ir, "group#main", "r2")).toBe(1);
    expect(rules[1]!.output).toEqual([{ kind: "nul" }]);
    // Neighbours untouched.
    expect(rules[0]!.output).toEqual([{ kind: "char", value: "é" }]);
    expect(rules[2]!.output).toEqual([{ kind: "char", value: "é" }]);
    expect(rules[0]!.ownedByBehaviour).toBeUndefined();
  });

  it("allow-host removes the rule: no suppression rule emitted (scenario 6)", () => {
    const ir = testIr([bareKeyRule("r1"), bareKeyRule("r2"), bareKeyRule("r3")]);
    const result: SuppressionResult = compileCarveSuppression(ir, [allowDisposition("r2")]);

    const rules = result.ir.groups[0]!.rules;
    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.nodeId)).toEqual(["r1", "r3"]);
    // No suppression-owned rule for the allowed combination.
    for (const group of result.ir.groups) {
      for (const rule of group.rules) {
        expect(rule.ownedByBehaviour).not.toBe("carve-suppression");
      }
    }
    // …but the removal is recorded for un-carve.
    expect(result.restorations).toHaveLength(1);
    expect(result.restorations[0]!.kind).toBe("removed");
    expect(result.restorations[0]!.originalRule!.nodeId).toBe("r2");
  });

  it("mixed dispositions: block rewrites, allow-host removes, others untouched", () => {
    const ir = testIr([bareKeyRule("r1"), textContextRule("r2"), deadkeyContextRule("r5")]);
    const result: SuppressionResult = compileCarveSuppression(ir, [
      blockDisposition("r1"),
      allowDisposition("r2"),
      blockDisposition("r5"),
    ]);

    expect(findRule(result.ir, "r1")!.output).toEqual([{ kind: "nul" }]);
    expect(findRule(result.ir, "r2")).toBeUndefined();
    expect(findRule(result.ir, "r5")!.output).toEqual([{ kind: "nul" }]);
  });

  it("unknown comboIds are ignored without crashing", () => {
    const ir = testIr([bareKeyRule("r1")]);
    const before = snapshot(ir);
    const result: SuppressionResult = compileCarveSuppression(ir, [blockDisposition("rule#nope")]);

    expect(snapshot(result.ir)).toBe(before);
    expect(result.restorations).toEqual([]);
  });

  it("empty dispositions leave the IR structurally unchanged", () => {
    const ir = testIr([bareKeyRule("r1")]);
    const before = snapshot(ir);
    const result: SuppressionResult = compileCarveSuppression(ir, []);

    expect(snapshot(result.ir)).toBe(before);
    expect(result.restorations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. Un-carve (FR-021, scenario 7)
// ---------------------------------------------------------------------------

describe("compileCarveSuppression — un-carve restores originals (FR-021)", () => {
  it("restoreCarveSuppression brings back rewritten rules verbatim", () => {
    const original = [bareKeyRule("r1"), textContextRule("r2"), deadkeyContextRule("r5")];
    const ir = testIr(original);
    const compiled: SuppressionResult = compileCarveSuppression(ir, [
      blockDisposition("r1"),
      blockDisposition("r2"),
      blockDisposition("r5"),
    ]);

    const restored = restoreCarveSuppression(compiled.ir, compiled.restorations);
    // The restored group deep-equals the original group (rules, order, outputs).
    expect(restored.groups[0]!.rules).toEqual(ir.groups[0]!.rules);
  });

  it("un-carve of an allow-host removal re-inserts at the original position", () => {
    const ir = testIr([bareKeyRule("r1"), bareKeyRule("r2"), bareKeyRule("r3")]);
    const compiled: SuppressionResult = compileCarveSuppression(ir, [allowDisposition("r2")]);
    expect(compiled.ir.groups[0]!.rules).toHaveLength(2);

    const restored = restoreCarveSuppression(compiled.ir, compiled.restorations);
    const rules = restored.groups[0]!.rules;
    expect(rules.map((r) => r.nodeId)).toEqual(["r1", "r2", "r3"]);
    expect(rules[1]!.output).toEqual([{ kind: "char", value: "é" }]);
    expect(rules[1]!.ownedByBehaviour).toBeUndefined();
  });

  it("un-carve restores derived arming-rule rewrites too", () => {
    const ir = testIr([armingRule("arm"), deadkeyContextRule("consumer")]);
    const compiled: SuppressionResult = compileCarveSuppression(ir, [blockDisposition("consumer")]);
    expect(findRule(compiled.ir, "arm")!.output).toEqual([{ kind: "nul" }]);

    const restored = restoreCarveSuppression(compiled.ir, compiled.restorations);
    expect(findRule(restored, "arm")!.output).toEqual([{ kind: "deadkey", id: 1 }]);
    expect(findRule(restored, "arm")!.ownedByBehaviour).toBeUndefined();
    expect(findRule(restored, "consumer")!.output).toEqual([{ kind: "char", value: "a" }]);
  });

  it("restorations carry the original rule verbatim (output, context, markers)", () => {
    const patterned = vkeyRule({
      nodeId: "r1",
      vkey: "K_E",
      output: "é",
      ownedByPattern: "some-pattern",
      trailingComment: "author note",
    });
    const ir = testIr([patterned]);
    const compiled: SuppressionResult = compileCarveSuppression(ir, [blockDisposition("r1")]);

    expect(compiled.restorations).toHaveLength(1);
    const restoration = compiled.restorations[0]!;
    expect(restoration.kind).toBe("rewritten");
    expect(restoration.groupNodeId).toBe("group#main");
    expect(restoration.index).toBe(0);
    expect(restoration.originalRule).toEqual(patterned);
  });
});

// ---------------------------------------------------------------------------
// 6. Deadkey carves never fall through (ruling §3, scenario 4)
// ---------------------------------------------------------------------------

describe("compileCarveSuppression — deadkey carves never fall through (ruling §3)", () => {
  it("a carved deadkey rule is rewritten, not deleted: the marker stays consumed", () => {
    const ir = testIr([deadkeyContextRule("r5")]);
    const result: SuppressionResult = compileCarveSuppression(ir, [blockDisposition("r5")]);

    // The rule still exists with the deadkey in its LHS: no fallthrough path
    // passes the keystroke to the host layout with the deadkey armed.
    const rewritten = findRule(result.ir, "r5");
    expect(rewritten).toBeDefined();
    expect(rewritten!.context).toEqual([
      { kind: "deadkey", id: 1 },
      { kind: "vkey", name: "K_A", modifiers: [] },
    ]);
    expect(rewritten!.output).toEqual([{ kind: "nul" }]);
  });

  it("no emitted rule permits the host deadkey to produce", () => {
    const ir = testIr([deadkeyContextRule("r5"), mixedContextRule("r6")]);
    const result: SuppressionResult = compileCarveSuppression(ir, [
      blockDisposition("r5"),
      blockDisposition("r6"),
    ]);

    // Every rule that still mentions the deadkey in context must suppress
    // (nul) or re-emit (context) — never produce text or vanish.
    for (const group of result.ir.groups) {
      for (const rule of group.rules) {
        const mentionsDeadkey = rule.context.some((el) => el.kind === "deadkey");
        if (!mentionsDeadkey) continue;
        const kinds = rule.output.map((el) => el.kind);
        expect(kinds).not.toContain("char");
        expect(kinds[0]).toMatch(/^(nul|context)$/);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Composition notes (for T015; asserted here as compiler-level guarantees)
// ---------------------------------------------------------------------------

describe("compileCarveSuppression — composition guarantees", () => {
  it("block rewrites (not deletes) so a downstream filter must skip owned rules", () => {
    const ir = testIr([bareKeyRule("r1")]);
    const result: SuppressionResult = compileCarveSuppression(ir, [blockDisposition("r1")]);

    // The rule survives the compile: a later deletion filter keyed on the
    // carve set must skip `ownedByBehaviour` rules or it would undo this.
    expect(findRule(result.ir, "r1")).toBeDefined();
    expect(findRule(result.ir, "r1")!.ownedByBehaviour).toBe("carve-suppression");
  });

  it("compiling twice is idempotent: owned rules are not re-processed", () => {
    const ir = testIr([bareKeyRule("r1")]);
    const first: SuppressionResult = compileCarveSuppression(ir, [blockDisposition("r1")]);
    const second: SuppressionResult = compileCarveSuppression(first.ir, [blockDisposition("r1")]);

    expect(snapshot(second.ir)).toBe(snapshot(first.ir));
    expect(second.restorations).toEqual([]);
  });
});

describe("store-slot guard rules (T013)", () => {
  // Deadkey fan-out pair (Cameroon pattern): the paired rule consumes the
  // input store via any() and emits from the output store via index().
  const deadkeySlotIR = (): KeyboardIR => ({
    nodeId: "kbd",
    stores: [
      charStore({ nodeId: "store#dkf003b", name: "dkf003b", chars: ["e", "E"] }),
      charStore({ nodeId: "store#dkt003b", name: "dkt003b", chars: ["é", "É"] }),
    ],
    groups: [
      {
        nodeId: "group#main",
        rules: [
          charRule({ nodeId: "lead", context: "z", output: "z" }),
          charRule({
            nodeId: "paired",
            context: [
              { kind: "deadkey", id: 3 },
              { kind: "any", storeRef: "dkf003b" },
            ],
            output: [{ kind: "index", storeRef: "dkt003b", offset: 2 }],
          }),
        ],
      },
    ],
  });

  const blockSlot1 = { comboId: "store#dkt003b#1", disposition: "block" as const };

  it("synthesizes a guard immediately ahead of the paired rule with the carved selector char", () => {
    const ir = deadkeySlotIR();
    const result = compileCarveSuppression(ir, [blockSlot1]);

    const rules = result.ir.groups[0]!.rules;
    expect(rules.map((r) => r.nodeId)).toEqual([
      "lead",
      "gen-carve-guard-store#dkt003b-1-paired-0",
      "paired",
    ]);

    const guard = rules[1]!;
    // Slot 1 of dkt003b is "É"; its pair-set peer dkf003b holds "E" at the
    // same index, so the guard substitutes "E" into the paired rule's LHS.
    expect(guard.context).toEqual([
      { kind: "deadkey", id: 3 },
      { kind: "char", value: "E" },
    ]);
    // Deadkey + char context → the context verb (context-bearing
    // suppression is `context`, never `nul`).
    expect(guard.output).toEqual([{ kind: "context", offset: 0 }]);
    expect(guard.ownedByBehaviour).toBe("carve-suppression");
    // The paired rule itself is untouched.
    expect(rules[2]!.output).toEqual([{ kind: "index", storeRef: "dkt003b", offset: 2 }]);
  });

  it("records a guard restoration carrying the synthesized nodeId", () => {
    const result = compileCarveSuppression(deadkeySlotIR(), [blockSlot1]);
    expect(result.restorations).toEqual([
      {
        kind: "guard",
        groupNodeId: "group#main",
        index: 1,
        synthesizedNodeId: "gen-carve-guard-store#dkt003b-1-paired-0",
      },
    ]);
  });

  it("reproduces the full LHS through the trigger for `+` rules", () => {
    // any(word) + [K_X] > index(word, 1): index offset 1 resolves to the
    // any() once the synthetic `+` separator is excluded.
    const ir: KeyboardIR = {
      nodeId: "kbd",
      stores: [charStore({ nodeId: "store#word", name: "word", chars: ["a", "b"] })],
      groups: [
        {
          nodeId: "group#main",
          rules: [
            charRule({
              nodeId: "paired",
              context: [
                { kind: "any", storeRef: "word" },
                { kind: "raw", text: "+" },
                { kind: "vkey", name: "K_X", modifiers: [] },
              ],
              output: [{ kind: "index", storeRef: "word", offset: 1 }],
            }),
          ],
        },
      ],
    };

    const result = compileCarveSuppression(ir, [
      { comboId: "store#word#0", disposition: "block" },
    ]);

    const rules = result.ir.groups[0]!.rules;
    expect(rules).toHaveLength(2);
    const guard = rules[0]!;
    expect(guard.context).toEqual([
      { kind: "char", value: "a" },
      { kind: "raw", text: "+" },
      { kind: "vkey", name: "K_X", modifiers: [] },
    ]);
    expect(guard.ownedByBehaviour).toBe("carve-suppression");
  });

  it("allow-host on a slot emits no guard and records no restoration", () => {
    const ir = deadkeySlotIR();
    const result = compileCarveSuppression(ir, [
      { comboId: "store#dkt003b#1", disposition: "allow-host" },
    ]);
    expect(result.ir).toEqual(ir);
    expect(result.restorations).toEqual([]);
  });

  it("never touches stores — interior nul padding stays forbidden", () => {
    const ir = deadkeySlotIR();
    const result = compileCarveSuppression(ir, [blockSlot1]);
    // The compiler synthesizes guard RULES; store contents are byte-identical.
    expect(result.ir.stores).toEqual(ir.stores);
    const allItems = result.ir.stores.flatMap((s) => s.items);
    expect(allItems).not.toContainEqual(expect.objectContaining({ kind: "nul" }));
  });

  it("restore removes synthesized guards — the exact inverse (FR-021)", () => {
    const ir = deadkeySlotIR();
    const result = compileCarveSuppression(ir, [blockSlot1]);
    const restored = restoreCarveSuppression(result.ir, result.restorations);
    expect(restored).toEqual(ir);
  });

  it("appends beep to the guard output when loud", () => {
    const result = compileCarveSuppression(deadkeySlotIR(), [blockSlot1], { loud: true });
    const guard = result.ir.groups[0]!.rules[1]!;
    expect(guard.output).toEqual([{ kind: "context", offset: 0 }, { kind: "beep" }]);
  });

  it("does not mutate the input IR", () => {
    const ir = deadkeySlotIR();
    const before = structuredClone(ir);
    compileCarveSuppression(ir, [blockSlot1]);
    expect(ir).toEqual(before);
  });

  it("ignores slot ids for missing stores or out-of-range indices", () => {
    const ir = deadkeySlotIR();
    const result = compileCarveSuppression(ir, [
      { comboId: "store#nope#0", disposition: "block" },
      { comboId: "store#dkt003b#99", disposition: "block" },
    ]);
    expect(result.ir).toEqual(ir);
    expect(result.restorations).toEqual([]);
  });

  it("treats a rule nodeId that parses as a slot id as a rule, not a slot", () => {
    const ir: KeyboardIR = {
      nodeId: "kbd",
      stores: [],
      groups: [
        {
          nodeId: "group#main",
          rules: [
            charRule({
              nodeId: "rule#7",
              context: [{ kind: "vkey", name: "K_X", modifiers: [] }],
              output: "y",
            }),
          ],
        },
      ],
    };
    // "rule#7" parses as <storeNodeId>#<index> but is a real rule nodeId —
    // rule dispositions take precedence.
    const result = compileCarveSuppression(ir, [
      { comboId: "rule#7", disposition: "block" },
    ]);
    const rules = result.ir.groups[0]!.rules;
    expect(rules).toHaveLength(1);
    expect(rules[0]!.output).toEqual([{ kind: "nul" }]);
    expect(result.restorations[0]!.kind).toBe("rewritten");
  });

  it("skips already-owned paired rules as guard anchors", () => {
    const ir = deadkeySlotIR();
    const paired = ir.groups[0]!.rules[1]!;
    paired.ownedByBehaviour = "swallow-undefined";
    const result = compileCarveSuppression(ir, [blockSlot1]);
    expect(result.ir).toEqual(ir);
    expect(result.restorations).toEqual([]);
  });

  it("recompile is idempotent — no duplicate guards", () => {
    const first = compileCarveSuppression(deadkeySlotIR(), [blockSlot1]);
    const second = compileCarveSuppression(first.ir, [blockSlot1]);
    expect(second.restorations).toEqual([]);
    expect(second.ir).toEqual(first.ir);
  });
});
