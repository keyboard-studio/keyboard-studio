// touchEmission — the R11 emission-matrix helper (spec 035 research.md R11,
// contracts/seed-derivation.md "Emission policy (R11)").
//
// Pure — no store/React imports. Shared by every buildTouchLayoutJson CALLER
// (TouchGallery's preview vfsTransform + editedVfsForLint memos, and the
// buildTouchLayoutJson ReducerDeps wrapper constructed in StudioShell.tsx) so
// preview, lint, and output apply the IDENTICAL matrix and cannot drift. Do
// not duplicate this logic inline at a new call site — import it instead.
//
// buildTouchLayoutJson itself always derives (see its own header comment);
// this module decides whether the derived result should be emitted/injected.

import type { DesktopModifications } from "@keyboard-studio/engine";

/**
 * The author's seed-source choice (spec 035 FR-006) — mirrors
 * BuildTouchLayoutJsonOpts["seedSource"] in buildTouchLayoutJson.ts.
 */
export type TouchSeedSourceChoice = "import-adapt" | "reseed-from-desktop";

/**
 * R11 emission matrix: decide whether the derived touch layout should be
 * injected into the VFS / lint projection / output side-car.
 *
 *   - `"reseed-from-desktop"` -> ALWAYS emit (SC-002 requires the file to
 *     exist even with zero Phase E edits and empty mods).
 *   - `"import-adapt"` AND (`mods` non-empty OR a real Phase E edit exists)
 *     -> emit.
 *   - `"import-adapt"` with empty `mods` and no real edit -> emit NOTHING —
 *     the shipped file (if any) is used verbatim, a byte-preserving no-op.
 *
 * `hasRealEdits` MUST already reflect only non-`touch_inherited` Phase E
 * assignments — callers pre-filter `touch_inherited` entries before computing
 * this (buildTouchLayoutJson's own contract: "Callers must pre-filter
 * assignments to exclude touch_inherited before passing them here").
 *
 * A `json === null` result from buildTouchLayoutJson (engine failure) is a
 * SEPARATE concern handled by the caller after this returns true — this
 * function only answers "should we even attempt to build/emit".
 */
export function shouldEmitTouchLayout(
  seedSource: TouchSeedSourceChoice,
  mods: DesktopModifications,
  hasRealEdits: boolean,
): boolean {
  if (seedSource === "reseed-from-desktop") return true;
  const modsNonEmpty = mods.removals.length > 0 || mods.placements.length > 0;
  return modsNonEmpty || hasRealEdits;
}

/**
 * Resolve the touch_seed_source fork choice for a build, applying the
 * Entity-5 default (research.md R4) when the author reaches the touch stage
 * without a recorded choice — defensive: the fork step should always set one
 * before the touch step is reachable, but a null value must never crash a
 * build. Default: `"import-adapt"` when the base ships a usable touch layout
 * (`baseTouchJsonPresent`), else `"reseed-from-desktop"` (there is nothing to
 * import-adapt onto).
 */
export function resolveTouchSeedSource(
  stored: TouchSeedSourceChoice | null,
  baseTouchJsonPresent: boolean,
): TouchSeedSourceChoice {
  if (stored !== null) return stored;
  return baseTouchJsonPresent ? "import-adapt" : "reseed-from-desktop";
}
