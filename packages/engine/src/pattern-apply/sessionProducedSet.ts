/**
 * buildSessionProducedSet — the produced-glyph set for a base keyboard AS
 * MODIFIED by this session's (not-yet-serialized) physical mechanism
 * assignments.
 *
 * Bug context (shaped bug — diacritic-implementability): `useInventoryDiff`
 * and `MechanismGallery`'s `baseProducedSet` both used to call
 * `buildProducedSet(baseIr, ...)` directly — i.e. against the PRISTINE base
 * keyboard only, never against what THIS session has already assigned. A
 * precomposed character (e.g. "ӝ" U+04DD = "ж" U+0436 + combining diaeresis
 * U+0308) that becomes composable only because its combining-mark component
 * was assigned a deadkey THIS session (producing U+0308 as a rule-output
 * byproduct — not the assignment's own `target`) was therefore invisible to
 * `augmentWithComposable`, even though the keyboard being built genuinely
 * would type it.
 *
 * HARD REQUIREMENT (do not thread `assignment.target`/raw touch values
 * directly into a produced set instead of this route): a mechanism's
 * recorded `target` is not always the same as everything its rule *emits* —
 * a deadkey double-tap rule's real output can include a bare combining mark
 * that never appears as any assignment's own `target`. The only faithful way
 * to learn what a session's assignments actually produce is to inject them
 * into real .kmn source and walk the resulting rule outputs, which is what
 * `buildProducedSet` already does for the base keyboard.
 *
 * Route (mandated, do not shortcut):
 *   1. `applyAssignments()` — inject the physical assignments into the base
 *      .kmn source (merge-by-group-name; the same injection used for the
 *      real output artifact).
 *   2. `parse()` the resulting text back into a `KeyboardIR` (a PREVIEW IR —
 *      never written back to the working copy).
 *   3. `buildProducedSet(previewIr, { excludeBackspaceCorrections: true })` —
 *      the SAME option every existing base-only caller already passes, so a
 *      char reachable ONLY via a backspace-correction store entry is not
 *      wrongly counted as directly produced here either.
 *
 * When `assignments` contains no physical entries, this is equivalent to
 * (and cheaper than) `buildProducedSet(baseIr, { excludeBackspaceCorrections:
 * true })` directly — the round trip through applyAssignments/parse is
 * skipped entirely.
 *
 * Touch-modality entries (including the `touch_inherited` bookkeeping
 * placeholder — see `charMechanisms.ts`) are never threaded here:
 * `applyAssignments` itself only ever processes `modality === "physical"`
 * entries, so both are excluded structurally, not by a second ad-hoc filter.
 *
 * Pure: no store reads, no I/O, no mutation of `baseIr`. Callers are
 * responsible for memoizing on a stable assignment signature (per decision
 * D3, this must not introduce a second debounce timer — it rides the same
 * memoized-on-assignments cycle the rest of the gallery already uses).
 *
 * Never throws: `parse()` throws on malformed KMN (see `codec/parse.ts`), and
 * a free-text-derived assignment (a custom deadkey base letter, a custom key
 * char) can merge into unparseable text. This runs inside a bare `useMemo` in
 * the studio gallery components with no try/catch above it, so a throw here
 * would crash the whole gallery render mid-session. On any throw from the
 * emit/applyAssignments/parse/buildProducedSet round trip, fall back to the
 * base-only produced set (identical to the no-physical-assignments
 * short-circuit above) and emit a dev-only warning via `devLog.warn` —
 * the session's assignments are momentarily not reflected in the produced
 * set, but the gallery keeps rendering.
 */

import type { KeyboardIR, MechanismAssignment, Pattern } from "@keyboard-studio/contracts";
import { buildProducedSet } from "@keyboard-studio/contracts";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { applyAssignments } from "./applyAssignments.js";

export function buildSessionProducedSet(
  baseIr: KeyboardIR,
  assignments: ReadonlyArray<MechanismAssignment>,
  getPattern: (id: string) => Pattern | undefined,
): Set<string> {
  const physical = assignments.filter((a) => a.modality === "physical");
  if (physical.length === 0) {
    return buildProducedSet(baseIr, { excludeBackspaceCorrections: true });
  }

  try {
    const baseKmn = emit(baseIr);
    const { kmn: previewKmn } = applyAssignments(physical, getPattern, baseKmn);
    const previewIr = parse(previewKmn, baseIr.header.keyboardId).ir;
    return buildProducedSet(previewIr, { excludeBackspaceCorrections: true });
  } catch (err) {
    devLog.warn(
      `[buildSessionProducedSet] session preview round-trip failed (${String(err)}); falling back to base-only produced set`,
    );
    return buildProducedSet(baseIr, { excludeBackspaceCorrections: true });
  }
}
