// TouchKeyProvenance — re-export of the contracts type (spec-014, P4a→P5).
//
// Promoted from an editor-local reservation (P4a, T018) onto the
// `@keyboard-studio/contracts` `TouchKeyIR.provenance` field. This module now
// RE-EXPORTS the contracts type so there is a single source of truth
// (provenance.contract.md P1/FR-008/SC-007); existing editor imports keep
// working unchanged.
//
// Source of truth: packages/contracts/src/keyboard-ir.ts § TouchKeyProvenance
// (originally specs/012-step-model-manifest/data-model.md § TouchKeyProvenance)

// ---------------------------------------------------------------------------
// Type — re-exported from the contracts package (single definition).
// ---------------------------------------------------------------------------

/**
 * Describes how a touch key placement was derived.
 *
 * - "base-derived"       — Came from the base keyboard's touch layout.
 * - "physical-suggested" — Proposed by the touchSuggest generator from a
 *                          physical key decision (S-01/S-02/S-03/S-08).
 * - "hand-set"           — Manually edited by the author. Default for
 *                          pre-existing keys: never auto-overwritten (FR-020).
 *
 * @see packages/contracts/src/keyboard-ir.ts — canonical `TouchKeyProvenance`.
 */
import type { TouchKeyProvenance } from "@keyboard-studio/contracts";
export type { TouchKeyProvenance } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Default helper
// ---------------------------------------------------------------------------

/**
 * Returns the default provenance for a key that has not been explicitly tagged.
 *
 * Pre-existing keys in the base layout are "hand-set" by default — they
 * represent the keyboard author's intent and must never be silently overwritten
 * by the suggestion engine (FR-020).
 */
export function defaultProvenance(): TouchKeyProvenance {
  return "hand-set";
}
