/**
 * carveTouchProducers — the spec 104 carve operation (contracts §4,
 * FR-019/FR-020): remove ONE character from a keyboard's touch surface in
 * a single operation that does BOTH halves:
 *
 *   1. neutralise every producing occurrence of the character — all
 *      platforms, all layers, main keys and sub-keys — to `T_BLANK` /
 *      sp 10 (the corpus spelling), preserving row geometry; and
 *   2. suppress the binding rule set of every neutralised key in the same
 *      operation (bare, modifier, and guarded forms), expressed as the
 *      deletion sets spec 076's .kmn projection consumes
 *      (`applyCarveToVfs` whole-node ids / `carvePipeline` item ids), so
 *      the behavioural half is invoked through that projection — never
 *      through the per-address gallery deletion overlay.
 *
 * Production is taken from the FR-003 resolver throughout: a ruled `T_`
 * key whose keycap never spells its character (Cameroon's T_0300) is a
 * producer here exactly as it is in coverage and enumeration (audit
 * gap 1). Neutralisation is by KEY ID (US4 scenario 3): an id that
 * produces the character in any occurrence's state is carved as an
 * identity, so its occurrences in states where it happens to produce
 * nothing (the shift-layer T_0300, which has no SHIFT rule) are
 * neutralised too — they are the same key, displaying the same carved
 * mark, and its rules are suppressed as one binding set.
 *
 * The shared-binding rule (contracts §4): a rule whose binding set also
 * serves a KEPT character is preserved for that character. Where the
 * carved character reaches the rule through store slots (the fv_* fan
 * shape: `+ any(fanKeys) > index(fan,1)`), separation is expressed as
 * slot removals on the stores the rule indexes — the slot machinery
 * (`applyStoreSlotRemovals`, via the carve pipeline) splices the whole
 * index-pair set at the same positions, so `index()` alignment between
 * the paired context/output stores is preserved by the coordinated
 * splice, never by shifting one store alone.
 * Where the two productions cannot be separated — a literal output run
 * containing both, an `outs()` of a store holding the character, a
 * store-driven shape with no index output to separate through — the
 * operation REFUSES with the binding named (FR-008's refusal rule
 * applied to carve) and changes nothing.
 *
 * For a ruled `U_` key both halves are mandatory (FR-020): the key is
 * neutralised AND its rules suppressed together — key-only removal
 * leaves orphaned rules; rule-only removal revives production via the
 * U_ decode.
 *
 * Pure: neither `ir` nor `layout` is mutated. `applyTouchCharCarve`
 * composes the operation with `deriveCarvedIr` for one-shot use.
 */

import type {
  IRRule,
  IRStore,
  KeyboardIR,
  TouchKeyIR,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";
import {
  bindingsForKeyId,
  buildTouchKeyRuleIndex,
  resolveTouchProduction,
  touchKeyStateFromLayerId,
} from "@keyboard-studio/contracts";
import type {
  TouchKeyRuleBinding,
  TouchKeyRuleIndex,
} from "@keyboard-studio/contracts";
import { deriveCarvedIr } from "./carvePipeline.js";
import { makeSlotId } from "./slotId.js";
import {
  BLANK_KEY_ID,
  BLANK_KEY_SP,
  buildRemovalSet,
  productionMatchesRemovalSet,
} from "./touch-mechanism-shared.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Why a carve was refused: the binding that could not be separated. */
export interface TouchCharCarveRefusal {
  /** The carved key id whose binding set contains the refusing rule. */
  readonly keyId: string;
  /** The refusing rule's node id. */
  readonly ruleNodeId: string;
  /** The binding, named for the author-facing refusal (rule + group + what it also serves). */
  readonly binding: string;
  /** Why separation is impossible for this binding. */
  readonly reason: string;
}

export type TouchCharCarveResult =
  | {
      readonly ok: true;
      /** The layout with every producing occurrence neutralised. */
      readonly layout: TouchLayoutIR;
      /** Rule node ids for the .kmn projection's whole-node deletion set. */
      readonly suppressedRuleNodeIds: ReadonlySet<string>;
      /** Store-slot ids (`<storeNodeId>#<index>`) for the pipeline's item deletion set. */
      readonly storeSlotIds: ReadonlySet<string>;
      /** How many occurrences (main keys + sub-key entries) were neutralised. */
      readonly neutralisedOccurrences: number;
    }
  | { readonly ok: false; readonly refusal: TouchCharCarveRefusal };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derive the carve of `char` over `layout` + `ir`: the neutralised layout
 * and the .kmn deletion sets, or a refusal naming the binding that cannot
 * be separated. Applies nothing — feed the deletion sets to
 * `applyCarveToVfs` / `deriveCarvedIr`, or use {@link applyTouchCharCarve}.
 */
export function carveTouchCharacter(
  ir: KeyboardIR,
  layout: TouchLayoutIR,
  char: string,
): TouchCharCarveResult {
  const target = char.normalize("NFC");
  const removalSet = buildRemovalSet([char]);
  const ruleIndex = buildTouchKeyRuleIndex(ir);
  const inputs = { ir, ruleIndex };

  // -- Phase 1: find the carved key ids -------------------------------------
  // An id is carved when ANY of its occurrences (main key or sub-key
  // entry) produces the character in that occurrence's layer state.
  const carvedKeyIds = new Set<string>();
  const produces = (key: TouchKeyIR, layerId: string): boolean => {
    const record = resolveTouchProduction(inputs, key, touchKeyStateFromLayerId(layerId));
    return productionMatchesRemovalSet(record, removalSet);
  };
  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) {
          if (produces(key, layer.id)) carvedKeyIds.add(key.id);
          for (const sub of allSubKeys(key)) {
            if (produces(sub, layer.id)) carvedKeyIds.add(sub.id);
          }
        }
      }
    }
  }

  if (carvedKeyIds.size === 0) {
    return {
      ok: true,
      layout,
      suppressedRuleNodeIds: new Set(),
      storeSlotIds: new Set(),
      neutralisedOccurrences: 0,
    };
  }

  // -- Phase 2: the binding sets --------------------------------------------
  const analysis = analyseBindings(ir, ruleIndex, carvedKeyIds, target);
  if (!analysis.ok) return { ok: false, refusal: analysis.refusal };

  // -- Phase 3: neutralise ---------------------------------------------------
  const { layout: nextLayout, neutralised } = neutraliseLayout(layout, carvedKeyIds, removalSet, inputs);

  return {
    ok: true,
    layout: nextLayout,
    suppressedRuleNodeIds: analysis.suppressedRuleNodeIds,
    storeSlotIds: analysis.storeSlotIds,
    neutralisedOccurrences: neutralised,
  };
}

/**
 * One-shot composition: {@link carveTouchCharacter} + the spec 076 .kmn
 * projection (`deriveCarvedIr`, the pipeline `applyCarveToVfs` runs).
 * Returns the neutralised layout and the carved IR together, or the
 * refusal unchanged.
 */
export function applyTouchCharCarve(
  ir: KeyboardIR,
  layout: TouchLayoutIR,
  char: string,
):
  | (Extract<TouchCharCarveResult, { ok: true }> & {
      readonly ir: KeyboardIR;
      readonly warnings: readonly string[];
    })
  | Extract<TouchCharCarveResult, { ok: false }> {
  const result = carveTouchCharacter(ir, layout, char);
  if (!result.ok) return result;
  const derived = deriveCarvedIr(ir, {
    deletedNodeIds: result.suppressedRuleNodeIds,
    deletedItemIds: result.storeSlotIds,
  });
  return { ...result, ir: derived.ir, warnings: derived.warnings };
}

// ---------------------------------------------------------------------------
// Binding analysis (contracts §4: suppress, separate, or refuse)
// ---------------------------------------------------------------------------

interface BindingAnalysis {
  readonly ok: true;
  readonly suppressedRuleNodeIds: Set<string>;
  readonly storeSlotIds: Set<string>;
}

function analyseBindings(
  ir: KeyboardIR,
  ruleIndex: TouchKeyRuleIndex,
  carvedKeyIds: ReadonlySet<string>,
  target: string,
): BindingAnalysis | { ok: false; refusal: TouchCharCarveRefusal } {
  const suppressed = new Set<string>();
  const slotIds = new Set<string>();

  const ruleByNodeId = new Map<string, IRRule>();
  for (const group of ir.groups) {
    for (const rule of group.rules) ruleByNodeId.set(rule.nodeId, rule);
  }
  const storeByName = new Map(ir.stores.map((s) => [s.name, s]));

  // Every binding in the index, grouped by rule — a rule's served
  // characters are the union over ALL its bindings (a store-expanded rule
  // binds several key ids; a modifier variant binds several states).
  const bindingsByRule = new Map<string, TouchKeyRuleBinding[]>();
  const keyIdsByRule = new Map<string, Set<string>>();
  for (const [keyId, bindings] of ruleIndex.byId) {
    for (const b of bindings) {
      const list = bindingsByRule.get(b.ruleNodeId) ?? [];
      list.push(b);
      bindingsByRule.set(b.ruleNodeId, list);
      const ids = keyIdsByRule.get(b.ruleNodeId) ?? new Set<string>();
      ids.add(keyId);
      keyIdsByRule.set(b.ruleNodeId, ids);
    }
  }
  const servedChars = (ruleNodeId: string): Set<string> => {
    const chars = new Set<string>();
    for (const b of bindingsByRule.get(ruleNodeId) ?? []) {
      for (const ch of b.produced) chars.add(ch.normalize("NFC"));
    }
    return chars;
  };
  // Mirror of the resolver's producing-binding test (contracts §1): a
  // `produces` role, or a transitions binding whose rule emits a deadkey.
  const isProducing = (b: TouchKeyRuleBinding): boolean => {
    if (b.role === "produces") return true;
    if (b.role !== "transitions") return false;
    const rule = ruleByNodeId.get(b.ruleNodeId);
    return rule?.output.some((el) => el.kind === "deadkey" || el.kind === "namedDeadkey") ?? false;
  };

  // Candidate rules: every rule in any carved key's binding set.
  const candidateRuleIds = new Set<string>();
  for (const keyId of carvedKeyIds) {
    for (const b of bindingsForKeyId(ruleIndex, keyId)) candidateRuleIds.add(b.ruleNodeId);
  }

  // Producing rules first — guard/suppresses decisions depend on them.
  // "Serves the target" / "serves kept" are judged on NFD components: a
  // rule producing the precomposed "à" serves BOTH the kept "a" and the
  // carved U+0300, and the join's produced set carries the composed form.
  const nfdParts = (ch: string): string[] => [...ch.normalize("NFD")];
  const producesTarget = (served: ReadonlySet<string>): boolean =>
    [...served].some((ch) => ch === target || nfdParts(ch).includes(target));
  const servesKept = (served: ReadonlySet<string>): boolean =>
    [...served].some((ch) => nfdParts(ch).some((part) => part !== target));

  const producingDecisions = new Map<string, "suppress" | "preserve">();
  const nonProducingRuleIds: string[] = [];
  for (const ruleNodeId of candidateRuleIds) {
    const bindings = bindingsByRule.get(ruleNodeId) ?? [];
    if (!bindings.some(isProducing)) {
      nonProducingRuleIds.push(ruleNodeId);
      continue;
    }
    const served = servedChars(ruleNodeId);
    if (!producesTarget(served)) {
      // The rule does not produce the carved character at all — the
      // character reaches its key another way (e.g. a ruled U_ key's
      // decode, which dies with the key's neutralisation). §4's
      // exception preserves the rule for the kept characters it serves;
      // no separation is needed because nothing is shared.
      producingDecisions.set(ruleNodeId, "preserve");
      continue;
    }
    if (!servesKept(served)) {
      producingDecisions.set(ruleNodeId, "suppress");
      suppressed.add(ruleNodeId);
      continue;
    }
    // Produces the carved character AND serves a kept one: try
    // separation through store slots.
    const rule = ruleByNodeId.get(ruleNodeId);
    const keyId = [...(keyIdsByRule.get(ruleNodeId) ?? [])].find((id) => carvedKeyIds.has(id)) ?? "";
    const separation = rule !== undefined
      ? trySeparate(rule, { storeByName, carvedKeyIds, target })
      : { ok: false as const, reason: "the rule is missing from the IR" };
    if (!separation.ok) {
      const keptParts = new Set<string>();
      for (const ch of served) {
        for (const part of nfdParts(ch)) {
          if (part !== target) keptParts.add(part);
        }
      }
      return {
        ok: false,
        refusal: {
          keyId,
          ruleNodeId,
          binding: `rule ${ruleNodeId} (group "${bindings[0]?.groupName ?? "?"}") bound to ${keyId} also serves ${[...keptParts].join(", ")}`,
          reason: separation.reason,
        },
      };
    }
    for (const slot of separation.slotIds) slotIds.add(slot);
    producingDecisions.set(ruleNodeId, "preserve");
  }

  // Non-producing rules (guard / suppresses / transitions forms): they
  // exist to shape a producing rule's behaviour for the same key. Suppress
  // one iff every producing rule bound to every key it binds is itself
  // suppressed; a guard whose producing rule survives (kept, or separated
  // and preserved) survives with it.
  for (const ruleNodeId of nonProducingRuleIds) {
    const boundKeyIds = keyIdsByRule.get(ruleNodeId) ?? new Set<string>();
    let allProducersSuppressed = true;
    for (const keyId of boundKeyIds) {
      for (const b of bindingsForKeyId(ruleIndex, keyId)) {
        if (isProducing(b) && producingDecisions.get(b.ruleNodeId) !== "suppress") {
          allProducersSuppressed = false;
        }
      }
    }
    if (allProducersSuppressed) suppressed.add(ruleNodeId);
  }

  return { ok: true, suppressedRuleNodeIds: suppressed, storeSlotIds: slotIds };
}

/**
 * Try to separate `target`'s production out of a shared rule through store
 * slots. Returns the slot ids to delete — the OUTPUT-store slots holding
 * the character — or the reason separation is impossible. The parallel
 * key/context-store positions are NOT requested here: the slot machinery
 * (`applyStoreSlotRemovals`) splices the whole index-pair set at the same
 * positions through its coordinated-removal analysis, and it refuses any
 * DIRECTLY requested slot whose item is not a char — a key store's items
 * are vkeys, so naming its slot here would poison the shared position and
 * the pair would drop nothing at all (the fv_ fan shape: fanHkeys holds
 * vkeys, fanH holds the chars).
 */
function trySeparate(
  rule: IRRule,
  ctx: {
    storeByName: ReadonlyMap<string, IRStore>;
    carvedKeyIds: ReadonlySet<string>;
    target: string;
  },
): { ok: true; slotIds: string[] } | { ok: false; reason: string } {
  const { storeByName, target } = ctx;

  // A literal char output containing the target is one indivisible run
  // with whatever else the rule emits — rewriting it is authoring, not
  // carving.
  for (const el of rule.output) {
    if (el.kind === "char" && el.value.normalize("NFD").includes(target)) {
      return {
        ok: false,
        reason: `the rule's literal output "${el.value}" contains the carved character alongside kept output; separating them means rewriting the rule`,
      };
    }
    if (el.kind === "outs") {
      const store = storeByName.get(el.storeRef);
      const holdsTarget = store?.items.some(
        (item) => item.kind === "char" && item.value.normalize("NFC") === target,
      );
      if (holdsTarget) {
        return {
          ok: false,
          reason: `the rule emits the whole of store "${el.storeRef}" via outs(), which holds the carved character; removing it would change the rule's output for kept characters too`,
        };
      }
    }
  }

  // Separation flows through index() outputs: the character must reach
  // the rule by position in an output store.
  const outputStoreNames = [
    ...new Set(rule.output.filter((el) => el.kind === "index").map((el) => el.storeRef)),
  ];
  if (outputStoreNames.length === 0) {
    return {
      ok: false,
      reason: "the carved character reaches this rule through no index() store output, so there is no slot whose removal separates it",
    };
  }
  const slotIds: string[] = [];
  let separatedPositions = 0;
  for (const name of outputStoreNames) {
    const store = storeByName.get(name);
    if (store === undefined) continue;
    store.items.forEach((item, index) => {
      if (item.kind !== "char" || item.value.normalize("NFC") !== target) return;
      slotIds.push(makeSlotId(store.nodeId, index));
      separatedPositions++;
    });
  }
  if (separatedPositions === 0) {
    return {
      ok: false,
      reason: "the carved character does not sit in any store this rule indexes, so slot removal cannot separate it",
    };
  }
  return { ok: true, slotIds };
}

// ---------------------------------------------------------------------------
// Neutralisation
// ---------------------------------------------------------------------------

function allSubKeys(key: TouchKeyIR): TouchKeyIR[] {
  return [
    ...(key.sk ?? []),
    ...(key.multitap ?? []),
    ...Object.values(key.flick ?? {}).filter((v): v is TouchKeyIR => v !== undefined),
  ];
}

/** The contracts §4 neutral form: T_BLANK / sp 10, geometry kept, production fields dropped. */
function blankKey(key: TouchKeyIR): TouchKeyIR {
  const { text: _t, output: _o, ...rest } = key;
  const blanked: TouchKeyIR = { ...rest, id: BLANK_KEY_ID, sp: BLANK_KEY_SP };
  // Same spWire hygiene as applyDesktopModifications' placeholder: a wire
  // hint encoding the OLD sp must not survive a sp change.
  if (key.sp !== BLANK_KEY_SP) delete blanked.spWire;
  return blanked;
}

function neutraliseLayout(
  layout: TouchLayoutIR,
  carvedKeyIds: ReadonlySet<string>,
  removalSet: ReadonlySet<string>,
  inputs: { ir: KeyboardIR; ruleIndex: TouchKeyRuleIndex },
): { layout: TouchLayoutIR; neutralised: number } {
  let neutralised = 0;
  const produces = (key: TouchKeyIR, layerId: string): boolean => {
    const record = resolveTouchProduction(inputs, key, touchKeyStateFromLayerId(layerId));
    return productionMatchesRemovalSet(record, removalSet);
  };

  const neutraliseSub = (sub: TouchKeyIR, layerId: string): TouchKeyIR => {
    if (carvedKeyIds.has(sub.id) || produces(sub, layerId)) {
      neutralised++;
      return blankKey(sub);
    }
    return sub;
  };

  let anyPlatformChanged = false;
  const platforms = layout.platforms.map((platform) => {
    let anyLayerChanged = false;
    const layers = platform.layers.map((layer) => {
      let anyRowChanged = false;
      const rows = layer.rows.map((row) => {
        let anyKeyChanged = false;
        const keys = row.keys.map((key) => {
          let next = key;
          // Sub-key entries are occurrences in their own right.
          if (key.sk !== undefined) {
            const sk = key.sk.map((s) => neutraliseSub(s, layer.id));
            if (sk.some((s, i) => s !== key.sk![i])) next = { ...next, sk };
          }
          if (key.multitap !== undefined) {
            const multitap = key.multitap.map((s) => neutraliseSub(s, layer.id));
            if (multitap.some((s, i) => s !== key.multitap![i])) next = { ...next, multitap };
          }
          if (key.flick !== undefined) {
            let flickChanged = false;
            const flick: NonNullable<TouchKeyIR["flick"]> = {};
            for (const [dir, sub] of Object.entries(key.flick)) {
              if (sub === undefined) continue;
              const replaced = neutraliseSub(sub, layer.id);
              if (replaced !== sub) flickChanged = true;
              flick[dir as keyof typeof flick] = replaced;
            }
            if (flickChanged) next = { ...next, flick };
          }
          if (carvedKeyIds.has(key.id)) {
            neutralised++;
            next = blankKey(next);
          }
          if (next !== key) anyKeyChanged = true;
          return next;
        });
        if (!anyKeyChanged) return row;
        anyRowChanged = true;
        return { ...row, keys };
      });
      if (!anyRowChanged) return layer;
      anyLayerChanged = true;
      return { ...layer, rows };
    });
    if (!anyLayerChanged) return platform;
    anyPlatformChanged = true;
    return { ...platform, layers };
  });

  if (!anyPlatformChanged) return { layout, neutralised };
  return { layout: { ...layout, platforms }, neutralised };
}
