// Unit tests for the spec-082 rules-step seam (ruleAdditions.ts): the marker
// protocol between the rules survey step (pack install, guard synthesis,
// Narrow) and the VFS projection.
//
// Coverage:
//   deriveRuleAdditions — collects marked rules/stores absent from the base
//     IR; ignores unmarked extras, marked-but-already-in-base nodes, and a
//     null working IR.
//   spliceRuleAdditions — rebuilds working-IR order (Narrow exception stays
//     immediately before its guard); never resurrects deletion-filtered
//     additions; skips working-order ids missing from the filtered IR; never
//     mutates its input; identity when there is nothing to add.
//   ruleAdditionsKey — primitive-stable, position-sensitive.

import { describe, it, expect } from "vitest";
import {
  makeTestIR,
  irGroup,
  vkeyRule,
  makeCharStore,
} from "@keyboard-studio/contracts/fixtures";
import type { IRRule, IRStore, KeyboardIR } from "@keyboard-studio/contracts";
import {
  deriveRuleAdditions,
  spliceRuleAdditions,
  hasRuleAdditions,
  ruleAdditionsKey,
  EMPTY_RULE_ADDITIONS,
} from "./ruleAdditions.ts";

function marked(rule: IRRule): IRRule {
  return { ...rule, rulesStepAdded: true as const };
}

function markedStore(store: IRStore): IRStore {
  return { ...store, rulesStepAdded: true as const };
}

function baseIr(): KeyboardIR {
  return makeTestIR([
    irGroup({
      nodeId: "group#main",
      name: "main",
      rules: [
        vkeyRule({ nodeId: "rule#a", vkey: "K_A", output: "a" }),
        vkeyRule({ nodeId: "rule#b", vkey: "K_B", output: "b" }),
      ],
    }),
  ]);
}

/** Working IR = base with `extra` rules appended to group#main (base ids preserved). */
function withAppended(base: KeyboardIR, extra: IRRule[], stores: IRStore[] = []): KeyboardIR {
  return {
    ...base,
    groups: base.groups.map((g) =>
      g.nodeId === "group#main" ? { ...g, rules: [...g.rules, ...extra] } : g,
    ),
    stores: [...base.stores, ...stores],
  };
}

describe("deriveRuleAdditions", () => {
  it("collects marked rules absent from the base IR, with the full working order", () => {
    const base = baseIr();
    const working = withAppended(base, [
      marked(vkeyRule({ nodeId: "rule#new", vkey: "K_C", output: "c" })),
    ]);

    const derived = deriveRuleAdditions(working, base);

    expect(hasRuleAdditions(derived)).toBe(true);
    expect(derived.groups).toHaveLength(1);
    expect(derived.groups[0]?.groupNodeId).toBe("group#main");
    expect(derived.groups[0]?.added.map((r) => r.nodeId)).toEqual(["rule#new"]);
    expect(derived.groups[0]?.workingOrder).toEqual(["rule#a", "rule#b", "rule#new"]);
    expect(derived.stores).toEqual([]);
  });

  it("ignores unmarked rules absent from the base IR (context-tolerance / touch synthesis)", () => {
    const base = baseIr();
    // No marker: the tolerance-replay and touch-synthesis flows must not leak in.
    const working = withAppended(base, [vkeyRule({ nodeId: "rule#tol", vkey: "K_T", output: "t" })]);

    expect(deriveRuleAdditions(working, base)).toBe(EMPTY_RULE_ADDITIONS);
  });

  it("ignores a marked rule whose nodeId already exists in the base IR (defensive)", () => {
    const base = baseIr();
    const working: KeyboardIR = {
      ...base,
      groups: base.groups.map((g) =>
        g.nodeId === "group#main"
          ? {
              ...g,
              rules: g.rules.map((r) =>
                r.nodeId === "rule#a" ? { ...r, rulesStepAdded: true as const } : r,
              ),
            }
          : g,
      ),
    };

    expect(deriveRuleAdditions(working, base)).toBe(EMPTY_RULE_ADDITIONS);
  });

  it("collects marked stores absent from the base IR and ignores marked stores already present", () => {
    const diablock = makeCharStore("store#diablock", "diablock", " !");
    const base = makeTestIR(
      [
        irGroup({
          nodeId: "group#main",
          name: "main",
          rules: [vkeyRule({ nodeId: "rule#a", vkey: "K_A", output: "a" })],
        }),
      ],
      [markedStore(diablock)],
    );
    const newStore = markedStore(makeCharStore("store#newblock", "newblock", " ~"));
    const working: KeyboardIR = { ...base, stores: [...base.stores, newStore] };

    const derived = deriveRuleAdditions(working, base);

    expect(derived.stores.map((s) => s.name)).toEqual(["newblock"]);
    expect(derived.groups).toEqual([]);
  });

  it("returns the shared empty derivation for a null working IR or no additions", () => {
    const base = baseIr();
    expect(deriveRuleAdditions(null, base)).toBe(EMPTY_RULE_ADDITIONS);
    expect(deriveRuleAdditions(undefined, base)).toBe(EMPTY_RULE_ADDITIONS);
    expect(deriveRuleAdditions(base, base)).toBe(EMPTY_RULE_ADDITIONS);
    expect(hasRuleAdditions(EMPTY_RULE_ADDITIONS)).toBe(false);
  });
});

describe("spliceRuleAdditions", () => {
  it("rebuilds working-IR order: a Narrow exception stays immediately before its guard", () => {
    const base = baseIr();
    const narrow = marked(vkeyRule({ nodeId: "rule#narrow", vkey: "K_E", output: "e" }));
    const working: KeyboardIR = {
      ...base,
      groups: base.groups.map((g) =>
        g.nodeId === "group#main"
          ? { ...g, rules: [g.rules[0]!, narrow, g.rules[1]!] }
          : g,
      ),
    };

    const spliced = spliceRuleAdditions(base, deriveRuleAdditions(working, base), new Set());

    expect(spliced.groups[0]?.rules.map((r) => r.nodeId)).toEqual([
      "rule#a",
      "rule#narrow",
      "rule#b",
    ]);
  });

  it("never resurrects an added rule the deletion set filtered out", () => {
    const base = baseIr();
    const added = marked(vkeyRule({ nodeId: "rule#pack", vkey: "K_C", output: "c" }));
    const working = withAppended(base, [added]);

    const spliced = spliceRuleAdditions(
      base,
      deriveRuleAdditions(working, base),
      new Set(["rule#pack"]),
    );

    expect(spliced.groups[0]?.rules.map((r) => r.nodeId)).toEqual(["rule#a", "rule#b"]);
  });

  it("skips working-order ids missing from the filtered IR (carve-deleted base rules stay out)", () => {
    const base = baseIr();
    const working = withAppended(base, [
      marked(vkeyRule({ nodeId: "rule#new", vkey: "K_C", output: "c" })),
    ]);
    // The projection already carve-deleted rule#a before the splice runs.
    const filtered: KeyboardIR = {
      ...base,
      groups: base.groups.map((g) =>
        g.nodeId === "group#main"
          ? { ...g, rules: g.rules.filter((r) => r.nodeId !== "rule#a") }
          : g,
      ),
    };

    const spliced = spliceRuleAdditions(
      filtered,
      deriveRuleAdditions(working, base),
      new Set(),
    );

    expect(spliced.groups[0]?.rules.map((r) => r.nodeId)).toEqual(["rule#b", "rule#new"]);
  });

  it("is the identity (same object) when there is nothing to add", () => {
    const base = baseIr();
    expect(spliceRuleAdditions(base, EMPTY_RULE_ADDITIONS, new Set())).toBe(base);
  });

  it("does not mutate the input IR", () => {
    const base = baseIr();
    const before = base.groups[0]?.rules.map((r) => r.nodeId);
    const working = withAppended(base, [
      marked(vkeyRule({ nodeId: "rule#new", vkey: "K_C", output: "c" })),
    ]);

    spliceRuleAdditions(base, deriveRuleAdditions(working, base), new Set());

    expect(base.groups[0]?.rules.map((r) => r.nodeId)).toEqual(before);
  });

  it("appends new stores and dedupes by store name", () => {
    const base = baseIr();
    const store = markedStore(makeCharStore("store#newblock", "newblock", " ~"));
    const working: KeyboardIR = { ...base, stores: [...base.stores, store] };

    const spliced = spliceRuleAdditions(base, deriveRuleAdditions(working, base), new Set());

    expect(spliced.stores.map((s) => s.name)).toEqual(["newblock"]);

    // A store with the same name already in the IR is not duplicated.
    const dupe: KeyboardIR = {
      ...spliced,
      stores: [...spliced.stores, { ...store, nodeId: "store#newblock-2" }],
    };
    const rederived = deriveRuleAdditions(dupe, base);
    const respliced = spliceRuleAdditions(base, rederived, new Set());
    expect(respliced.stores.filter((s) => s.name === "newblock")).toHaveLength(1);
  });
});

describe("ruleAdditionsKey", () => {
  it("is empty when there is nothing to project and changes on reorder", () => {
    expect(ruleAdditionsKey(EMPTY_RULE_ADDITIONS)).toBe("");

    const base = baseIr();
    const narrow = marked(vkeyRule({ nodeId: "rule#narrow", vkey: "K_E", output: "e" }));
    const before: KeyboardIR = {
      ...base,
      groups: base.groups.map((g) =>
        g.nodeId === "group#main" ? { ...g, rules: [narrow, ...g.rules] } : g,
      ),
    };
    const after: KeyboardIR = {
      ...base,
      groups: base.groups.map((g) =>
        g.nodeId === "group#main" ? { ...g, rules: [...g.rules, narrow] } : g,
      ),
    };

    const keyBefore = ruleAdditionsKey(deriveRuleAdditions(before, base));
    const keyAfter = ruleAdditionsKey(deriveRuleAdditions(after, base));
    expect(keyBefore).not.toBe("");
    expect(keyBefore).not.toBe(keyAfter);
  });
});
