// useCompareArtifact — the READ-ONLY artifact pipeline for the Compare tab.
//
// Spec 057 US2 (FR-021, FR-022, FR-023, FR-025, D-6). The requirement is an
// ABSENCE, so this file is best read by what it does not do:
//
//   - It calls `useKeyboardArtifact` with **no** `onInstantiate` callback.
//     That is the whole isolation guarantee. `usePreviewArtifact` passes one,
//     and on a settle for a DIFFERENT base it reaches
//     `instantiateFromBaseIfConfirmed` — which asks the author whether to
//     discard their edits and, on yes, rebases the working copy and clears
//     `phaseResults`/`irAxes`. With no callback there is no such settle
//     handler, so there is no dialog to answer and nothing to rebase. The
//     write path is unreachable, not guarded.
//   - It does **not** call `useWorkingCopyTransform`. A foreign keyboard must
//     not receive the author's carve overlay: those node ids do not belong to
//     it, and projecting them would both corrupt the comparison and imply a
//     relationship between the two keyboards that does not exist.
//   - It returns **no** setter that writes `workingCopyStore`,
//     `surveySessionStore`, `phaseBDraftStore` or `decisionLogStore`.
//
// FR-023 asks for the isolation to be structural rather than flag-gated, and
// this is why: a `readOnly: true` option on `usePreviewArtifact` would put the
// guarantee in the hands of every call site remembering to pass it, and one
// future site that forgot would silently re-arm the two-click session-loss
// trap. An absent parameter cannot be forgotten.
//
// `usePreviewArtifact` is deliberately NEITHER modified NOR renamed — Output
// still needs its instantiate path and its download gate (FR-026, D-6).

import { useCallback } from "react";
import type { BaseKeyboard, CompilerDiagnostic } from "@keyboard-studio/contracts";
import { useKeyboardArtifact } from "./useKeyboardArtifact.ts";
import { useViewStateStore } from "../stores/viewStateStore.ts";
import type { OskMode } from "../components/OskModeToggle.tsx";

export interface CompareArtifact {
  /** The foreign keyboard currently loaded for inspection, or null. */
  baseKeyboard: BaseKeyboard | null;
  /** Load a keyboard for inspection. Writes only to view state (Q5). */
  setBaseKeyboard: (kb: BaseKeyboard | null) => void;

  /** Which OSK view is open. View state, not authoring state. */
  oskMode: OskMode;
  setOskMode: (mode: OskMode) => void;

  /** The compile pipeline's stage, for the OSK frame and the source view. */
  stage: ReturnType<typeof useKeyboardArtifact>["stage"];
  retry: ReturnType<typeof useKeyboardArtifact>["retry"];
  diagnostics: CompilerDiagnostic[];
}

export function useCompareArtifact(): CompareArtifact {
  // The selection lives in the session-scoped view store, so it survives a tab
  // switch and dies on reload (Q5) — and, being view state, it is by
  // construction never serialized into the durable draft, the zip, or a PR
  // body (data-model.md CompareSession).
  const selection = useViewStateStore((s) => s.compareSelection);
  const setCompareSelection = useViewStateStore((s) => s.setCompareSelection);

  const baseKeyboard = selection?.baseKeyboard ?? null;
  const oskMode = selection?.oskMode ?? "desktop";

  const setBaseKeyboard = useCallback(
    (kb: BaseKeyboard | null) => {
      setCompareSelection(kb === null ? null : { baseKeyboard: kb, oskMode });
    },
    [setCompareSelection, oskMode],
  );

  const setOskMode = useCallback(
    (mode: OskMode) => {
      if (baseKeyboard === null) return;
      setCompareSelection({ baseKeyboard, oskMode: mode });
    },
    [setCompareSelection, baseKeyboard],
  );

  // No scaffold spec (there is no scaffold form on this tab), no VFS
  // transform, and — the point of the whole module — no onInstantiate.
  const { stage, retry } = useKeyboardArtifact(baseKeyboard, null, null, null);

  const diagnostics: CompilerDiagnostic[] =
    stage.kind === "ready"
      ? stage.compileResult.diagnostics
      : stage.kind === "error" && stage.compileResult !== undefined
        ? stage.compileResult.diagnostics
        : [];

  return { baseKeyboard, setBaseKeyboard, oskMode, setOskMode, stage, retry, diagnostics };
}
