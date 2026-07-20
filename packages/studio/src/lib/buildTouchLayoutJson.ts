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
//
// `resolveSeedCase` (the Case A/B routing decision) and the Case A seed
// builder are also exported as `deriveSeedLayout`, below, for callers that
// need the seed BEFORE Phase E assignments are applied (e.g. TouchGallery's
// "already in touch layout" detection and its lint/completion-gate fallback
// layout) — both call sites share one implementation; do not duplicate the
// Case A/B branching inline at a new call site. `deriveSeedLayout` cannot
// replace this function's own Case B execution: R9 requires Case B's
// EMISSION path to stay a raw-JSON splice (never round-tripped through the
// IR), so buildTouchLayoutJson's Case B branch below calls
// applyDesktopModificationsToRawJson directly rather than going through
// deriveSeedLayout (which parses Case B's result into a TouchLayoutIR for
// its own callers).

import type { KeyboardIR, TouchAssignment, TouchLayoutIR } from "@keyboard-studio/contracts";
import {
  applyDesktopModifications,
  applyDesktopModificationsToRawJson,
  applyTouchAssignments,
  applyTouchAssignmentsToRawJson,
  scaffoldTouchLayout,
  emitTouchLayout,
  parseTouchLayout,
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

/** The Case A/B routing decision (spec 035 R4/R9/R10), narrowed so the raw
 *  `baseTouchJson` is typed as a non-empty string on the Case B arm — the ONE
 *  place this decision is made, shared by {@link buildTouchLayoutJson} and
 *  {@link deriveSeedLayout} so the two cannot disagree on which case applies. */
type SeedCase = { case: "A" } | { case: "B"; baseTouchJson: string };

function resolveSeedCase(opts: BuildTouchLayoutJsonOpts): SeedCase {
  const { baseTouchJson, seedSource } = opts;
  if (seedSource === "import-adapt" && baseTouchJson) {
    return { case: "B", baseTouchJson };
  }
  return { case: "A" };
}

/**
 * Case A seed builder (reseed from desktop, or the import-adapt fallback when
 * there is no shipped touch layout to adapt onto): strips any shipped
 * `ir.touchLayout` first — R10, `scaffoldTouchLayout` preserves-and-augments
 * an existing `ir.touchLayout` instead of discarding it, which would silently
 * carry the base's own platforms into a "reseed" and violate US2-AS4 — then
 * scaffolds and replays `mods`. Shared by `buildTouchLayoutJson`'s Case A
 * branch and {@link deriveSeedLayout}.
 */
function buildCaseASeed(
  baseIr: KeyboardIR,
  mods: DesktopModifications,
): { layout: TouchLayoutIR; warnings: string[] } {
  const { touchLayout: _stripped, ...rest } = baseIr;
  const seed = scaffoldTouchLayout(rest);
  return applyDesktopModifications(seed, mods);
}

/**
 * Derive the effective touch seed layout — the seed derivation up to and
 * including the desktop-modification replay (spec 035 R3), but BEFORE any
 * Phase E touch assignments are applied. Shared by callers that need the seed
 * as a `TouchLayoutIR` rather than the final emitted JSON (e.g. TouchGallery's
 * "already in touch layout" detection and its lint/completion-gate fallback
 * layout) — both call sites share one implementation; do not duplicate the
 * Case A/B branching inline at a new call site.
 *
 * Case B (`seedSource === "import-adapt"` with a shipped `baseTouchJson`)
 * applies mods onto the raw JSON — never round-tripped through the IR on
 * `buildTouchLayoutJson`'s own emission path (R9) — then parses the result
 * into a `TouchLayoutIR` for this function's callers, who need the IR shape
 * rather than a wire-format string. Case A (reseed, or the import-adapt
 * fallback with no shipped layout) delegates to {@link buildCaseASeed}.
 */
export function deriveSeedLayout(
  baseIr: KeyboardIR,
  opts: BuildTouchLayoutJsonOpts,
): { layout: TouchLayoutIR; warnings: string[] } {
  const seedCase = resolveSeedCase(opts);
  if (seedCase.case === "B") {
    const { json, warnings } = applyDesktopModificationsToRawJson(seedCase.baseTouchJson, opts.mods);
    return { layout: parseTouchLayout(json), warnings };
  }
  return buildCaseASeed(baseIr, opts.mods);
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
    const seedCase = resolveSeedCase(opts);

    // Case B — import & adapt: base ships a touch layout and the author chose
    // to adapt it. Never round-tripped through the IR (R9) — stays on the raw
    // JSON splice path, unlike deriveSeedLayout's Case B (which parses into an
    // IR for its own callers).
    if (seedCase.case === "B") {
      const { json: afterMods, warnings: modsWarnings } = applyDesktopModificationsToRawJson(
        seedCase.baseTouchJson,
        opts.mods,
      );
      const { json, warnings: assignWarnings } = applyTouchAssignmentsToRawJson(
        afterMods,
        assignments,
      );
      return { json, warnings: [...modsWarnings, ...assignWarnings] };
    }

    // Case A — reseed from desktop (explicit choice, or the import-adapt
    // fallback when there is no shipped touch layout to adapt onto).
    const { layout: seedLayout, warnings: seedWarnings } = buildCaseASeed(baseIr, opts.mods);
    const { layout, warnings: assignWarnings } = applyTouchAssignments(seedLayout, assignments);
    return { json: emitTouchLayout(layout), warnings: [...seedWarnings, ...assignWarnings] };
  } catch (err) {
    return {
      json: null,
      warnings: ["[buildTouchLayoutJson] failed: " + String(err)],
    };
  }
}
