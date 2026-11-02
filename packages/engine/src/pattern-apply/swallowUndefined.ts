// `swallowUndefined` (spec 109 FR-010..FR-014): the compiled keyboard suppresses
// every printable position it does not handle, in the classes the author set to
// "Do nothing".
//
// The output is behaviour-owned IR: ONE store of key positions and ONE rule,
// `+ any(store) > nul`. Never `nomatch > nul`, which would also swallow the
// frame keys. Frame keys are not in the enumerator's printable set, so they can
// never enter the store.
//
// The function is pure and returns a fresh IR; callers route that IR through
// the studio's `mutate()` write seam (a groups/stores patch), exactly as the
// carve pipeline's output is routed. A previous run's output is removed before
// the store is recomputed, so a binding added or removed always yields the
// right store, and a second run changes nothing.
//
// Covered layers are the ones the IR binds at least one key on (the
// enumerator's `layerBound`). Positions a behaviour-owned rule already binds —
// including carve suppression's own rules — are skipped, so nothing is emitted
// twice.

import type {
  FallbackPolicy,
  IRGroup,
  IRRule,
  IRStore,
  KeyboardIR,
  StoreItem,
} from "@keyboard-studio/contracts";
import { anyClassSwallows, outcomesByPosition, positionId, type Leak } from "./fallbackPolicy.js";
import { insertBeforeTerminalRules } from "./ir-insert.js";
import { isPositionInSwallowSet } from "./swallowSet.js";
import { enumerateUnhandledPositions, type UnhandledPosition } from "./unhandledPositions.js";

/** The `ownedByBehaviour` marker on the store and rule this stage writes. */
export const SWALLOW_UNDEFINED_OWNER = "swallow-undefined";

const STORE_NODE_ID = "gen-swallow-undefined-store";
const RULE_NODE_ID = "gen-swallow-undefined-rule";
const STORE_NAME = "swallowUndefined";

export interface SwallowUndefinedInput {
  policy: FallbackPolicy;
  /** Leaks joined by the caller from the picked base keyboards' data. */
  leaks: readonly Leak[];
}

function isOwnStore(s: IRStore): boolean {
  return s.ownedByBehaviour === SWALLOW_UNDEFINED_OWNER;
}

function isOwnRule(r: IRRule): boolean {
  return r.ownedByBehaviour === SWALLOW_UNDEFINED_OWNER;
}

/** A copy of `ir` without a previous run's store and rule, or `ir` itself when there are none. */
function withoutPreviousRun(ir: KeyboardIR): KeyboardIR {
  const hasStore = ir.stores.some(isOwnStore);
  const hasRule = ir.groups.some((g) => g.rules.some(isOwnRule));
  if (!hasStore && !hasRule) return ir;
  return {
    ...ir,
    stores: ir.stores.filter((s) => !isOwnStore(s)),
    groups: ir.groups.map((g) =>
      g.rules.some(isOwnRule) ? { ...g, rules: g.rules.filter((r) => !isOwnRule(r)) } : g,
    ),
  };
}

/** The group the rule lands in: the `begin` entry group, else the first keyed group. */
function entryGroupIndex(ir: KeyboardIR): number {
  const main = ir.header.entryPoints?.main;
  if (main !== undefined) {
    const named = ir.groups.findIndex((g) => g.name === main && !g.readonly);
    if (named >= 0) return named;
  }
  return ir.groups.findIndex((g) => !g.readonly && g.usingKeys);
}

function storeItemFor(p: UnhandledPosition): StoreItem {
  return p.modifiers === ""
    ? { kind: "vkey", name: p.key }
    : { kind: "raw", text: `[${p.modifiers} ${p.key}]` };
}

function uniqueStoreName(ir: KeyboardIR): string {
  const taken = new Set(ir.stores.map((s) => s.name.toLowerCase()));
  let name = STORE_NAME;
  for (let i = 2; taken.has(name.toLowerCase()); i += 1) name = `${STORE_NAME}${i}`;
  return name;
}

/** Characters a single `store()` line may carry; kmcmplib rejects a longer line. */
const STORE_LINE_BUDGET = 6000;

const itemLength = (item: StoreItem): number =>
  (item.kind === "vkey" ? item.name.length + 2 : item.kind === "raw" ? item.text.length : 0) + 1;

/**
 * The store, and any part stores it is built from. Almost always one store.
 * A keyboard that binds many layers has more positions than one source line can
 * carry, so the list is split into part stores that the one store pulls in with
 * `outs()`; the rule still reads a single store.
 */
function buildStores(
  name: string,
  items: StoreItem[],
  ir: KeyboardIR,
): { store: IRStore; parts: IRStore[] } {
  const base = { isSystem: false, ownedByBehaviour: SWALLOW_UNDEFINED_OWNER };
  const total = items.reduce((n, item) => n + itemLength(item), 0);
  if (total <= STORE_LINE_BUDGET) {
    return { store: { nodeId: STORE_NODE_ID, name, items, ...base }, parts: [] };
  }
  const taken = new Set(ir.stores.map((s) => s.name.toLowerCase()));
  taken.add(name.toLowerCase());
  const chunks: StoreItem[][] = [];
  let current: StoreItem[] = [];
  let length = 0;
  for (const item of items) {
    if (length + itemLength(item) > STORE_LINE_BUDGET && current.length > 0) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    current.push(item);
    length += itemLength(item);
  }
  if (current.length > 0) chunks.push(current);
  const parts = chunks.map((chunk, i): IRStore => {
    let partName = `${name}Part${i + 1}`;
    for (let n = 2; taken.has(partName.toLowerCase()); n += 1) partName = `${name}Part${i + 1}x${n}`;
    taken.add(partName.toLowerCase());
    return { nodeId: `${STORE_NODE_ID}-part${i + 1}`, name: partName, items: chunk, ...base };
  });
  const store: IRStore = {
    nodeId: STORE_NODE_ID,
    name,
    items: parts.map((p): StoreItem => ({ kind: "raw", text: `outs(${p.name})` })),
    ...base,
  };
  return { store, parts };
}

/**
 * The positions the store holds: unhandled, on a layer the IR binds, in a class
 * set to "Do nothing" on some picked base keyboard, and not already bound by a
 * behaviour-owned rule. Order is the enumerator's (layer, then keyboard order).
 */
export function swallowedPositions(
  ir: KeyboardIR,
  input: SwallowUndefinedInput,
): UnhandledPosition[] {
  const byPosition = outcomesByPosition(input.leaks);
  return enumerateUnhandledPositions(ir).filter(
    (p) =>
      p.layerBound &&
      isPositionInSwallowSet(
        p,
        input.policy,
        byPosition.get(positionId(p.key, p.modifiers)) ?? [],
        ir,
      ),
  );
}

/**
 * Add the swallow store and rule to `ir`, or return the IR without them when
 * nothing needs swallowing (every class passes through, no covered position
 * qualifies, or the keyboard has no keyed entry group). `ir` is never mutated.
 */
export function applySwallowUndefined(
  ir: KeyboardIR,
  input: SwallowUndefinedInput,
): KeyboardIR {
  const clean = withoutPreviousRun(ir);
  if (!anyClassSwallows(input.policy)) return clean;

  const groupIndex = entryGroupIndex(clean);
  if (groupIndex < 0) return clean;
  const positions = swallowedPositions(clean, input);
  if (positions.length === 0) return clean;

  const name = uniqueStoreName(clean);
  const { store, parts } = buildStores(name, positions.map(storeItemFor), clean);
  const rule: IRRule = {
    nodeId: RULE_NODE_ID,
    context: [{ kind: "raw", text: "+" }, { kind: "any", storeRef: name }],
    output: [{ kind: "nul" }],
    ownedByBehaviour: SWALLOW_UNDEFINED_OWNER,
  };

  const groups: IRGroup[] = clean.groups.map((g, i) =>
    i === groupIndex ? { ...g, rules: insertBeforeTerminalRules(g.rules, rule) } : g,
  );
  return { ...clean, stores: [...clean.stores, ...parts, store], groups };
}
