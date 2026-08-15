// useValidatorFindings — single owner of the per-question findings projection.
//
// Reads the flat `validatorFindings` array from workingCopyStore (the spec-014
// V3 store bridge that the single useValidator in SurveyView publishes into)
// and derives the per-question lookup via buildFindingsByQuestionId.
//
// This is the authoritative memoisation site for that projection. Call it once
// per component tree that needs findingsByQuestionId; do NOT call
// buildFindingsByQuestionId directly in component code (that duplicates the
// memo and introduces inconsistency).
//
// spec-014 V3 store bridge: workingCopyStore.validatorFindings is the single
// source of truth — the hook never sources findings from a second store field
// or a second debounce timer.
//
// spec 063 T114: this file additionally hosts `useTouchKeyDiagnostics`, the
// edit-time touch-key findings surface (FR-040/FR-042). It is here, beside
// `useValidatorFindings`, because FR-042 names *this module's own rule* — "no
// second store field and no second timer" — as the discipline the touch
// diagnostics must follow. See that hook's doc for why the two projections it
// returns are not split into two hooks.

import { useMemo } from "react";
import type {
  KeyboardIR,
  LintFinding,
  TouchKeyFinding,
  TouchKeyRuleIndex,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";
import {
  computeAllTouchKeyDiagnostics,
  groupTouchKeyFindingsByAddress,
  type KeyEditOverlay,
} from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { buildFindingsByQuestionId } from "../lint/lintToQuestion.ts";

/**
 * Returns a stable `Record<string, LintFinding[]>` that maps each survey
 * question ID to the validator findings relevant to it, derived from the
 * current `validatorFindings` in workingCopyStore.
 *
 * Re-derives only when `validatorFindings` changes (reference equality).
 * Empty store → `{}`.
 *
 * Single ownership: this is the only place in the SPA that memoises the
 * `buildFindingsByQuestionId` projection (spec-014 V3 store bridge).
 */
export function useValidatorFindings(): Record<string, LintFinding[]> {
  const validatorFindings = useWorkingCopyStore((s) => s.validatorFindings);
  return useMemo(
    () => buildFindingsByQuestionId(validatorFindings),
    [validatorFindings],
  );
}

// ---------------------------------------------------------------------------
// Edit-time touch-key diagnostics (spec 063 T114; FR-040, FR-042, Decision D3)
// ---------------------------------------------------------------------------

/**
 * What {@link useTouchKeyDiagnostics} needs. Every field is something the touch
 * step already derives for other reasons — the point of this hook is that it
 * adds no NEW derivation, no store field, and no timer.
 */
export interface TouchKeyDiagnosticsInput {
  /** The mutable working IR — the source of both the rules and the opaque-fragment count. */
  readonly ir: KeyboardIR | null;
  /**
   * The EFFECTIVE (overlay-folded) touch layout, i.e. the same one the FR-008
   * completion gate audits. Passing the pristine layout here would report
   * defects the author has already fixed.
   */
  readonly layout: TouchLayoutIR | null;
  /** From `buildTouchKeyRuleIndex(ir)` — built once by the caller, never here. */
  readonly ruleIndex: TouchKeyRuleIndex | undefined;
  /** The committed key-edit overlay. Supplies the one overlay-derived code (FR-029h). */
  readonly overlay: KeyEditOverlay;
}

/** Both projections of one computation. See {@link useTouchKeyDiagnostics}. */
export interface TouchKeyDiagnostics {
  /** Every finding, in the aggregator's fixed code order. */
  readonly findings: readonly TouchKeyFinding[];
  /** The same findings keyed by `address`, for `buildKeyGridViewModel`'s per-cell lookup. */
  readonly byAddress: ReadonlyMap<string, readonly TouchKeyFinding[]>;
}

const EMPTY_DIAGNOSTICS: TouchKeyDiagnostics = { findings: [], byAddress: new Map() };

/**
 * The edit-time touch-key diagnostics for the current working copy: all eleven
 * codes (`computeAllTouchKeyDiagnostics`), plus the by-address grouping the key
 * grid's view model consumes.
 *
 * ## Why this lives beside `useValidatorFindings` and not in its own hook file
 *
 * FR-042 requires these findings be "composed into the **single aggregated
 * findings surface** — no second store field and no second timer, per the
 * [useValidatorFindings] doc's own rule". This file IS that rule's home, and its
 * module doc above states the single-ownership discipline these diagnostics must
 * also obey. Putting them in a sibling file would have re-created exactly the
 * second surface the requirement forbids, one directory over.
 *
 * The two projections are complements, not alternatives, and are returned
 * together on purpose: the grid needs the by-address map for its cells, and the
 * layer-level strip (T117) needs the flat list to find the `scope: "layer"` /
 * `"rule"` findings no cell will ever look up. Splitting them into two hooks
 * would mean two memos over one computation, which is the same drift risk in
 * miniature.
 *
 * ## No new timer (Decision D3)
 *
 * `computeAllTouchKeyDiagnostics` is a pure synchronous join over its arguments.
 * This hook is a `useMemo` over it, so the findings resolve within whichever
 * render the existing 300 ms validation cycle already schedules. There is no
 * `setTimeout`, no `useEffect`, and no store write anywhere in this path —
 * `useValidatorFindings.test.ts`'s fake-timer sibling (T122) asserts exactly
 * that, behaviorally.
 *
 * Returns the shared empty result — not a fresh `{findings: [], byAddress: new
 * Map()}` — whenever the IR, layout, or rule index is absent, so a caller
 * memoizing on the returned reference does not see a change on every render
 * before the working copy is ready.
 */
export function useTouchKeyDiagnostics(
  input: TouchKeyDiagnosticsInput,
): TouchKeyDiagnostics {
  const { ir, layout, ruleIndex, overlay } = input;
  return useMemo(() => {
    if (ir === null || layout === null || ruleIndex === undefined) {
      return EMPTY_DIAGNOSTICS;
    }
    const findings = computeAllTouchKeyDiagnostics({ ir, layout, ruleIndex }, overlay);
    return { findings, byAddress: groupTouchKeyFindingsByAddress(findings) };
  }, [ir, layout, ruleIndex, overlay]);
}
