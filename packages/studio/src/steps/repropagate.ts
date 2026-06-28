// repropagate — spec-014 US2 touch re-propagation (no-clobber), T022.
//
// On a physical change (physical-lock break / physical-step completion), the
// touch surface is automatically re-derived — but only the keys it OWNS. Keys
// the author placed or edited by hand are never overwritten (the no-clobber
// rule). This module is the steps-layer re-propagation seam.
//
// Guarantees (repropagation.contract.md):
//   R1 — automatic, staleness-driven: the trigger (reducer.ts T024) calls this
//        on a physical change; it reads the injected `staleSteps` slice.
//   R2 — no-clobber: overwrites ONLY `base-derived` / `physical-suggested`
//        keys; NEVER `hand-set`. Absent/undefined provenance is treated AS
//        `hand-set` (protected). Empty-hand-set is the trivial pass.
//   R3 — coalesced single pass: re-runs `touchSuggest` ONCE over the union of
//        the staleness closure; each derived key re-suggested at most once.
//   R4 — promotion is respected: a key promoted to `hand-set` (touchBehavior.ts)
//        is left untouched here.
//   R5 — no dependents: an empty staleness closure yields a no-op, not an error.
//   R6 — orphaned hand-set keys are NOT auto-deleted (dashboard concern).
//
// Writes go THROUGH the single mutate() write path: a `touchLayout`
// `Partial<KeyboardIR>` patch applied via `applyMutatePatch(base, patch,
// TOUCH_WRITES)` (consistent with the M6 single-write-path; A3 RESOLVED). It is
// NOT the side-car touch JSON.
//
// BOUNDARY COMPLIANCE: steps/ may NOT import stores/. The `staleSteps` slice
// and the working-IR read/write are INJECTED via RepropagateDeps (mirroring the
// reducer's getWorkingIR/setWorkingIR pattern). Pure / idempotent.
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/contracts/repropagation.contract.md

import type { KeyboardIR, TouchKeyIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import { touchSuggest } from "../editors/touchSuggest/touchSuggest.ts";
import { applyMutatePatch } from "./mutateApply.ts";
import { TOUCH_WRITES } from "./editorMutate.ts";

// ---------------------------------------------------------------------------
// Injected dependencies (steps/ may not import stores/)
// ---------------------------------------------------------------------------

export interface RepropagateDeps {
  /**
   * The P4b staleness slice — the union of the staleness closure (root-set +
   * completeness fixpoint). Re-propagation runs a SINGLE coalesced pass over
   * this whole set (R3). An empty set is a no-op (R5).
   */
  readonly staleSteps: ReadonlySet<string>;
  /** Read the current working-copy IR, or null when not yet instantiated. */
  readonly getWorkingIR: () => KeyboardIR | null;
  /** Write the merged IR back to the working copy (the mutate() write path). */
  readonly setWorkingIR: (ir: KeyboardIR) => void;
}

// ---------------------------------------------------------------------------
// No-clobber predicate (R2)
// ---------------------------------------------------------------------------

/**
 * True when re-propagation is ALLOWED to overwrite this key — i.e. its
 * provenance is an auto-managed state (`base-derived` or `physical-suggested`).
 * A `hand-set` key, AND any key with absent/undefined provenance (legacy →
 * treated as `hand-set`, FR-009), is protected and returns false.
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
  // Index suggested keys by id for an O(1) lookup (each id at most once — the
  // single coalesced pass produces one suggestion per key, R3).
  const suggestedById = new Map<string, TouchKeyIR>();
  for (const platform of suggested.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) {
          if (!suggestedById.has(key.id)) suggestedById.set(key.id, key);
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
          if (!isOverwritable(key)) {
            // hand-set / untagged → byte-identical clone (R2/R4).
            return structuredClone(key);
          }
          const replacement = suggestedById.get(key.id);
          // Overwritable but no suggestion exists for it → keep as-is (R6).
          return replacement === undefined ? structuredClone(key) : structuredClone(replacement);
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
 * R5 — short-circuits to a no-op when the staleness closure is empty (no
 *      derived touch dependents → nothing to re-suggest).
 * R1/R3 — re-runs `touchSuggest` ONCE over the working IR (the union of the
 *         staleness closure is a single physical-decision substrate) and merges
 *         it under the no-clobber rule.
 * The merged layout is written THROUGH the single mutate() write path
 * (applyMutatePatch / TOUCH_WRITES). A no-op patch (`{}` / unchanged layout) is
 * still applied as a structural copy, but `setWorkingIR` is skipped when there
 * is nothing to write (no touch layout) to avoid churn.
 *
 * Idempotent: re-running against the merged result yields the same IR (the
 * suggestion is a pure function of the physical IR, and hand-set keys are
 * untouched).
 */
export function repropagate(deps: RepropagateDeps): void {
  // R5 — empty closure ⇒ no-op.
  if (deps.staleSteps.size === 0) return;

  const base = deps.getWorkingIR();
  if (base === null) return;
  // Nothing to re-propagate over — no touch layout on the working copy.
  if (base.touchLayout === undefined) return;

  // R1/R3 — single coalesced re-derivation over the physical IR.
  const suggested = touchSuggest({ physicalIR: base });
  const patch = buildRepropagationPatch(base, suggested);

  // Route through the single mutate() write path (A3 / M6); TOUCH_WRITES
  // containment + path-scoped deep merge (M2/M3) apply exactly as for carve/add.
  const next = applyMutatePatch(base, patch, TOUCH_WRITES);
  deps.setWorkingIR(next);
}
