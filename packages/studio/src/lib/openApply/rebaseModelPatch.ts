// rebaseModelPatch -- rebuild a queued `model` change from the CURRENT file
// parse instead of the parse it was composed against (spec 111, issue #2666).
//
// The patch sink hands a change that needs the author's agreement to
// OpenApplyHost with a `build()` that re-runs when the author agrees. It used
// to compare the whole declared-write subtree (`groups` as one JSON blob) and
// reject the change when anything under it had changed meanwhile — so an edit
// to an unrelated rule in the same group rejected a waiting change. It also
// rebuilt by merging the patch's whole arrays over the current parse, which
// would have reverted such an edit even had the gate passed.
//
// This module re-bases the patch at node granularity: the patch's effect is
// the node-level diff between the base parse and the queued result (a rule
// added, removed, or changed; same for a store, a raw fragment, or a group).
// A queued change still applies only while every node it changes still
// holds, in the current parse, the content it held in the base parse — its
// own rules or stores changed meanwhile still reject it, and the caller rolls
// the decision back. A node it does not change is taken from the current
// parse untouched, so an unrelated intervening change lands beside it.
//
// Nodes are matched across parses by nodeId first (the splice's own key) and
// by content when an insertion ahead re-minted the positional ids; an
// ambiguous match fails closed (null). The one case this cannot tell apart is
// a meanwhile edit to a node combined with a meanwhile addition of a second
// node with exactly the same content as the edited node's old content — the
// patch's edit then lands on the added twin. Identical-text twins in one
// group are vanishingly rare, and the file still holds the patch's change
// once, in the right group.
//
// Fail-closed by construction: anything this module cannot express (a written
// subtree that is not a node array, a node without an id, a duplicate id, an
// ambiguous match) falls back to comparing the whole subtree, and any doubt
// returns null — the caller treats it as "no longer applies".

import type { IRGroup, IRPath, IRRule, IRStore, KeyboardIR, RawKmnFragment } from "@keyboard-studio/contracts";
import { getIn, prefixOf, setIn } from "./scopeToWrites.ts";

/** Deterministic JSON: object keys sorted, `undefined` dropped like JSON.stringify. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

// Placement (`nodeId`, `sourceLine`, `consumedSourceLines` — the file's
// lines, not the node's meaning) and provenance markers the parser or a step
// sets (`ownedByPattern`, `ownedByBehaviour`, `rulesStepAdded` — session
// state, not file content) are not part of a node's content.
const PLACEMENT_KEYS = new Set(["nodeId", "sourceLine", "consumedSourceLines"]);
const MARKER_KEYS = new Set(["ownedByPattern", "ownedByBehaviour", "rulesStepAdded"]);

/** A node's file content: everything the splice writes, minus placement and markers. */
function nodeContent(node: Record<string, unknown>): string {
  const stripped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (PLACEMENT_KEYS.has(k) || MARKER_KEYS.has(k)) continue;
    stripped[k] = v;
  }
  return canonical(stripped);
}

const ruleContent = (r: IRRule): string => nodeContent(r as unknown as Record<string, unknown>);
const storeContent = (s: IRStore): string => nodeContent(s as unknown as Record<string, unknown>);
const rawContent = (f: RawKmnFragment): string => nodeContent(f as unknown as Record<string, unknown>);
/** A group's own content: its rules are rebased separately, never as one blob. */
const groupContent = (g: IRGroup): string => canonical({ name: g.name, usingKeys: g.usingKeys, readonly: g.readonly });

/** Keyman compares store names with an ASCII-only fold (see openApply/assign.ts). */
const foldStoreName = (name: string): string => name.replace(/[A-Z]/g, (c) => c.toLowerCase());

type PlacedNode = { nodeId: string; sourceLine?: number; consumedSourceLines?: number[] };

/** Stamp the current node's placement onto the patch's version of it, so the rebuilt IR shares the current parse's ids and the splice diffs against the file it will write. */
function stampPlacement<T extends PlacedNode>(after: T, currentNode: PlacedNode): T {
  const out = { ...after, nodeId: currentNode.nodeId };
  if (currentNode.sourceLine !== undefined) out.sourceLine = currentNode.sourceLine;
  else delete out.sourceLine;
  if (currentNode.consumedSourceLines !== undefined) out.consumedSourceLines = currentNode.consumedSourceLines;
  else delete out.consumedSourceLines;
  return out;
}

/** A fresh positional id above every id of this kind the current parse holds. */
function freshId(kind: string, taken: ReadonlySet<string>): string {
  let max = -1;
  for (const id of taken) {
    const m = new RegExp(`^${kind}#(\\d+)$`).exec(id);
    if (m !== null) max = Math.max(max, Number(m[1]));
  }
  return `${kind}#${max + 1}`;
}

interface NodeOps<T extends PlacedNode> {
  kind: string;
  /** The node's file content. */
  contentOf: (node: T) => string;
  /** Cross-parse fallback key: identifies the node when its id moved. Must be unique within an array to pin a node. */
  keyOf: (node: T) => string;
  /**
   * A name the array must hold at most once (a store name): adding a node
   * whose name a different-content node already holds would emit a duplicate
   * definition, so the rebase fails closed. Undefined when the kind has no
   * such name (rules, raw fragments).
   */
  uniqueNameOf?: (node: T) => string;
}

/**
 * Re-base one node array (rules, stores, raw fragments): apply the patch's
 * node changes (base -> next) onto the current array. Returns null when a
 * node the patch changes was itself changed meanwhile.
 */
function rebaseNodeArray<T extends PlacedNode>(
  base: readonly T[],
  next: readonly T[],
  current: readonly T[],
  ops: NodeOps<T>,
): T[] | null {
  if ([...base, ...next, ...current].some((n) => typeof n.nodeId !== "string" || n.nodeId === "")) return null;
  const baseById = new Map(base.map((n) => [n.nodeId, n]));
  const nextById = new Map(next.map((n) => [n.nodeId, n]));
  if (baseById.size !== base.length || nextById.size !== next.length) return null; // duplicate ids: ambiguous
  const baseKeyCounts = new Map<string, number>();
  for (const n of base) baseKeyCounts.set(ops.keyOf(n), (baseKeyCounts.get(ops.keyOf(n)) ?? 0) + 1);

  // Work on a shallow copy of the CURRENT array: untouched nodes keep the
  // current parse's ids, so the splice diffs against the file it will write.
  const work: T[] = [...current];
  const taken = new Set(work.map((n) => n.nodeId));

  /** The current node holding the base node's content, or undefined when it was touched meanwhile. */
  const findCurrent = (baseNode: T): T | undefined => {
    const byId = work.find((n) => n.nodeId === baseNode.nodeId);
    if (byId !== undefined && ops.contentOf(byId) === ops.contentOf(baseNode)) return byId;
    // An insertion ahead re-minted the positional id: match by the fallback
    // key, only when it pins one node on each side.
    const key = ops.keyOf(baseNode);
    if ((baseKeyCounts.get(key) ?? 0) !== 1) return undefined;
    const keyed = work.filter((n) => ops.keyOf(n) === key);
    const only = keyed.length === 1 ? keyed[0] : undefined;
    if (only !== undefined && ops.contentOf(only) === ops.contentOf(baseNode)) return only;
    return undefined;
  };

  // Removes and modifies first: they pin the nodes they touch.
  for (const b of base) {
    const n = nextById.get(b.nodeId);
    if (n === undefined) {
      const cur = findCurrent(b);
      if (cur === undefined) return null;
      work.splice(work.indexOf(cur), 1);
      taken.delete(cur.nodeId);
    } else if (ops.contentOf(n) !== ops.contentOf(b)) {
      const cur = findCurrent(b);
      if (cur === undefined) return null;
      work[work.indexOf(cur)] = stampPlacement(structuredClone(n), cur);
    }
  }

  // Adds, in next order. Each lands after its predecessor in next that the
  // base already had (or after the previously added node), so the rebuilt
  // order is the patch's order.
  const placed = new Map<string, T>();
  for (const a of next) {
    if (baseById.has(a.nodeId)) continue;
    const existing = work.find((n) => n.nodeId === a.nodeId);
    if (existing !== undefined && ops.contentOf(existing) === ops.contentOf(a)) continue; // meanwhile added the same node: already there
    if (ops.uniqueNameOf !== undefined) {
      const sameName = work.find((n) => ops.uniqueNameOf!(n) === ops.uniqueNameOf!(a));
      if (sameName !== undefined) {
        if (ops.contentOf(sameName) === ops.contentOf(a)) continue; // the same node under another id: already there
        return null; // a different node already holds this name: a duplicate definition would break compilation
      }
    }
    let anchor: T | undefined;
    const idxInNext = next.indexOf(a);
    for (let i = idxInNext - 1; i >= 0; i--) {
      const prev = next[i]!;
      if (baseById.has(prev.nodeId)) {
        anchor =
          work.find((n) => n.nodeId === prev.nodeId) ?? findCurrent(baseById.get(prev.nodeId)!);
        if (anchor !== undefined) break;
        continue;
      }
      const placedPrev = placed.get(prev.nodeId) ?? work.find((n) => n.nodeId === prev.nodeId);
      if (placedPrev !== undefined) {
        anchor = placedPrev;
        break;
      }
    }
    const fresh = structuredClone(a);
    // An added node has no source position yet.
    delete fresh.sourceLine;
    delete fresh.consumedSourceLines;
    if (existing !== undefined) fresh.nodeId = freshId(ops.kind, taken);
    taken.add(fresh.nodeId);
    work.splice(anchor === undefined ? 0 : work.indexOf(anchor) + 1, 0, fresh);
    placed.set(a.nodeId, fresh);
  }
  return work;
}

const ruleOps: NodeOps<IRRule> = {
  kind: "rule",
  contentOf: ruleContent,
  keyOf: ruleContent,
};

const storeOps: NodeOps<IRStore> = {
  kind: "store",
  contentOf: storeContent,
  keyOf: (s) => foldStoreName(s.name),
  uniqueNameOf: (s) => foldStoreName(s.name),
};

const rawOps: NodeOps<RawKmnFragment> = {
  kind: "raw",
  contentOf: rawContent,
  keyOf: (f) => f.sourceText,
};

/**
 * Re-base the groups array. A group is matched by nodeId, then by name; its
 * rules are rebased node by node (never as one blob), and its own props
 * (name, usingKeys) are taken from the patch only while the current group
 * still holds the base props.
 */
function rebaseGroups(base: readonly IRGroup[], next: readonly IRGroup[], current: readonly IRGroup[]): IRGroup[] | null {
  if ([...base, ...next, ...current].some((g) => typeof g.nodeId !== "string" || g.nodeId === "")) return null;
  const baseById = new Map(base.map((g) => [g.nodeId, g]));
  const nextById = new Map(next.map((g) => [g.nodeId, g]));
  if (baseById.size !== base.length || nextById.size !== next.length) return null;
  const baseNameCounts = new Map<string, number>();
  for (const g of base) baseNameCounts.set(g.name, (baseNameCounts.get(g.name) ?? 0) + 1);

  const work: IRGroup[] = [...current];
  const taken = new Set(work.map((g) => g.nodeId));

  const findCurrentGroup = (baseGroup: IRGroup): IRGroup | undefined => {
    const byId = work.find((g) => g.nodeId === baseGroup.nodeId);
    if (byId !== undefined && groupContent(byId) === groupContent(baseGroup)) return byId;
    if ((baseNameCounts.get(baseGroup.name) ?? 0) !== 1) return undefined;
    const named = work.filter((g) => g.name === baseGroup.name);
    const only = named.length === 1 ? named[0] : undefined;
    if (only !== undefined && groupContent(only) === groupContent(baseGroup)) return only;
    return undefined;
  };

  for (const b of base) {
    const n = nextById.get(b.nodeId);
    if (n === undefined) {
      // The patch removes the group: it must still hold the base rules, or a meanwhile edit to one of them would be lost.
      const cur = findCurrentGroup(b);
      if (cur === undefined) return null;
      if (canonical(cur.rules.map(ruleContent)) !== canonical(b.rules.map(ruleContent))) return null;
      work.splice(work.indexOf(cur), 1);
      taken.delete(cur.nodeId);
    } else {
      const cur = findCurrentGroup(b);
      if (cur === undefined) return null;
      const rebasedRules = rebaseNodeArray(b.rules, n.rules, cur.rules, ruleOps);
      if (rebasedRules === null) return null;
      if (
        (n.name !== b.name || n.usingKeys !== b.usingKeys || n.readonly !== b.readonly) &&
        (cur.name !== b.name || cur.usingKeys !== b.usingKeys || cur.readonly !== b.readonly)
      ) {
        return null;
      }
      const replacement = stampPlacement(structuredClone(n), cur);
      replacement.rules = rebasedRules;
      work[work.indexOf(cur)] = replacement;
    }
  }

  const placed = new Map<string, IRGroup>();
  for (const a of next) {
    if (baseById.has(a.nodeId)) continue;
    const existing = work.find((g) => g.nodeId === a.nodeId);
    // A group with this name already in the file can only take the patch's
    // group when its rules are already there; a same-named group with
    // different rules is a collision the rebase cannot place safely.
    const sameName = work.find((g) => g.name === a.name);
    if (sameName !== undefined) {
      const have = new Map<string, number>();
      for (const r of sameName.rules) have.set(ruleContent(r), (have.get(ruleContent(r)) ?? 0) + 1);
      let missing = false;
      for (const r of a.rules) {
        const c = ruleContent(r);
        const n = have.get(c) ?? 0;
        if (n === 0) {
          missing = true;
          break;
        }
        have.set(c, n - 1);
      }
      if (missing) return null;
      continue;
    }
    let anchor: IRGroup | undefined;
    const idxInNext = next.indexOf(a);
    for (let i = idxInNext - 1; i >= 0; i--) {
      const prev = next[i]!;
      if (baseById.has(prev.nodeId)) {
        anchor =
          work.find((g) => g.nodeId === prev.nodeId) ?? findCurrentGroup(baseById.get(prev.nodeId)!);
        if (anchor !== undefined) break;
        continue;
      }
      const placedPrev = placed.get(prev.nodeId) ?? work.find((g) => g.nodeId === prev.nodeId);
      if (placedPrev !== undefined) {
        anchor = placedPrev;
        break;
      }
    }
    const fresh = structuredClone(a);
    delete fresh.sourceLine;
    for (const r of fresh.rules) {
      delete (r as { sourceLine?: number }).sourceLine;
      delete (r as { consumedSourceLines?: number[] }).consumedSourceLines;
    }
    if (existing !== undefined) fresh.nodeId = freshId("group", taken);
    taken.add(fresh.nodeId);
    work.splice(anchor === undefined ? 0 : work.indexOf(anchor) + 1, 0, fresh);
    placed.set(a.nodeId, fresh);
  }
  return work;
}

/**
 * Rebuild the queued change (`next`, composed against `base`) from the
 * current parse. Returns null when a node the patch changes was itself
 * changed meanwhile — the change no longer applies.
 */
export function rebaseModelPatch(
  base: KeyboardIR,
  next: KeyboardIR,
  current: KeyboardIR,
  writes: readonly IRPath[],
): KeyboardIR | null {
  let out = structuredClone(current);
  const seen = new Set<string>();
  for (const w of writes) {
    const prefix = prefixOf(w);
    if (prefix.length === 0) continue;
    const key = prefix.join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    const top = prefix[0]!;
    const baseVal = getIn(base, prefix);
    const nextVal = getIn(next, prefix);
    const curVal = getIn(out, prefix);
    if (canonical(baseVal) === canonical(nextVal)) continue; // the patch does not change this subtree
    let rebased: unknown;
    if (top === "groups" && prefix.length === 1) {
      rebased = rebaseGroups(
        baseVal as readonly IRGroup[],
        nextVal as readonly IRGroup[],
        curVal as readonly IRGroup[],
      );
    } else if (top === "stores" && prefix.length === 1) {
      rebased = rebaseNodeArray(
        baseVal as readonly IRStore[],
        nextVal as readonly IRStore[],
        curVal as readonly IRStore[],
        storeOps,
      );
    } else if (top === "raw" && prefix.length === 1) {
      rebased = rebaseNodeArray(
        baseVal as readonly RawKmnFragment[],
        nextVal as readonly RawKmnFragment[],
        curVal as readonly RawKmnFragment[],
        rawOps,
      );
    } else {
      // Any other written subtree is one node: it still applies only while
      // the current value is the value the patch was composed against.
      if (canonical(curVal) !== canonical(baseVal)) return null;
      rebased = structuredClone(nextVal);
    }
    if (rebased === null) return null;
    out = setIn(out as unknown as Record<string, unknown>, prefix, rebased) as unknown as KeyboardIR;
  }
  return out;
}
