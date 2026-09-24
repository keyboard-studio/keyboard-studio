// Shared fixture builders for the scaffolder/scaffoldTouchLayout.*.test.ts
// topic files. Pure data/inspection helpers only: no vitest import, so this
// module compiles under the package tsconfig like every other __fixtures__ file.
// Call sites own the assertions (e.g. `expect(findDanglingNextlayers(r)).toEqual([])`).

import type {
  KeyboardIR,
  IRGroup,
  IRRule,
  TouchLayoutIR,
  Pattern,
} from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fixture builder helpers
// ---------------------------------------------------------------------------

let _nodeSeq = 0;
export function freshId(prefix: string): string {
  return `${prefix}:${++_nodeSeq}`;
}

/** Build a minimal KeyboardIR with no groups and no touchLayout. */
export function makeMinimalIR(overrides: Partial<KeyboardIR> = {}): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "test_kb",
      name: "Test KB",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
    ...overrides,
  };
}

/** Build a simple IRRule for a single vkey with given modifiers and a char output. */
export function makeCharRule(
  vkey: string,
  modifiers: string[],
  output: string,
): IRRule {
  return {
    nodeId: freshId("rule"),
    context: [{ kind: "vkey", name: vkey, modifiers }],
    output: [{ kind: "char", value: output }],
  };
}

/** Build a single non-readonly IRGroup containing the given rules. */
export function makeGroup(rules: IRRule[]): IRGroup {
  return {
    nodeId: freshId("group"),
    name: "main",
    usingKeys: true,
    rules,
    readonly: false,
  };
}

/** Build a minimal Pattern with strategyId starting with "S-02". */
export function makeS02Pattern(
  vkey: string,
  successorChar: string,
  nodeId: string,
): Pattern {
  // ownedNodes path: rule has deadkey context + char output, vkey in context.
  const ruleNodeId = nodeId;
  return {
    id: "test_s02_pattern",
    title: "Test deadkey",
    description: "Test deadkey pattern",
    category: "desktop",
    appliesTo: [],
    strategyId: "S-02",
    origin: "recognized",
    ownedNodes: [{ nodeId: ruleNodeId, kind: "rule" }],
    questions: [],
    kmnFragment: `+ [K_ACUTE] > deadkey(dk1)\n+ [dk1 ${vkey}] > '${successorChar}'`,
    tests: [],
    validatedForFamilies: [],
    sourceKeyboards: [],
    reviewedBy: "test",
    reviewDate: "2026-06-18",
  };
}

// ---------------------------------------------------------------------------
// Helper: get the phone platform + named layer
// ---------------------------------------------------------------------------

export function getLayer(result: TouchLayoutIR, layerId: string, platformId = "phone") {
  const platform = result.platforms.find((p) => p.id === platformId)!;
  return platform.layers.find((l) => l.id === layerId);
}

/**
 * Reusable graph-stranding regression lock (see the hasRightAlt=false /
 * hasRightAltShift=true bug class): collects every layer id actually emitted on
 * the given platform, walks every key on every layer, and returns one
 * descriptive string per violation of
 *   (1) no key's `nextlayer` points to a layer id that isn't emitted, and
 *   (2) every emitted layer reaches "default" within a bounded number of
 *       hops (a BFS over the nextlayer edges, bounded by the layer count so
 *       it can't loop forever on a cycle).
 * An empty array means the graph is sound; call sites assert
 * `expect(findDanglingNextlayers(result)).toEqual([])` so a failure diff lists
 * every offending key/layer. Locks the INVARIANT stated in
 * scaffoldTouchLayout.ts's buildRightAltToggleKey doc comment, not just the one
 * instance the bug report described.
 */
export function findDanglingNextlayers(result: TouchLayoutIR, platformId = "phone"): string[] {
  const problems: string[] = [];
  const platform = result.platforms.find((p) => p.id === platformId);
  if (platform === undefined) {
    return [`platform "${platformId}" is not emitted`];
  }
  const emittedLayerIds = new Set(platform.layers.map((l) => l.id));

  const edges = new Map<string, Set<string>>();
  for (const id of emittedLayerIds) edges.set(id, new Set());

  for (const layer of platform.layers) {
    for (const row of layer.rows) {
      for (const key of row.keys) {
        if (key.nextlayer === undefined) continue;
        if (!emittedLayerIds.has(key.nextlayer)) {
          problems.push(
            `key "${key.id}" on layer "${layer.id}" has nextlayer:"${key.nextlayer}" which is ` +
              `not an emitted layer (emitted: ${[...emittedLayerIds].join(", ")})`,
          );
        }
        edges.get(layer.id)!.add(key.nextlayer);
      }
    }
  }

  for (const start of emittedLayerIds) {
    if (start === "default") continue;
    let frontier = new Set<string>([start]);
    const seen = new Set<string>([start]);
    let reachedDefault = false;
    for (let hop = 0; hop < emittedLayerIds.size && !reachedDefault; hop++) {
      const next = new Set<string>();
      for (const layerId of frontier) {
        for (const target of edges.get(layerId) ?? []) {
          if (target === "default") {
            reachedDefault = true;
            break;
          }
          if (!seen.has(target)) {
            seen.add(target);
            next.add(target);
          }
        }
        if (reachedDefault) break;
      }
      frontier = next;
    }
    if (!reachedDefault) {
      problems.push(`layer "${start}" cannot reach "default" within ${emittedLayerIds.size} hops`);
    }
  }

  return problems;
}
