// buildTouchLayoutJson — shared seed→apply→emit path so preview and output
// cannot drift. Both TouchGallery (live preview) and StudioShell
// (handlePhaseEComplete) call this single function.
//
// Two paths, chosen by `opts.seedSource` (spec 035 R4/R10), both of which now
// replay the locked desktop work (`opts.mods` — carve removals + Phase C
// letter placements, spec 035 R3) before the Phase E touch assignments are
// applied:
//
//   Case A — reseed from desktop (seedSource === "reseed-from-desktop", or
//   baseTouchJson absent/empty — the import-adapt fallback, see below):
//     baseIr (with any shipped touchLayout STRIPPED — R10) → scaffoldTouchLayout
//       → applyDesktopModifications → applyTouchAssignments → emitTouchLayout
//     The strip is mandatory: scaffoldTouchLayout PRESERVES-AND-AUGMENTS an
//     existing ir.touchLayout rather than discarding it, which would silently
//     carry the base's own platforms into a "reseed" and violate US2-AS4.
//
//   Case B — import & adapt (seedSource === "import-adapt" AND baseTouchJson
//   present):
//     baseTouchJson → applyDesktopModificationsToRawJson → applyTouchAssignmentsToRawJson
//       → JSON string
//     Both stages are parse → splice-in-place → stringify. The shipped layout
//     is NEVER round-tripped through the IR on this path (R9) — every
//     unmodified key/layer/platform/field is preserved verbatim.
//
//   Fallback: seedSource === "import-adapt" with no baseTouchJson falls back
//   to Case A (there is nothing to import-adapt onto).
//
// Callers must pre-filter `assignments` to exclude `touch_inherited` before
// passing them here; this function does not filter.
//
// This function always derives — it does not decide WHETHER the derived
// layout should be emitted/injected. That gating (spec 035 R11's emission
// matrix) lives at the call sites.

import type { KeyboardIR, TouchAssignment } from "@keyboard-studio/contracts";
import {
  applyDesktopModifications,
  applyDesktopModificationsToRawJson,
  applyTouchAssignments,
  applyTouchAssignmentsToRawJson,
  scaffoldTouchLayout,
  emitTouchLayout,
  type DesktopModifications,
} from "@keyboard-studio/engine";

export interface BuildTouchLayoutJsonResult {
  /**
   * Wire-format `.keyman-touch-layout` JSON string, ready to inject into VFS.
   * Null when the emit pipeline threw (malformed baseIr or engine error) — callers
   * must treat null as "omit the touch layout" rather than injecting an empty file.
   */
  json: string | null;
  /** Diagnostic messages for unmatched host keys or unhandled assignments. */
  warnings: string[];
}

export interface BuildTouchLayoutJsonOpts {
  /**
   * Raw shipped `.keyman-touch-layout` JSON string from the base VFS, when the
   * base ships a touch layout. Required (and non-empty) for Case B to run —
   * absent/empty falls back to Case A regardless of `seedSource`.
   */
  baseTouchJson?: string;
  /**
   * Desktop modifications (Phase D carve removals + Phase C letter
   * placements) to replay onto the seed. Replayed on BOTH paths — see
   * spec 035 R3.
   */
  mods: DesktopModifications;
  /**
   * The author's seed-source choice (spec 035 R4). `"reseed-from-desktop"`
   * always takes Case A (with the shipped touchLayout stripped — R10);
   * `"import-adapt"` takes Case B when `baseTouchJson` is present, else falls
   * back to Case A.
   */
  seedSource: "import-adapt" | "reseed-from-desktop";
}

/**
 * Derive a `.keyman-touch-layout` JSON string from a base KeyboardIR plus an
 * array of Phase E touch assignments. Pure — no side-effects, no VFS writes.
 *
 * @param baseIr        Post-lockDesktop IR snapshot (the authoritative base for
 *                      both preview and output — do NOT pass the carve-working IR).
 * @param assignments   Non-inherited touch assignments from Phase E. Callers MUST
 *                      filter out `touch_inherited` entries before calling.
 * @param opts          Desktop-modification replay + seed-source choice — see
 *                      {@link BuildTouchLayoutJsonOpts}.
 */
export function buildTouchLayoutJson(
  baseIr: KeyboardIR,
  assignments: ReadonlyArray<TouchAssignment>,
  opts: BuildTouchLayoutJsonOpts,
): BuildTouchLayoutJsonResult {
  try {
    const { baseTouchJson, mods, seedSource } = opts;

    // Case B — import & adapt: base ships a touch layout and the author chose
    // to adapt it. Never round-tripped through the IR (R9).
    if (seedSource === "import-adapt" && baseTouchJson) {
      const { json: afterMods, warnings: modsWarnings } = applyDesktopModificationsToRawJson(
        baseTouchJson,
        mods,
      );
      const { json, warnings: assignWarnings } = applyTouchAssignmentsToRawJson(
        afterMods,
        assignments,
      );
      return { json, warnings: [...modsWarnings, ...assignWarnings] };
    }

    // Case A — reseed from desktop (explicit choice, or the import-adapt
    // fallback when there is no shipped touch layout to adapt onto). The
    // shipped touchLayout, if any, is STRIPPED before scaffolding — R10:
    // scaffoldTouchLayout preserves-and-augments an existing ir.touchLayout
    // instead of discarding it, which would silently carry the base's own
    // platforms into a "reseed" and violate US2-AS4.
    const { touchLayout: _stripped, ...rest } = baseIr;
    const seed = scaffoldTouchLayout(rest);
    const { layout: afterMods, warnings: modsWarnings } = applyDesktopModifications(seed, mods);
    const { layout, warnings: assignWarnings } = applyTouchAssignments(afterMods, assignments);
    return { json: emitTouchLayout(layout), warnings: [...modsWarnings, ...assignWarnings] };
  } catch (err) {
    return {
      json: null,
      warnings: ["[buildTouchLayoutJson] failed: " + String(err)],
    };
  }
}
