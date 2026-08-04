/**
 * reachableProducedSet — the REACHABILITY-AWARE producibility view (spec 058
 * FR-008…FR-010).
 *
 * `buildProducedSet` answers "what do this keyboard's rules emit?". That is the
 * right question for most consumers and its semantics are FROZEN. It is the wrong
 * question for two of them, because it credits a rule keyed on an id that no key
 * anywhere carries — output nothing can actually type. `sil_cameroon_azerty` ships
 * exactly that defect: a `T_03B1` rule pair whose layout carries only `U_03B1`.
 *
 * This module answers the narrower question "what can a user actually reach?" and
 * — more importantly — hands back the DELTA between the two.
 *
 * ## Why this is a sibling function and not an option on buildProducedSet
 *
 * Three reasons, all load-bearing:
 *
 *   1. **The orphan list IS the deliverable.** An option that returned a narrowed
 *      `Set` would throw away the very thing the reporting surface needs.
 *   2. **An option on a heavily-called function invites a default flip.** A later
 *      contributor "tidying up" by making reachability the default would silently
 *      move the committed `docs/keyboard-facet-index.json` and the §18.6
 *      denominator.
 *   3. The facet-transform equality invariant must keep asserting on the exact
 *      function it names.
 *
 * ## Adopter list — NORMATIVE (contract §4.4). Repeated in producedSet.ts.
 *
 * | Consumer | View | Why |
 * |---|---|---|
 * | Layer C inventory-coverage check | **this one** | Already scope-guarded to a *scaffolded* IR with no opaque fragments — a keyboard WE generated, where an orphan `T_` rule can only be our own bug. Zero legacy-corpus fallout by construction. |
 * | The orphan-rule Layer C check | **this one** | It is the reporting surface. |
 * | Studio inventory diff | **neither — EXTEND** | Switching would move characters from "already produced" into "letters to add" for the ~205 corpus bases with orphan rules, silently increasing author workload and moving the §18.6 denominator. It gains a third `producedButUnreachable` array instead. |
 * | Facet-transform propose / verify | plain | "Did my transform change what the rules emit" is a rules-only question; reachability would make a no-regression assertion flaky whenever the layout is edited in the same session. |
 * | All `utilities/facet-index` classifiers | plain | Committed artifact + corpus-calibrated tests. |
 * | `producedGlyphs`, char-contributor attribution, character-discovery, mechanism gallery, character-map tinting, convenience-chars gate, carve nodes, desktop-modification derivation | plain | None asks a reachability question; several run before any touch layout exists. |
 *
 * ## Scope: "reachable" means LAYOUT-reachable, with two documented limits
 *
 * Both are deliberate omissions, not oversights, and both are candidates for a
 * later hint-level check:
 *
 *   (a) **No group reachability.** The BFS checks touch-layer reachability from
 *       `default` only. It does not check that the rule's own group is reachable
 *       via the `.kmn` `use()` chain from the entry group. A rule sitting in a
 *       group nothing ever `use()`s is layout-reachable yet never fires; this view
 *       cannot see that.
 *   (b) **No layer↔modifier cross-check.** A `T_X` carried only on `default`,
 *       whose sole binding requires `[SHIFT T_X]`, counts as reachable — the
 *       struck key existing on a reachable layer is all this predicate asks. It
 *       does not verify the layer's own modifier state would satisfy the rule's
 *       context. (The information needed to do so is present — a binding carries
 *       its `modifiers` — but the modifier vocabulary is canonicalized in engine,
 *       so a correct cross-check does not belong at this layer today.)
 *
 * Pure, browser-safe, no I/O.
 */

import type { KeyboardIR, IRStore, TouchKeyIR, TouchLayoutIR } from "../keyboard-ir.js";
import { buildProducedSet, collectFromElements } from "./producedSet.js";
import type { BuildProducedSetOptions } from "./producedSet.js";
import {
  buildTouchKeyRuleIndex,
  normalizeTouchKeyId,
} from "../touch-key-rule-join.js";
import type { TouchKeyRuleBinding, TouchKeyRuleIndex } from "../touch-key-rule-join.js";

export interface ReachableProducedSetResult {
  /** Produced by a rule whose struck key is actually reachable. */
  readonly reachable: Set<string>;
  /**
   * Produced ONLY by unreachable-key rules — the honest delta.
   *
   * A character produced by both a reachable and an unreachable rule is NOT here:
   * it is reachable, and reporting it would be a false alarm. This set is
   * therefore always disjoint from `reachable`.
   */
  readonly orphaned: Set<string>;
  /** Every binding whose struck key is unreachable, for the reporting surface. */
  readonly orphanBindings: readonly TouchKeyRuleBinding[];
}

/** Why a struck key was judged unreachable — the orphan check tells these apart. */
export type TouchKeyUnreachableReason =
  /** The id is on no key of any layer of any platform. */
  | "absent"
  /** Present, but only on a layer the `default` BFS never reaches. */
  | "unreachable-layer";

// ---------------------------------------------------------------------------
// Layer reachability
// ---------------------------------------------------------------------------

/** Recursively collect `nextlayer` targets from a key and its sub-keys. */
function collectKeyNextLayers(key: TouchKeyIR, out: Set<string>): void {
  if (key.nextlayer) out.add(key.nextlayer);
  for (const sub of key.sk ?? []) collectKeyNextLayers(sub, out);
  for (const sub of key.multitap ?? []) collectKeyNextLayers(sub, out);
  if (key.flick) {
    for (const sub of Object.values(key.flick)) {
      if (sub) collectKeyNextLayers(sub, out);
    }
  }
}

/** Recursively collect every key id a key and its sub-keys carry. */
function collectKeyIds(key: TouchKeyIR, out: Set<string>): void {
  if (key.id.length > 0) out.add(normalizeTouchKeyId(key.id));
  for (const sub of key.sk ?? []) collectKeyIds(sub, out);
  for (const sub of key.multitap ?? []) collectKeyIds(sub, out);
  if (key.flick) {
    for (const sub of Object.values(key.flick)) {
      if (sub) collectKeyIds(sub, out);
    }
  }
}

/**
 * The set of normalized key ids carried on a REACHABLE layer, and the set carried
 * anywhere at all — unioned across platforms.
 *
 * Reachability is per-platform (each platform declares its own independent layer
 * graph) and then unioned: a key reachable on phone is reachable, full stop, even
 * if the tablet layout omits it. Penalizing a rule because one platform's layout
 * is less complete than another's would be wrong.
 *
 * The BFS mirrors `computeTouchCoverage`'s, deliberately: the two must agree on
 * what "reachable layer" means or coverage and reachability would contradict each
 * other on the same file.
 */
export function collectReachableTouchKeyIds(layout: TouchLayoutIR): {
  reachableIds: ReadonlySet<string>;
  allIds: ReadonlySet<string>;
} {
  const reachableIds = new Set<string>();
  const allIds = new Set<string>();

  for (const platform of layout.platforms) {
    const layerById = new Map(platform.layers.map((layer) => [layer.id, layer] as const));

    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) collectKeyIds(key, allIds);
      }
    }

    // Reachable layers: `default` plus anything reachable via a nextlayer chain
    // from it. The reachable set doubles as the visited set, so a cycle
    // terminates.
    const reachableLayerIds = new Set<string>();
    const queue: string[] = [];
    if (layerById.has("default")) {
      reachableLayerIds.add("default");
      queue.push("default");
    }
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (currentId === undefined) continue;
      const layer = layerById.get(currentId);
      if (!layer) continue;
      const nextIds = new Set<string>();
      for (const row of layer.rows) {
        for (const key of row.keys) collectKeyNextLayers(key, nextIds);
      }
      for (const nextId of nextIds) {
        if (!reachableLayerIds.has(nextId) && layerById.has(nextId)) {
          reachableLayerIds.add(nextId);
          queue.push(nextId);
        }
      }
    }

    for (const layerId of reachableLayerIds) {
      const layer = layerById.get(layerId);
      if (!layer) continue;
      for (const row of layer.rows) {
        for (const key of row.keys) collectKeyIds(key, reachableIds);
      }
    }
  }

  return { reachableIds, allIds };
}

/**
 * Whether a struck key id is reachable, by id prefix.
 *
 * | Struck key | Reachable when |
 * |---|---|
 * | `K_` | **ALWAYS** — a physical key exists regardless of the touch layout |
 * | `T_` | Its normalized id is carried by a key on a reachable layer |
 * | `U_` | Same as `T_` (a `U_` id in a rule is layout-dependent) |
 *
 * The `K_` row is load-bearing: a desktop-only keyboard must never be penalized,
 * and a physical key's rule must never be called unreachable because the touch
 * layout omits it.
 */
export function isStruckKeyReachable(
  keyId: string,
  reachableIds: ReadonlySet<string>,
): boolean {
  const normalized = normalizeTouchKeyId(keyId);
  if (normalized.startsWith("K_")) return true;
  return reachableIds.has(normalized);
}

/** Classify WHY an unreachable key is unreachable, for the orphan check's message. */
export function classifyUnreachableReason(
  keyId: string,
  allIds: ReadonlySet<string>,
): TouchKeyUnreachableReason {
  return allIds.has(normalizeTouchKeyId(keyId)) ? "unreachable-layer" : "absent";
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

/**
 * Split what the keyboard's rules emit into what a user can reach and what only
 * an unreachable-key rule produces.
 *
 * **When the IR has no touch layout, everything is reachable** and `reachable`
 * equals `buildProducedSet(ir, options)` exactly, with `orphaned` empty. This is
 * not a convenience shortcut — it is the correct answer. A desktop-only keyboard
 * has no touch layout to be unreachable *in*, and any other behaviour would
 * report every rule in the file as orphaned.
 *
 * @param ir      - The parsed keyboard IR.
 * @param options - Passed through to `buildProducedSet` semantics unchanged.
 */
export function buildReachableProducedSet(
  ir: KeyboardIR,
  options?: BuildProducedSetOptions,
): ReachableProducedSetResult {
  const layout = ir.touchLayout;
  if (layout === undefined) {
    return {
      reachable: buildProducedSet(ir, options),
      orphaned: new Set<string>(),
      orphanBindings: [],
    };
  }

  const includeSpace = options?.includeSpace === true;
  const { reachableIds } = collectReachableTouchKeyIds(layout);
  const index = buildTouchKeyRuleIndex(ir, { ...(includeSpace ? { includeSpace } : {}) });

  const reachable = new Set<string>();
  const unreachableOnly = new Set<string>();
  const orphanBindings: TouchKeyRuleBinding[] = [];

  for (const [normalizedId, bindings] of index.byId) {
    const keyReachable = isStruckKeyReachable(normalizedId, reachableIds);
    for (const binding of bindings) {
      if (keyReachable) {
        for (const ch of binding.produced) reachable.add(ch);
      } else {
        orphanBindings.push(binding);
        for (const ch of binding.produced) unreachableOnly.add(ch);
      }
    }
  }

  // Rules the join does not index — no vkey in context, or a struck key outside
  // `T_`/`U_`/`K_` — are not layout-dependent, so they contribute to `reachable`
  // exactly as `buildProducedSet` would. Skipping them would make this view
  // under-credit every non-keystroke rule in the file (deadkey continuation
  // rules, context-only transformations), which is a far larger error than the
  // orphan it is trying to find.
  const storeMap = new Map<string, IRStore>(ir.stores.map((s) => [s.name, s]));
  const indexedRuleNodeIds = new Set<string>(
    [...index.byId.values()].flat().map((b) => b.ruleNodeId),
  );
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      if (indexedRuleNodeIds.has(rule.nodeId)) continue;
      if (options?.excludeBackspaceCorrections === true) {
        // Mirror buildProducedSet's own guard so the two agree on this rule class.
        const hasDirectBackspace = rule.context.some(
          (el) => el.kind === "vkey" && normalizeTouchKeyId(el.name) === "K_BKSP",
        );
        if (hasDirectBackspace) continue;
      }
      collectFromElements(rule.output, storeMap, reachable, includeSpace);
    }
  }

  // Opaque fragments contribute as they do to the plain view. An opaque fragment
  // has no recoverable struck key, so it cannot be attributed to an unreachable
  // one — and treating it as unreachable would report a keyboard's opaque content
  // as orphaned wholesale.
  for (const frag of ir.raw) {
    if (frag.producedOutput !== undefined) {
      collectFromElements(frag.producedOutput, storeMap, reachable, includeSpace);
    }
  }

  // `orphaned` is the DELTA only: a character also produced by something reachable
  // is not orphaned, and reporting it would be a false alarm.
  const orphaned = new Set<string>();
  for (const ch of unreachableOnly) {
    if (!reachable.has(ch)) orphaned.add(ch);
  }

  return { reachable, orphaned, orphanBindings };
}

/**
 * The orphan bindings alone, with each one's reason — the orphan check's input.
 *
 * Separate from {@link buildReachableProducedSet} because the check needs the
 * reason and the near-miss, while the coverage consumers need the sets; computing
 * both in one return type would give each caller a field it must ignore.
 */
export function collectTouchRuleOrphans(
  ir: KeyboardIR,
  index?: TouchKeyRuleIndex,
): readonly {
  readonly binding: TouchKeyRuleBinding;
  readonly reason: TouchKeyUnreachableReason;
}[] {
  const layout = ir.touchLayout;
  // No touch layout ⇒ nothing is layout-unreachable, so there are no orphans.
  // The orphan check must fire ONLY when a touch layout exists.
  if (layout === undefined) return [];

  const { reachableIds, allIds } = collectReachableTouchKeyIds(layout);
  const idx = index ?? buildTouchKeyRuleIndex(ir);
  const out: {
    readonly binding: TouchKeyRuleBinding;
    readonly reason: TouchKeyUnreachableReason;
  }[] = [];

  for (const [normalizedId, bindings] of idx.byId) {
    if (isStruckKeyReachable(normalizedId, reachableIds)) continue;
    const reason = classifyUnreachableReason(normalizedId, allIds);
    for (const binding of bindings) out.push({ binding, reason });
  }
  return out;
}
