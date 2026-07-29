// existingTouchPlacement — locates WHERE (and how) a character already sits
// in a touch seed layout, for the read-only "here's the existing
// implementation" display (spec v1.3.1 §3c: a character already reachable on
// the seed never needs an Accept click — it is simply shown).
//
// Walks the same key shapes `computeTouchCoverage`
// (@keyboard-studio/contracts touch-coverage.ts) walks to decide a char is
// *reachable* (text/output/decoded `U_` id, then sk/flick/multitap
// sub-keys) — but this helper answers a different question ("where, and by
// what mechanism") rather than a yes/no, so it is not a re-export of that
// traversal. Kept independent and pure so it is trivially unit-testable
// against a hand-built `TouchLayoutIR` fixture.

import {
  isSpacerKeyClass,
  keyProducesChar,
  type TouchLayoutIR,
} from "@keyboard-studio/contracts";

export type ExistingTouchPlacementRole =
  | "base"
  | "longpress"
  | "flick"
  | "multitap";

export interface ExistingTouchPlacement {
  /** The key id (e.g. "K_U") the character sits on. */
  hostKey: string;
  /** How the character is reached from that key. */
  role: ExistingTouchPlacementRole;
  /** The touch layer id (e.g. "default", "shift") the key was found on. */
  layerId: string;
}

// The single-key match predicate (non-empty, non-"*"-prefixed text/output,
// or a decoded `U_<HEX>` id, all NFC-normalized) is the canonical
// `keyProducesChar` from @keyboard-studio/contracts touch-coverage.ts — the
// same predicate `collectKeyChars` there uses internally to decide whether a
// key is a char producer. This module used to carry its own copy
// (`keyDirectlyProduces`); factored out so the two can't drift (spec review
// follow-up). Does not recurse — callers below walk sub-keys themselves so
// they can attach the correct {@link ExistingTouchPlacementRole}.

/**
 * Locate the first place `char` is produced in `layout` — which host key,
 * which mechanism (base text, a long-press sub-key, a flick gesture, or a
 * multitap step), and which layer. Returns `null` when `char` is not found
 * anywhere in the layout (the caller should already know it is — via
 * `touchCoverage`/`detectedChars` — before calling this; a `null` here means
 * "detected as reachable but this walk couldn't pin down a single key",
 * which the caller falls back to a plain "already on the touch keyboard"
 * message for).
 *
 * Pure; no mutation, no I/O. Platform/layer/row/key order is the layout's own
 * declared order — the first match wins, matching "where does the author
 * see it first" rather than an exhaustive report of every occurrence.
 */
export function describeExistingTouchPlacement(
  layout: TouchLayoutIR,
  char: string,
): ExistingTouchPlacement | null {
  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) {
          if (isSpacerKeyClass(key.sp)) continue;
          if (keyProducesChar(key, char)) {
            return { hostKey: key.id, role: "base", layerId: layer.id };
          }
          for (const sub of key.sk ?? []) {
            if (keyProducesChar(sub, char)) {
              return { hostKey: key.id, role: "longpress", layerId: layer.id };
            }
          }
          if (key.flick) {
            for (const sub of Object.values(key.flick)) {
              if (sub && keyProducesChar(sub, char)) {
                return { hostKey: key.id, role: "flick", layerId: layer.id };
              }
            }
          }
          for (const sub of key.multitap ?? []) {
            if (keyProducesChar(sub, char)) {
              return { hostKey: key.id, role: "multitap", layerId: layer.id };
            }
          }
        }
      }
    }
  }
  return null;
}
