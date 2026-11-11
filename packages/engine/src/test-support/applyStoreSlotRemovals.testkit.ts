// Shared fixtures for the applyStoreSlotRemovals.*.test.ts files.
import { makeRule } from "@keyboard-studio/contracts";
import { charStore, irGroup, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR, IRStore, IRGroup, IRRule, StoreItem } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Output store with a mix of char, nul items. */
export function makeOutputStore(nodeId: string, name: string, items: StoreItem[]): IRStore {
  return charStore({ nodeId, name, items });
}

/** Input store (char-only items). */
export function makeInputStore(nodeId: string, name: string, chars: string[]): IRStore {
  return charStore({ nodeId, name, chars });
}

/**
 * A group containing a parallel-store deadkey rule:
 *   dk(id) any(inputStoreName) > index(outputStoreName, 2)
 * This is a CROSS-pair: the rule's context is [deadkey, any(inputStoreName)],
 * so offset 2 resolves to any(inputStoreName) — pairing inputStoreName with
 * outputStoreName.
 */
export function makeParallelStoreGroup(
  groupNodeId: string,
  ruleNodeId: string,
  dkId: number,
  inputStoreName: string,
  outputStoreName: string,
): IRGroup {
  // No `+`: this fixture deliberately spells the cross-pair context without a
  // keystroke boundary, so both elements are pre-context.
  const rule: IRRule = makeRule(
    {
      nodeId: ruleNodeId,
      preContext: [
        { kind: "deadkey", id: dkId },
        { kind: "any", storeRef: inputStoreName },
      ],
      output: [{ kind: "index", storeRef: outputStoreName, offset: 2 }],
    },
    { usingKeys: true },
  );
  return irGroup({ nodeId: groupNodeId, rules: [rule] });
}

/**
 * Minimal CROSS-paired IR: one output store dktX, one input store dkfX,
 * and a rule: dk(0x003b) any(dkfX) > index(dktX, 2).
 *
 * Output store items: ['À', 'ε', raw(nul), raw(nul)] — a char before AND
 * after non-char items, so index-vs-position tests are non-vacuous.
 */
export function makeStartIr(
  outputStoreNodeId = "store#dkt",
  inputStoreNodeId = "store#dkf",
): KeyboardIR {
  const outputItems: StoreItem[] = [
    { kind: "char", value: "À" }, // index 0
    { kind: "char", value: "ε" }, // index 1
    { kind: "raw", text: "nul" }, // index 2 (pre-existing trailing padding)
    { kind: "raw", text: "nul" }, // index 3 (pre-existing trailing padding)
  ];
  const outputStore = makeOutputStore(outputStoreNodeId, "dktX", outputItems);
  const inputStore = makeInputStore(inputStoreNodeId, "dkfX", ["a", "b", "c", "d"]);
  const group = makeParallelStoreGroup("group#main", "rule#0", 0x003b, "dkfX", "dktX");
  return makeTestIR([group], [outputStore, inputStore]);
}

/**
 * A SELF-paired IR (Cameroon's `word` shape): one store used as BOTH the
 * any() context source AND the index() output target of the SAME rule, at
 * the position its own any() occupies — so it pairs with itself, and a
 * coordinated drop only ever touches the one store.
 */
export function makeSelfPairedIr(storeNodeId = "store#word"): KeyboardIR {
  const items: StoreItem[] = [
    { kind: "char", value: "a" },
    { kind: "char", value: "ɛ" },
    { kind: "char", value: "b" },
    { kind: "char", value: "Ɛ" },
    { kind: "char", value: "z" },
  ];
  const store = makeOutputStore(storeNodeId, "word", items);
  const rule: IRRule = makeRule(
    {
      nodeId: "rule#self",
      preContext: [{ kind: "any", storeRef: "word" }],
      output: [{ kind: "index", storeRef: "word", offset: 1 }],
    },
    { usingKeys: true },
  );
  const group: IRGroup = { nodeId: "group#main", name: "main", usingKeys: true, rules: [rule], readonly: false };
  return makeTestIR([group], [store]);
}


export const NUL: StoreItem = { kind: "raw", text: "nul" };
