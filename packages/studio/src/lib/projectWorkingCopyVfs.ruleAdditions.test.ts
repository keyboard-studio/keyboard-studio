// Projection-level tests for the spec-082 rules-step seam
// (ruleAdditions.ts × projectWorkingCopyVfs step 1.8).
//
// This file does NOT mock @keyboard-studio/engine: it exercises the real
// applyCarveToVfs so we can observe the actual emitted .kmn content —
// proving that each rules-step source (pack install, guard synthesis,
// Narrow) reaches the projected artifact, in working-IR order.
//
// Coverage:
//   1. Pack install: marked rules + a marked store appear in the emitted .kmn.
//   2. Guard synthesis: a marked guard clone appended by "Add all" is emitted.
//   3. Narrow: the marked exception is emitted immediately BEFORE its guard
//      (first-match semantics preserved through the projection).
//   4. Exclusion hazards: unmarked working-IR extras (context-tolerance
//      replay, touch-synthesis rules) are NOT imported by the seam.
//   5. No-additions path stays byte-identical (ruleAdditions omitted vs empty).
//   6. A marked addition filtered by the deletion set is never resurrected
//      (install-then-disable-family stays disabled).

import { describe, it, expect } from "vitest";
import { createVirtualFS, type VirtualFS } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import type { IRRule, IRStore, KeyboardIR } from "@keyboard-studio/contracts";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.js";
import { deriveRuleAdditions } from "../survey/rules/ruleAdditions.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_KMN = [
  "store(&VERSION) '10.0'",
  "store(diablock) ' ' '!'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "any(diablock) + [RALT K_C] > 'x'",
  "+ [K_A] > 'a'",
  "",
].join("\n");

function parseBase(): KeyboardIR {
  return parseKmn(BASE_KMN, "test_kb").ir;
}

function makeVfs(): VirtualFS {
  return createVirtualFS([{ path: "source/test_kb.kmn", content: BASE_KMN, isBinary: false }]);
}

function kmnOf(vfs: VirtualFS): string {
  const content = vfs.get("source/test_kb.kmn")?.content;
  if (typeof content !== "string") throw new Error("projected .kmn missing from VFS");
  return content;
}

function mainGroup(ir: KeyboardIR) {
  const group = ir.groups.find((g) => g.name === "main");
  if (group === undefined) throw new Error("fixture has no main group");
  return group;
}

/** The base guard rule: the only rule whose context references any(diablock). */
function guardRuleId(ir: KeyboardIR): string {
  const rule = mainGroup(ir).rules.find((r) =>
    r.context.some((el) => el.kind === "any" && el.storeRef === "diablock"),
  );
  if (rule === undefined) throw new Error("fixture guard rule not found");
  return rule.nodeId;
}

function findRuleIdByOutput(ir: KeyboardIR, char: string): string {
  const rule = mainGroup(ir).rules.find((r) =>
    r.output.some((o) => o.kind === "char" && o.value === char),
  );
  if (rule === undefined) throw new Error(`fixture rule producing '${char}' not found`);
  return rule.nodeId;
}

/** Mirror of the engine pack installer's minted rule shape (FR-015). */
function packRule(nodeId: string): IRRule {
  return {
    nodeId,
    context: [
      { kind: "any", storeRef: "newblock" },
      { kind: "vkey", name: "K_D", modifiers: ["RALT"] },
    ],
    output: [{ kind: "char", value: "p" }],
    ownedByBehaviour: "test-pack/test_behaviour",
    rulesStepAdded: true,
  };
}

/** Mirror of the engine pack installer's synthesized guard store. */
function packStore(): IRStore {
  return {
    nodeId: "store#newblock",
    name: "newblock",
    items: [
      { kind: "char", value: " " },
      { kind: "char", value: "~" },
    ],
    isSystem: false,
    rulesStepAdded: true,
  };
}

/** Mirror of guardRuleSynthesis.cloneWithKey: a marked clone appended to the group. */
function guardClone(nodeId: string): IRRule {
  return {
    nodeId,
    context: [
      { kind: "any", storeRef: "diablock" },
      { kind: "vkey", name: "K_E", modifiers: ["RALT"] },
    ],
    output: [{ kind: "char", value: "x" }],
    trailingComment: "added from guard suggestion",
    rulesStepAdded: true,
  };
}

/** Mirror of narrowGuard.buildNarrowException: marked, raw(blockedChar) context. */
function narrowException(nodeId: string): IRRule {
  return {
    nodeId,
    context: [
      { kind: "raw", text: "e" },
      { kind: "vkey", name: "K_C", modifiers: ["RALT"] },
    ],
    output: [{ kind: "raw", text: "ȩ" }],
    rulesStepAdded: true,
  };
}

/** An unmarked extra rule, as the context-tolerance replay would mint. */
function toleranceStyleRule(): IRRule {
  return {
    nodeId: "rule#tol-1",
    context: [{ kind: "vkey", name: "K_T", modifiers: [] }],
    output: [{ kind: "char", value: "t" }],
  };
}

/** An unmarked extra rule, as touch rule synthesis would mint. */
function touchStyleRule(): IRRule {
  return {
    nodeId: "rule#touch-1",
    context: [{ kind: "vkey", name: "K_U", modifiers: [] }],
    output: [{ kind: "char", value: "u" }],
  };
}

interface ProjectOpts {
  deletedNodeIds?: ReadonlySet<string>;
  deletedItemIds?: ReadonlySet<string>;
  ruleAdditions?: ReturnType<typeof deriveRuleAdditions>;
}

function project(vfs: VirtualFS, baseIr: KeyboardIR, opts: ProjectOpts = {}) {
  return projectWorkingCopyVfs({
    vfs,
    keyboardId: "test_kb",
    baseIr,
    deletedNodeIds: opts.deletedNodeIds ?? new Set<string>(),
    deletedItemIds: opts.deletedItemIds ?? new Set<string>(),
    assignments: [],
    getPattern: () => undefined,
    identity: null,
    ...(opts.ruleAdditions !== undefined ? { ruleAdditions: opts.ruleAdditions } : {}),
  });
}

/** Working IR = base with `extra` rules appended to main and `stores` added. */
function withAppended(base: KeyboardIR, extra: IRRule[], stores: IRStore[] = []): KeyboardIR {
  return {
    ...base,
    groups: base.groups.map((g) =>
      g.name === "main" ? { ...g, rules: [...g.rules, ...extra] } : g,
    ),
    stores: [...base.stores, ...stores],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("projectWorkingCopyVfs rules-step seam — real engine, no mock", () => {
  it("1. pack install: marked rules and the marked store reach the emitted .kmn", () => {
    const base = parseBase();
    const working = withAppended(base, [packRule("rule#pack-1"), packRule("rule#pack-2")], [
      packStore(),
    ]);
    const vfs = makeVfs();

    const { warnings } = project(vfs, base, {
      ruleAdditions: deriveRuleAdditions(working, base),
    });
    expect(warnings).toHaveLength(0);

    const kmn = kmnOf(vfs);
    // The synthesized store is emitted alongside the rules that reference it.
    expect(kmn).toContain("store(newblock)");
    // Both installed rules are emitted.
    expect(kmn).toContain("any(newblock)");
    // Base rules survive the splice untouched.
    expect(kmn).toContain("any(diablock)");
    expect(kmn).toContain("K_A");
  });

  it("2. guard synthesis: a marked guard clone appended by 'Add all' is emitted", () => {
    const base = parseBase();
    const working = withAppended(base, [guardClone("rule#synth-1")]);
    const vfs = makeVfs();

    project(vfs, base, { ruleAdditions: deriveRuleAdditions(working, base) });

    const kmn = kmnOf(vfs);
    expect(kmn).toContain("[RALT K_E]");
    expect(kmn).toContain("any(diablock)");
  });

  it("3. Narrow: the exception is emitted immediately BEFORE its guard", () => {
    const base = parseBase();
    const guardId = guardRuleId(base);
    const exception = narrowException("rule#narrow-1");
    const working: KeyboardIR = {
      ...base,
      groups: base.groups.map((g) => {
        if (g.name !== "main") return g;
        const idx = g.rules.findIndex((r) => r.nodeId === guardId);
        const rules = [...g.rules];
        rules.splice(idx, 0, exception);
        return { ...g, rules };
      }),
    };
    const vfs = makeVfs();

    project(vfs, base, { ruleAdditions: deriveRuleAdditions(working, base) });

    const lines = kmnOf(vfs).split("\n");
    const candidates = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.includes("[RALT K_C]"));
    // Exactly the exception and the guard mention this chord.
    expect(candidates).toHaveLength(2);
    // First-match order: exception (no any(diablock)) before guard.
    expect(candidates[0]?.line).not.toContain("any(diablock)");
    expect(candidates[1]?.line).toContain("any(diablock)");
    // Adjacent lines: nothing wedged between them.
    expect(candidates[1]!.index - candidates[0]!.index).toBe(1);
  });

  it("4. unmarked working-IR extras are NOT imported (context-tolerance + touch synthesis)", () => {
    const base = parseBase();
    const working = withAppended(base, [
      packRule("rule#pack-1"),
      toleranceStyleRule(),
      touchStyleRule(),
    ]);
    const vfs = makeVfs();

    project(vfs, base, { ruleAdditions: deriveRuleAdditions(working, base) });

    const kmn = kmnOf(vfs);
    // The marked pack rule made it through the seam...
    expect(kmn).toContain("any(newblock)");
    // ...but the unmarked tolerance-replay and touch-synthesis rules did not,
    // even though they sit in the working IR absent from the base IR.
    expect(kmn).not.toContain("K_T");
    expect(kmn).not.toContain("K_U");
  });

  it("5. the no-additions path stays byte-identical (omitted vs empty derivation)", () => {
    const base = parseBase();
    const kaId = findRuleIdByOutput(base, "a");

    const vfsOmitted = makeVfs();
    project(vfsOmitted, base, { deletedItemIds: new Set([kaId]) });
    const omitted = kmnOf(vfsOmitted);
    expect(omitted).not.toContain("K_A");
    expect(omitted).toContain("any(diablock)");

    const vfsEmpty = makeVfs();
    project(vfsEmpty, base, {
      deletedItemIds: new Set([kaId]),
      ruleAdditions: deriveRuleAdditions(base, base),
    });
    expect(kmnOf(vfsEmpty)).toBe(omitted);
  });

  it("6. a marked addition filtered by the deletion set is never resurrected", () => {
    const base = parseBase();
    const working = withAppended(base, [packRule("rule#pack-9")]);
    const vfs = makeVfs();

    // The user installed the pack, then disabled its family: the family
    // machinery feeds the member rule ids into the projection's deletion set.
    project(vfs, base, {
      ruleAdditions: deriveRuleAdditions(working, base),
      deletedItemIds: new Set(["rule#pack-9"]),
    });

    const kmn = kmnOf(vfs);
    expect(kmn).not.toContain("any(newblock)");
    // Base rules are unaffected.
    expect(kmn).toContain("any(diablock)");
    expect(kmn).toContain("K_A");
  });
});
