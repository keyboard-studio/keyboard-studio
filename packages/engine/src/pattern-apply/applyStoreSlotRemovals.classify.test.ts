import { describe, it, expect } from "vitest";
import { applyStoreSlotRemovals, classifyStoreSlotEdit, describeStorePairing } from "./applyStoreSlotRemovals.js";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR, IRStore, IRGroup, IRRule } from "@keyboard-studio/contracts";
import { makeStartIr } from "../test-support/applyStoreSlotRemovals.testkit.js";

// ---------------------------------------------------------------------------
// 7. classifyStoreSlotEdit — one unit case per class in the decision table
// ---------------------------------------------------------------------------

describe("classifyStoreSlotEdit — decision table", () => {
  it("blocks a system store (isSystem: true) regardless of usage", () => {
    const store: IRStore = { nodeId: "s#0", name: "NAME", items: [], isSystem: true };
    const ir = makeTestIR([], [store]);
    expect(classifyStoreSlotEdit(store, ir)).toEqual({
      mode: "blocked",
      reason: "system-store",
    });
  });

  it("blocks a store referenced by notany() (dropping would widen matching)", () => {
    const store: IRStore = {
      nodeId: "s#word",
      name: "word",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "notany", storeRef: "word" }],
      output: [{ kind: "char", value: "x" }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store]);
    expect(classifyStoreSlotEdit(store, ir)).toEqual({
      mode: "blocked",
      reason: "notany-widens",
    });
  });

  it("prunes a tainted char from a notany() store under carveNotAnyHygiene (issue #1809, ruling §3)", () => {
    // Ruling §3: removing a can't-exist character from a notany() store is
    // behavior-neutral under carve's closed model — prune for hygiene instead
    // of blocking. The carve apply path opts in via `carveNotAnyHygiene`; the
    // general `notany-widens` block (previous test) is preserved by default.
    const store: IRStore = {
      nodeId: "s#word",
      name: "word",
      items: [
        { kind: "char", value: "a" },
        { kind: "char", value: "b" },
      ],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "notany", storeRef: "word" }],
      output: [{ kind: "char", value: "x" }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store]);
    const charValues = (irAfter: KeyboardIR) =>
      irAfter.stores
        .find((s) => s.name === "word")!
        .items.map((item) => (item as { kind: string; value?: string }).value);

    // Default: the general notany-widens block is preserved.
    const blocked = applyStoreSlotRemovals(ir, new Set(["s#word#0"]));
    expect(charValues(blocked.ir)).toEqual(["a", "b"]);
    expect(blocked.warnings.some((w) => w.includes("referenced by notany()"))).toBe(true);

    // Carve-scoped hygiene: the tainted char is pruned instead of blocking.
    const pruned = applyStoreSlotRemovals(ir, new Set(["s#word#0"]), {
      carveNotAnyHygiene: true,
    });
    expect(charValues(pruned.ir)).toEqual(["b"]);
    expect(pruned.appliedCount).toBe(1);
    expect(pruned.warnings.some((w) => w.includes("notany()"))).toBe(false);
  });

  it("blocks a store referenced by index() in a rule's context", () => {
    const store: IRStore = {
      nodeId: "s#ctx",
      name: "ctxStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "index", storeRef: "ctxStore", offset: 1 }],
      output: [{ kind: "char", value: "x" }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store]);
    expect(classifyStoreSlotEdit(store, ir)).toEqual({
      mode: "blocked",
      reason: "context-index-aligned",
    });
  });

  it("drops a store referenced only by an unpaired any() (no index() anywhere in that rule's output)", () => {
    const store: IRStore = {
      nodeId: "s#any",
      name: "anyStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "any", storeRef: "anyStore" }],
      output: [{ kind: "char", value: "z" }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store]);
    expect(classifyStoreSlotEdit(store, ir)).toEqual({ mode: "drop", coordinatedWith: [] });
  });

  it("blocks a store referenced via outs() in some rule's output (Amendment 4, fail-closed)", () => {
    const store: IRStore = {
      nodeId: "s#outs",
      name: "outsStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "outs", storeRef: "outsStore" }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store]);
    expect(classifyStoreSlotEdit(store, ir)).toEqual({
      mode: "blocked",
      reason: "outs-reference-unanalyzed",
    });
  });

  it("propagates the outs()-reference block across the whole pair-set", () => {
    // storeA is paired with storeB via index()/any() in rule#pair, and storeB
    // (only) is separately referenced by outs() in rule#outs. Editing EITHER
    // storeA or storeB must block, because a coordinated drop touches both.
    const storeA: IRStore = {
      nodeId: "s#a",
      name: "storeA",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const storeB: IRStore = {
      nodeId: "s#b",
      name: "storeB",
      items: [{ kind: "char", value: "b" }],
      isSystem: false,
    };
    const rulePair: IRRule = {
      nodeId: "rule#pair",
      context: [{ kind: "any", storeRef: "storeA" }],
      output: [{ kind: "index", storeRef: "storeB", offset: 1 }],
    };
    const ruleOuts: IRRule = {
      nodeId: "rule#outs",
      context: [{ kind: "vkey", name: "K_B", modifiers: [] }],
      output: [{ kind: "outs", storeRef: "storeB" }],
    };
    const group: IRGroup = {
      nodeId: "g#0",
      name: "main",
      usingKeys: true,
      rules: [rulePair, ruleOuts],
      readonly: false,
    };
    const ir = makeTestIR([group], [storeA, storeB]);
    expect(classifyStoreSlotEdit(storeA, ir)).toEqual({
      mode: "blocked",
      reason: "outs-reference-unanalyzed",
    });
    expect(classifyStoreSlotEdit(storeB, ir)).toEqual({
      mode: "blocked",
      reason: "outs-reference-unanalyzed",
    });
  });

  it("leaves a store NOT referenced by outs() unaffected by the outs() fail-closed rule", () => {
    const store: IRStore = {
      nodeId: "s#plain",
      name: "plainStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const otherStore: IRStore = {
      nodeId: "s#other",
      name: "otherStore",
      items: [{ kind: "char", value: "z" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "any", storeRef: "plainStore" }],
      output: [{ kind: "char", value: "x" }],
    };
    const ruleOuts: IRRule = {
      nodeId: "rule#outs",
      context: [{ kind: "vkey", name: "K_Z", modifiers: [] }],
      output: [{ kind: "outs", storeRef: "otherStore" }],
    };
    const group: IRGroup = {
      nodeId: "g#0",
      name: "main",
      usingKeys: true,
      rules: [rule, ruleOuts],
      readonly: false,
    };
    const ir = makeTestIR([group], [store, otherStore]);
    expect(classifyStoreSlotEdit(store, ir)).toEqual({ mode: "drop", coordinatedWith: [] });
  });

  it("drops a store unreferenced by any rule", () => {
    const store: IRStore = {
      nodeId: "s#orphan",
      name: "orphanStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const ir = makeTestIR([], [store]);
    expect(classifyStoreSlotEdit(store, ir)).toEqual({ mode: "drop", coordinatedWith: [] });
  });

  it("blocks a store that is both an output target (outs()) and an any() source (formerly dual-use — outs() is now blocked outright, Amendment 4)", () => {
    const store: IRStore = {
      nodeId: "s#dual",
      name: "dualStore",
      items: [{ kind: "char", value: "a" }, { kind: "char", value: "b" }],
      isSystem: false,
    };
    const ruleEmit: IRRule = {
      nodeId: "rule#emit",
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "outs", storeRef: "dualStore" }],
    };
    const ruleSource: IRRule = {
      nodeId: "rule#source",
      context: [{ kind: "any", storeRef: "dualStore" }],
      output: [{ kind: "char", value: "z" }],
    };
    const group: IRGroup = {
      nodeId: "g#0",
      name: "main",
      usingKeys: true,
      rules: [ruleEmit, ruleSource],
      readonly: false,
    };
    const ir = makeTestIR([group], [store]);
    expect(classifyStoreSlotEdit(store, ir)).toEqual({
      mode: "blocked",
      reason: "outs-reference-unanalyzed",
    });
  });
});

// ---------------------------------------------------------------------------
// 7a. classifyStoreSlotEdit — matchTableOnly (#533 carve gallery over-count:
// a store like Cameroon's `composed`/`diablock` is referenced by any() but
// never actually PRODUCED by any rule — its any() reference lives entirely
// inside a Backspace/Delete repair rule or a bare `context` no-op guard,
// never a genuine forward-typing rule). Covers BOTH sibling shapes
// (edit-only trigger AND bare-context guard) and proves a genuine paired
// input store (dkf/dkt-style: any() paired via a RESOLVED index() output,
// reached with no edit/undo trigger at all) is NOT flagged.
//
// This used to be a BLOCK reason (`input-only-match-table`) — reverted
// because it also blocked the engine's own dependent-combo cleanup: carving
// a character that lives ONLY in such a store (e.g. the input half of a
// Backspace-unwrap row) must still be able to drop that row (see
// carveDependentCombos.test.ts's "only the INPUT half of an unwrap row"
// case). The store is still a normal, unblocked `drop` — nothing
// positionally depends on it — just annotated `matchTableOnly` so a
// display-only caller (the studio's chip UI) can still tell "never actually
// produced" apart from an ordinary drop.
// ---------------------------------------------------------------------------

describe("classifyStoreSlotEdit — matchTableOnly", () => {
  it('flags (but does not block) a store whose ONLY any() reference is inside a Backspace-triggered repair rule (Cameroon composed/comp-dia shape)', () => {
    const composed: IRStore = {
      nodeId: "s#composed",
      name: "composed",
      items: [{ kind: "char", value: "à" }],
      isSystem: false,
    };
    const compDia: IRStore = {
      nodeId: "s#comp-dia",
      name: "comp-dia",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#bksp",
      context: [
        { kind: "any", storeRef: "composed" },
        { kind: "raw", text: "+" },
        { kind: "vkey", name: "K_BKSP", modifiers: [] },
      ],
      output: [{ kind: "index", storeRef: "comp-dia", offset: 1 }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [composed, compDia]);

    expect(classifyStoreSlotEdit(composed, ir)).toEqual({
      mode: "drop",
      coordinatedWith: ["comp-dia"],
      matchTableOnly: true,
    });
    // The real OUTPUT store (comp-dia) is unaffected — coordinated with
    // composed, still a normal drop from its own entry point, and never
    // itself flagged matchTableOnly (it has no any() reference at all).
    expect(classifyStoreSlotEdit(compDia, ir)).toEqual({
      mode: "drop",
      coordinatedWith: ["composed"],
    });
  });

  it('flags (but does not block) a store whose ONLY any() reference is inside a bare "context" no-op guard rule (Cameroon diablock shape)', () => {
    const diablock: IRStore = {
      nodeId: "s#diablock",
      name: "diablock",
      items: [{ kind: "char", value: "°" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#guard",
      context: [
        { kind: "any", storeRef: "diablock" },
        { kind: "raw", text: "+" },
        { kind: "vkey", name: "K_C", modifiers: ["RALT"] },
      ],
      output: [{ kind: "raw", text: "context" }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [diablock]);

    expect(classifyStoreSlotEdit(diablock, ir)).toEqual({
      mode: "drop",
      coordinatedWith: [],
      matchTableOnly: true,
    });
  });

  it("does NOT flag a dkf/dkt-style paired input store — its any() reference has no `+` at all, so it is never flagged edit-only (do not over-flag)", () => {
    const ir = makeStartIr();
    const dkf = ir.stores.find((s) => s.name === "dkfX")!;
    const dkt = ir.stores.find((s) => s.name === "dktX")!;
    expect(classifyStoreSlotEdit(dkf, ir)).toEqual({ mode: "drop", coordinatedWith: ["dktX"] });
    expect(classifyStoreSlotEdit(dkt, ir)).toEqual({ mode: "drop", coordinatedWith: ["dkfX"] });
  });

  it("does NOT flag a store that is itself an index()/outs() output target, even if it also has an edit-only any() reference elsewhere", () => {
    const store: IRStore = {
      nodeId: "s#both",
      name: "bothStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const bkspRule: IRRule = {
      nodeId: "rule#bksp",
      context: [
        { kind: "any", storeRef: "bothStore" },
        { kind: "raw", text: "+" },
        { kind: "vkey", name: "K_BKSP", modifiers: [] },
      ],
      output: [{ kind: "raw", text: "context" }],
    };
    const emitRule: IRRule = {
      nodeId: "rule#emit",
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "outs", storeRef: "bothStore" }],
    };
    const group: IRGroup = {
      nodeId: "g#0",
      name: "main",
      usingKeys: true,
      rules: [bkspRule, emitRule],
      readonly: false,
    };
    const ir = makeTestIR([group], [store]);
    // Blocked, but for the PRE-EXISTING outs() reason, not matchTableOnly —
    // asIndexOutputTarget is true, so the flag never fires for this store.
    expect(classifyStoreSlotEdit(store, ir)).toEqual({
      mode: "blocked",
      reason: "outs-reference-unanalyzed",
    });
  });

  it("does NOT flag a store with a Backspace-triggered any() reference AND a genuine forward-typing any() reference elsewhere (mixed usage stays editable)", () => {
    const store: IRStore = {
      nodeId: "s#mixed",
      name: "mixedStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const bkspRule: IRRule = {
      nodeId: "rule#bksp",
      context: [
        { kind: "any", storeRef: "mixedStore" },
        { kind: "raw", text: "+" },
        { kind: "vkey", name: "K_BKSP", modifiers: [] },
      ],
      output: [{ kind: "raw", text: "context" }],
    };
    const typingRule: IRRule = {
      nodeId: "rule#typing",
      context: [
        { kind: "any", storeRef: "mixedStore" },
        { kind: "raw", text: "+" },
        { kind: "vkey", name: "K_X", modifiers: [] },
      ],
      output: [{ kind: "char", value: "y" }],
    };
    const group: IRGroup = {
      nodeId: "g#0",
      name: "main",
      usingKeys: true,
      rules: [bkspRule, typingRule],
      readonly: false,
    };
    const ir = makeTestIR([group], [store]);
    expect(classifyStoreSlotEdit(store, ir)).toEqual({ mode: "drop", coordinatedWith: [] });
  });

  it("carving a character that lives ONLY in a matchTableOnly store's input half still drops that row (regression: this used to be blocked and left dead weight behind)", () => {
    // Mirrors carveDependentCombos.test.ts's Cameroon-shaped fixture: `composed`
    // is matched only by a Backspace-unwrap rule, never produced by any rule.
    // applyStoreSlotRemovals must still be able to splice its slots when a
    // caller (e.g. the dependent-combo cascade) nominates them directly.
    const composed: IRStore = {
      nodeId: "s#composed",
      name: "composed",
      items: [
        { kind: "char", value: "ǽ" },
        { kind: "char", value: "ǣ" },
      ],
      isSystem: false,
    };
    const compDia: IRStore = {
      nodeId: "s#comp-dia",
      name: "comp-dia",
      items: [
        { kind: "char", value: "æ" },
        { kind: "char", value: "æ" },
      ],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#bksp",
      context: [
        { kind: "any", storeRef: "composed" },
        { kind: "raw", text: "+" },
        { kind: "vkey", name: "K_BKSP", modifiers: [] },
      ],
      output: [{ kind: "index", storeRef: "comp-dia", offset: 1 }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [composed, compDia]);

    const { ir: nextIr, warnings } = applyStoreSlotRemovals(ir, new Set(["s#composed#0"]));
    expect(warnings).toEqual([]);
    const nextComposed = nextIr.stores.find((s) => s.name === "composed")!;
    const nextCompDia = nextIr.stores.find((s) => s.name === "comp-dia")!;
    expect(nextComposed.items.map((i) => (i.kind === "char" ? i.value : i.kind))).toEqual(["ǣ"]);
    // Coordinated pair-set drop: comp-dia's item at the SAME index goes too.
    expect(nextCompDia.items.map((i) => (i.kind === "char" ? i.value : i.kind))).toEqual(["æ"]);
  });
});

// ---------------------------------------------------------------------------
// 7b. describeStorePairing — the single source of truth for "Linked pair"
// style display (studio Inspector), covering the four cases: none, self,
// cross, unresolved.
// ---------------------------------------------------------------------------

describe("describeStorePairing", () => {
  it("'none': an any()-source store never targeted by index() has no pairing relationship", () => {
    const store: IRStore = {
      nodeId: "s#any",
      name: "anyStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "any", storeRef: "anyStore" }],
      output: [{ kind: "char", value: "z" }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store]);
    expect(describeStorePairing(store, ir)).toEqual({ kind: "none" });
  });

  it("'none': an orphan store unreferenced by any rule has no pairing relationship", () => {
    const store: IRStore = {
      nodeId: "s#orphan",
      name: "orphanStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const ir = makeTestIR([], [store]);
    expect(describeStorePairing(store, ir)).toEqual({ kind: "none" });
  });

  it("'cross': a dkf/dkt-style CROSS pair names the OTHER store, not itself", () => {
    const ir = makeStartIr();
    const dkt = ir.stores.find((s) => s.name === "dktX")!;
    const dkf = ir.stores.find((s) => s.name === "dkfX")!;
    expect(describeStorePairing(dkt, ir)).toEqual({ kind: "cross", partners: ["dkfX"] });
    expect(describeStorePairing(dkf, ir)).toEqual({ kind: "cross", partners: ["dktX"] });
  });

  // Canonical failure case (Cameroon):
  //   platform('touch') any(word) any(final) + [K_SPACE] > index(word,2) index(final,3)
  // Two any() context sources, two index() output targets — but each index()
  // resolves back to the SAME store at its own offset, so this produces TWO
  // independent SELF-pairs, never a word<->final cross-pair. The old
  // detectStorePairs heuristic (cross-product every any() against every
  // index() in the rule) wrongly asserted word<->final; this is the
  // regression test for that shape.
  it("'self' x2: a 2-any()/2-index() rule with own-offset resolution produces two independent self-pairs, NOT a cross-pair", () => {
    const word: IRStore = {
      nodeId: "s#word",
      name: "word",
      items: [{ kind: "char", value: "a" }, { kind: "char", value: "b" }],
      isSystem: false,
    };
    const final: IRStore = {
      nodeId: "s#final",
      name: "final",
      items: [{ kind: "char", value: "." }, { kind: "char", value: "!" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [
        { kind: "raw", text: "platform('touch')" },
        { kind: "any", storeRef: "word" },
        { kind: "any", storeRef: "final" },
        { kind: "raw", text: "+" },
        { kind: "vkey", name: "K_SPACE", modifiers: [] },
      ],
      output: [
        { kind: "index", storeRef: "word", offset: 2 },
        { kind: "index", storeRef: "final", offset: 3 },
      ],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [word, final]);
    expect(describeStorePairing(word, ir)).toEqual({ kind: "self" });
    expect(describeStorePairing(final, ir)).toEqual({ kind: "self" });
  });

  it("'unresolved': a store targeted by index() whose pairing can't be resolved to an any() source", () => {
    const store: IRStore = {
      nodeId: "s#unresolved",
      name: "unresolvedStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "index", storeRef: "unresolvedStore", offset: 1 }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store]);
    expect(describeStorePairing(store, ir)).toEqual({ kind: "unresolved" });
  });

  it("'unresolved': a store referenced via outs() has no nameable partners (Amendment 4 fail-closed)", () => {
    const store: IRStore = {
      nodeId: "s#outs",
      name: "outsStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const rule: IRRule = {
      nodeId: "rule#0",
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "outs", storeRef: "outsStore" }],
    };
    const group: IRGroup = { nodeId: "g#0", name: "main", usingKeys: true, rules: [rule], readonly: false };
    const ir = makeTestIR([group], [store]);
    expect(describeStorePairing(store, ir)).toEqual({ kind: "unresolved" });
  });

  it("'unresolved' propagates across a cross-pair when a partner is outs()-referenced", () => {
    const storeA: IRStore = {
      nodeId: "s#a",
      name: "storeA",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    };
    const storeB: IRStore = {
      nodeId: "s#b",
      name: "storeB",
      items: [{ kind: "char", value: "b" }],
      isSystem: false,
    };
    const rulePair: IRRule = {
      nodeId: "rule#pair",
      context: [{ kind: "any", storeRef: "storeA" }],
      output: [{ kind: "index", storeRef: "storeB", offset: 1 }],
    };
    const ruleOuts: IRRule = {
      nodeId: "rule#outs",
      context: [{ kind: "vkey", name: "K_B", modifiers: [] }],
      output: [{ kind: "outs", storeRef: "storeB" }],
    };
    const group: IRGroup = {
      nodeId: "g#0",
      name: "main",
      usingKeys: true,
      rules: [rulePair, ruleOuts],
      readonly: false,
    };
    const ir = makeTestIR([group], [storeA, storeB]);
    // storeA is only in the graph via the resolved pairing with storeB — its
    // own set is {storeA, storeB} — so it inherits the "unresolved" verdict
    // from storeB's outs() reference.
    expect(describeStorePairing(storeA, ir)).toEqual({ kind: "unresolved" });
    expect(describeStorePairing(storeB, ir)).toEqual({ kind: "unresolved" });
  });
});
