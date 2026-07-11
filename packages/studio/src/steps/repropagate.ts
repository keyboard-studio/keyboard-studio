// repropagate — spec-014 US2 touch re-propagation (no-clobber), T022.
//
// On a physical change, the touch surface is automatically re-derived, but only
// for keys with auto-managed provenance. Hand-edited keys are never overwritten
// (no-clobber rule). This is the steps-layer re-propagation seam.
//
// Guarantees (repropagation.contract.md):
//   R1 — automatic, staleness-driven trigger on physical changes.
//   R2 — no-clobber: overwrites only `base-derived`/`physical-suggested` keys.
//   R3 — coalesced single pass: re-runs `touchSuggest` once over staleness closure.
//   R4 — promotion is respected: `hand-set` keys are left untouched.
//   R5 — empty staleness closure yields a no-op, not an error.
//   R6 — orphaned hand-set keys are not auto-deleted.
//
// Writes go through the single mutate() write path via `applyMutatePatch(base,
// patch, TOUCH_WRITES)`. Dependencies (`staleSteps`, working-IR read/write) are
// injected via RepropagateDeps (steps/ may not import stores/). Pure/idempotent.
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/contracts/repropagation.contract.md

import type { KeyboardIR, TouchKeyIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import { emitTouchLayout } from "@keyboard-studio/engine";
import { touchSuggest } from "../editors/touchSuggest/touchSuggest.ts";
import { applyMutatePatch } from "./mutateApply.ts";
import { TOUCH_WRITES } from "./editorMutate.ts";

// ---------------------------------------------------------------------------
// Injected dependencies (steps/ may not import stores/)
// ---------------------------------------------------------------------------

export interface RepropagateDeps {
  /** The staleness closure. Re-propagation runs a single coalesced pass over
   * this set (R3). An empty set is a no-op (R5). */
  readonly staleSteps: ReadonlySet<string>;
  /** Read the current working-copy IR, or null when not yet instantiated. */
  readonly getWorkingIR: () => KeyboardIR | null;
  /** Write the merged IR back to the working copy. */
  readonly setWorkingIR: (ir: KeyboardIR) => void;
  /**
   * Optional: persist the re-serialized `.keyman-touch-layout` side-car JSON
   * so the shipped artifact reflects re-propagation, not just the OSK preview
   * (issue #831). When absent, only the preview IR is updated; tests may omit
   * it to assert the pure IR merge in isolation.
   */
  readonly setTouchLayoutJson?: (json: string) => void;
}

// ---------------------------------------------------------------------------
// No-clobber predicate (R2)
// ---------------------------------------------------------------------------

/**
 * True when re-propagation is allowed to overwrite this key — i.e. its
 * provenance is an auto-managed state (`base-derived` or `physical-suggested`).
 * A `hand-set` key or any key with absent/undefined provenance is protected.
 */
export function isOverwritable(key: TouchKeyIR): boolean {
  return key.provenance === "base-derived" || key.provenance === "physical-suggested";
}

// ---------------------------------------------------------------------------
// No-clobber merge (R2)
// ---------------------------------------------------------------------------

/**
 * Merge a freshly-suggested layout into the existing one under the no-clobber
 * rule. For every existing key:
 *   - `hand-set` / untagged  → kept BYTE-IDENTICAL (never overwritten, R2/R4).
 *   - `base-derived` / `physical-suggested` → replaced by the suggestion with
 *     the same key id when one exists; otherwise kept as-is (R6: an orphaned
 *     derived key whose suggestion vanished is not auto-deleted here).
 *
 * Pure — returns a fresh TouchLayoutIR; inputs are not mutated. Structure
 * (platform/layer/row shape) follows `existing`; `nodeIds` is preserved from
 * `existing` (hand-set keys keep their refs; the suggestion's structure mirrors
 * the existing one so refs stay valid).
 */
export function mergeNoClobber(
  existing: TouchLayoutIR,
  suggested: TouchLayoutIR,
): TouchLayoutIR {
  // Index suggested keys by id for O(1) lookup.
  const suggestedById = new Map<string, TouchKeyIR>();
  for (const platform of suggested.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) {
          suggestedById.set(key.id, key);
        }
      }
    }
  }

  const platforms: TouchLayoutIR["platforms"] = existing.platforms.map((platform) => ({
    ...platform,
    layers: platform.layers.map((layer) => ({
      ...layer,
      rows: layer.rows.map((row) => ({
        keys: row.keys.map((key) => {
          if (!isOverwritable(key)) return structuredClone(key);
          return structuredClone(suggestedById.get(key.id) ?? key);
        }),
      })),
    })),
  }));

  return {
    platforms,
    nodeIds: structuredClone(existing.nodeIds),
  };
}

// ---------------------------------------------------------------------------
// Patch builder
// ---------------------------------------------------------------------------

/**
 * Build the re-propagation patch: a `touchLayout`-only `Partial<KeyboardIR>`
 * carrying the no-clobber-merged layout. Returns the EMPTY patch `{}` (a no-op
 * under applyMutatePatch) when the IR ships no touch layout — there is nothing
 * to re-propagate over.
 */
export function buildRepropagationPatch(
  ir: KeyboardIR,
  suggested: TouchLayoutIR,
): Partial<KeyboardIR> {
  if (ir.touchLayout === undefined) return {};
  return { touchLayout: mergeNoClobber(ir.touchLayout, suggested) };
}

// ---------------------------------------------------------------------------
// Re-propagation entry point (R1/R3/R5)
// ---------------------------------------------------------------------------

/**
 * Re-propagate the touch layout after a physical change.
 *
 * R5 — short-circuits to a no-op when the staleness closure is empty.
 * R1/R3 — re-runs `touchSuggest` ONCE over the working IR and merges it under
 *         the no-clobber rule.
 * The merged layout is written through the single mutate() write path
 * (applyMutatePatch / TOUCH_WRITES).
 *
 * Side-car serialization (issue #831): when `setTouchLayoutJson` is injected,
 * the merged `touchLayout` IR is re-serialized via `emitTouchLayout` and
 * persisted into the side-car, so the SHIPPED `.keyman-touch-layout` reflects
 * re-propagation, not just the OSK preview.
 *
 * Idempotent: re-running against the merged result yields the same IR.
 */
export function repropagate(deps: RepropagateDeps): void {
  if (deps.staleSteps.size === 0) return;

  const base = deps.getWorkingIR();
  if (base === null || base.touchLayout === undefined) return;

  const suggested = touchSuggest({ physicalIR: base });
  const patch = buildRepropagationPatch(base, suggested);
  const next = applyMutatePatch(base, patch, TOUCH_WRITES);
  deps.setWorkingIR(next);

  if (deps.setTouchLayoutJson !== undefined && next.touchLayout !== undefined) {
    deps.setTouchLayoutJson(emitTouchLayout(next.touchLayout));
  }
}
