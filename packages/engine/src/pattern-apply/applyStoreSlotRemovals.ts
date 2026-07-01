// Store-slot removal: per-store-class dispatch for carving individual
// characters out of a store's items[] without breaking the rules that
// reference it.
//
// Originated as a single-purpose nul-fill transform for parallel-store
// deadkey patterns (the SIL Cameroon pattern). In that pattern, a rule like:
//
//   dk(003b) any(dkf003b) > index(dkt003b, 2)
//
// outputs ~83 characters: pressing the input key matching position P in
// `dkf003b` outputs `dkt003b[P]`. To carve out ONE output character we MUST
// NOT delete the rule (loses all 83 outputs) and MUST NOT splice/remove the
// store entry (shifts every later index, corrupting alignment). For THAT
// class of store — one whose items[] positions are load-bearing because a
// rule's index() offset or a parallel any()/notany() store is aligned by
// position — we replace the target slot with `{kind:"raw",text:"nul"}`,
// which the KMN codec emits verbatim as `nul` and kmcmplib treats as a
// silent no-op, preserving alignment exactly. (`beep` was considered but
// produces an audible bell on every carved keystroke; `nul` is the silent
// equivalent, matching the Cameroon QWERTY padding idiom.)
//
// Not every store is alignment-sensitive, though. A store referenced only
// via bare `any()` in rule context (no positionally-paired output store) has
// no positional contract to preserve — dropping its slot is safe and keeps
// the store's items[] free of leftover nul filler. "Never splice" is
// therefore a property of the nul-fill class, not the whole module: the
// classifier below decides, per store, whether a targeted slot should be
// nul-filled, dropped (spliced out), or left alone with a warning.
//
// Slot id encoding (the engine<->studio seam — do not change):
//   "<storeNodeId>#<itemsIndex>"  where itemsIndex is 0-based into IRStore.items.
//   This differs from whole-node deletion ids (bare nodeId, no `#`) so the two can be
//   unambiguously partitioned at the call site.
//
// baseIr is never mutated. Structural-sharing shallow copy:
//   { ...baseIr, stores: baseIr.stores.map(s => replacedById.get(s.nodeId) ?? s) }
// Untouched stores keep the same object reference; groups/comments/raw are passed
// through by reference.

import type { KeyboardIR, IRStore, StoreItem } from "@keyboard-studio/contracts";
import { parseSlotId } from "./slotId.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Result of {@link applyStoreSlotRemovals}.
 *
 * - `ir`           — new IR with targeted slots nul-filled, dropped, or left
 *                    alone depending on each store's classification.
 * - `warnings`     — diagnostic messages for malformed ids, missing stores,
 *                    blocked classes, and out-of-range/non-char indices
 *                    (empty when all is well).
 * - `appliedCount` — number of slots actually nul-filled or dropped.
 */
export interface StoreSlotRemovalResult {
  ir: KeyboardIR;
  warnings: string[];
  appliedCount: number;
}

/**
 * Reason a store's targeted slots were blocked from any edit.
 *
 * - `system-store`          — &-prefixed compiler-directive store (e.g. &NAME).
 * - `notany-widens`         — store appears in a `notany()` context element;
 *                              dropping an item from it WIDENS the exclusion set
 *                              (a char that used to be excluded would now match),
 *                              changing matcher semantics.
 * - `context-index-aligned` — store appears in an `index()` context element;
 *                              its positions are read by the matcher itself, not
 *                              just produced as output, so neither fill nor drop
 *                              is safe without deeper analysis.
 * - `paired-input`          — store is an `any()` context source in a rule whose
 *                              OUTPUT contains an `index()` element (positional
 *                              pairing with an output store); dropping would shift
 *                              this store's positions out of alignment with the
 *                              paired output store. Deferred to a follow-up.
 * - `dual-use`              — store is both an output target (index()/outs()) and
 *                              an input source (any()/notany()) somewhere in the
 *                              rule set. Previously such stores were nul-filled;
 *                              this is now deliberately blocked pending a decision
 *                              on which behavior is safe for the dual role.
 */
export type StoreSlotBlockReason =
  | "system-store"
  | "notany-widens"
  | "context-index-aligned"
  | "paired-input"
  | "dual-use";

/** Per-store edit mode chosen by {@link classifyStoreSlotEdit}. */
export type StoreSlotEditMode =
  | { mode: "nul-fill" }
  | { mode: "drop" }
  | { mode: "blocked"; reason: StoreSlotBlockReason };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Nul filler placed at a nul-filled slot position (silent no-op, preserves index() alignment). */
const NUL_FILLER: StoreItem = { kind: "raw", text: "nul" };

/** Usage flags for one store, gathered by a single scan over every rule. */
interface StoreUsageFlags {
  /** Store is an output target: referenced by index()/outs() in some rule's output. */
  asEmitOutput: boolean;
  /** Store is a bare any() context source in some rule. */
  asAnySource: boolean;
  /** Store is a notany() context source in some rule. */
  asNotAny: boolean;
  /** Store is referenced by an index() context element in some rule. */
  asContextIndex: boolean;
  /**
   * Store is an any() context source in a rule whose OUTPUT contains ANY
   * index() element (presence-based — regardless of which store that index()
   * targets). Positional coupling between the any() source and *some*
   * output index() makes a positional drop of this store unsafe.
   */
  pairedInput: boolean;
}

/**
 * Scan every rule once and derive usage flags for `storeName`.
 *
 * Reimplemented inline rather than importing a studio helper — the engine
 * must not import from the studio package (team-boundary invariant, spec §12).
 */
function computeStoreUsage(storeName: string, ir: KeyboardIR): StoreUsageFlags {
  const flags: StoreUsageFlags = {
    asEmitOutput: false,
    asAnySource: false,
    asNotAny: false,
    asContextIndex: false,
    pairedInput: false,
  };

  for (const group of ir.groups) {
    for (const rule of group.rules) {
      let ruleHasAnySource = false;
      let ruleOutputHasIndex = false;

      for (const el of rule.context) {
        if (el.kind === "any" && el.storeRef === storeName) {
          flags.asAnySource = true;
          ruleHasAnySource = true;
        } else if (el.kind === "notany" && el.storeRef === storeName) {
          flags.asNotAny = true;
        } else if (el.kind === "index" && el.storeRef === storeName) {
          flags.asContextIndex = true;
        }
      }

      for (const el of rule.output) {
        if (el.kind === "index" || el.kind === "outs") {
          ruleOutputHasIndex = ruleOutputHasIndex || el.kind === "index";
          if (el.storeRef === storeName) {
            flags.asEmitOutput = true;
          }
        }
      }

      if (ruleHasAnySource && ruleOutputHasIndex) {
        flags.pairedInput = true;
      }
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

/**
 * Classify how slots in `store` may be edited, given its usage across every
 * rule in `ir`. Decision order (first match wins):
 *
 *   1. `store.isSystem`                        → blocked "system-store"
 *   2. referenced by `notany()`                → blocked "notany-widens"
 *   3. referenced by `index()` in context       → blocked "context-index-aligned"
 *   4. output target AND (any-source OR notany) → blocked "dual-use"
 *   5. output target (index()/outs())           → "nul-fill" (unchanged #530 path)
 *   6. any()-source paired with an output index() in some rule → blocked "paired-input"
 *   7. any()-source, unpaired                   → "drop"
 *   8. unreferenced by any rule                  → "drop"
 *
 * @param store  The store whose slots are being targeted.
 * @param ir     The full IR (scanned for every rule's use of `store.name`).
 */
export function classifyStoreSlotEdit(store: IRStore, ir: KeyboardIR): StoreSlotEditMode {
  if (store.isSystem) {
    return { mode: "blocked", reason: "system-store" };
  }

  const usage = computeStoreUsage(store.name, ir);

  if (usage.asNotAny) {
    return { mode: "blocked", reason: "notany-widens" };
  }

  if (usage.asContextIndex) {
    return { mode: "blocked", reason: "context-index-aligned" };
  }

  if (usage.asEmitOutput && (usage.asAnySource || usage.asNotAny)) {
    return { mode: "blocked", reason: "dual-use" };
  }

  if (usage.asEmitOutput) {
    return { mode: "nul-fill" };
  }

  if (usage.pairedInput) {
    return { mode: "blocked", reason: "paired-input" };
  }

  // asAnySource (unpaired) or entirely unreferenced both drop safely: there is
  // no positional contract (index() alignment) to preserve in either case.
  return { mode: "drop" };
}

/** Human-readable explanation appended to a blocked-store warning. */
function blockReasonMessage(reason: StoreSlotBlockReason): string {
  switch (reason) {
    case "system-store":
      return "it is a system/compiler-directive store.";
    case "notany-widens":
      return "it is referenced by notany() in a rule's context; dropping a char would widen matching.";
    case "context-index-aligned":
      return "it is referenced by index() in a rule's context; its positions are read by the matcher.";
    case "paired-input":
      return (
        "it is an any() source in a rule whose output contains an index() element; " +
        "dropping would break positional alignment with the paired output store."
      );
    case "dual-use":
      return "it is both an output target and an input source (any()/notany()) across the rule set.";
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Edit targeted store slots in a new IR without mutating `baseIr`.
 *
 * Each `slotId` in `slotIds` must have the form `"<storeNodeId>#<itemsIndex>"`.
 * Slot ids are grouped by store; each targeted store is classified once via
 * {@link classifyStoreSlotEdit}, then all of that store's targeted indices are
 * nul-filled, dropped, or blocked accordingly in a single pass.
 *
 * @param baseIr  Source-of-truth IR. Never mutated.
 * @param slotIds Set of slot ids encoding which store items to edit.
 * @returns       New IR, diagnostic warnings, and count of applied edits.
 */
export function applyStoreSlotRemovals(
  baseIr: KeyboardIR,
  slotIds: ReadonlySet<string>,
): StoreSlotRemovalResult {
  const warnings: string[] = [];

  if (slotIds.size === 0) {
    return { ir: baseIr, warnings, appliedCount: 0 };
  }

  // --- Parse and group slot ids by storeNodeId ----------------------------
  /** Map from storeNodeId -> set of 0-based item indices to edit. */
  const targetsByStore = new Map<string, Set<number>>();

  for (const id of slotIds) {
    const parsed = parseSlotId(id);
    if (parsed === null) {
      warnings.push(
        `[store-slot] malformed slot id (expected "<storeNodeId>#<itemsIndex>"): ${id}`,
      );
      continue;
    }
    const { storeNodeId, itemsIndex } = parsed;

    let indexSet = targetsByStore.get(storeNodeId);
    if (indexSet === undefined) {
      indexSet = new Set<number>();
      targetsByStore.set(storeNodeId, indexSet);
    }
    indexSet.add(itemsIndex);
  }

  if (targetsByStore.size === 0) {
    // All ids were malformed.
    return { ir: baseIr, warnings, appliedCount: 0 };
  }

  // --- Build the map of replaced store objects ----------------------------
  /** Map from storeNodeId -> replacement IRStore (only stores that changed). */
  const replacedById = new Map<string, IRStore>();
  let appliedCount = 0;

  for (const [storeNodeId, indexSet] of targetsByStore) {
    const store = baseIr.stores.find((s) => s.nodeId === storeNodeId);
    if (store === undefined) {
      warnings.push(
        `[store-slot] store not found in IR (nodeId: ${storeNodeId}); slot(s) skipped.`,
      );
      continue;
    }

    const editMode = classifyStoreSlotEdit(store, baseIr);

    if (editMode.mode === "blocked") {
      warnings.push(
        `[store-slot] store "${store.name}" (nodeId: ${storeNodeId}) is blocked from editing: ` +
          blockReasonMessage(editMode.reason),
      );
      continue;
    }

    if (editMode.mode === "nul-fill") {
      // Validate indices and build new items array. Never splice — index()
      // alignment across the store depends on positions staying put.
      const newItems: StoreItem[] = [...store.items]; // shallow copy
      let storeApplied = 0;

      for (const idx of indexSet) {
        if (idx < 0 || idx >= store.items.length) {
          warnings.push(
            `[store-slot] index ${idx} out of range for store "${store.name}" ` +
              `(length: ${store.items.length}); slot skipped.`,
          );
          continue;
        }
        newItems[idx] = NUL_FILLER; // replace — never splice
        storeApplied++;
      }

      if (storeApplied === 0) {
        // All indices were out of range; no need to copy the store.
        continue;
      }

      appliedCount += storeApplied;
      replacedById.set(storeNodeId, { ...store, items: newItems });
      continue;
    }

    // editMode.mode === "drop": splice out targeted indices. Safe here because
    // classifyStoreSlotEdit already ruled out any positional contract (no
    // index() alignment, no notany()/context-index/paired-input entanglement).
    let storeApplied = 0;
    const dropIndices = new Set<number>();

    for (const idx of indexSet) {
      if (idx < 0 || idx >= store.items.length) {
        warnings.push(
          `[store-slot] index ${idx} out of range for store "${store.name}" ` +
            `(length: ${store.items.length}); slot skipped.`,
        );
        continue;
      }
      const item = store.items[idx];
      if (item === undefined || item.kind !== "char") {
        warnings.push(
          `[store-slot] index ${idx} in store "${store.name}" is not a char item ` +
            `(kind: ${item === undefined ? "undefined" : item.kind}); drop skipped for this slot.`,
        );
        continue;
      }
      dropIndices.add(idx);
      storeApplied++;
    }

    if (storeApplied === 0) {
      continue;
    }

    const newItems = store.items.filter((_, i) => !dropIndices.has(i));
    appliedCount += storeApplied;
    replacedById.set(storeNodeId, { ...store, items: newItems });

    if (newItems.length === 0) {
      warnings.push(
        `[store-slot] store "${store.name}" is now empty; rules that reference it will never match`,
      );
    }
  }

  if (replacedById.size === 0) {
    // Nothing survived the guards.
    return { ir: baseIr, warnings, appliedCount: 0 };
  }

  // --- Structural-sharing shallow copy of the IR --------------------------
  const newIr: KeyboardIR = {
    ...baseIr,
    stores: baseIr.stores.map((s) => replacedById.get(s.nodeId) ?? s),
    // groups, comments, raw, touchLayout, visualKeyboard passed through by reference.
  };

  return { ir: newIr, warnings, appliedCount };
}
