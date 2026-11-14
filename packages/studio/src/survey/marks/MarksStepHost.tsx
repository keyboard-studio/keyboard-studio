// MarksStepHost — the manifest step component for the `marks` step
// (spec 090 T023): the gallery-host wrapper around MarksSeriesStep, the
// `marks-treatment` module's renderer.
//
// The wrapper owns the hosting (record, host deps, navigation through
// GalleryStepContext) plus the session side-effects the module's apply
// cannot perform: mirroring the completion payload's R10
// `migrationNeeded` determination into the survey session — the flag the
// retired reducer MARKS handler set through its injected deps. The
// renderer computes the determination at the completion report (from
// the pre-guard working IR, the reducer's exact input) and carries it in
// the value; this host writes it, with the reducer's only-ever-true
// semantics (nothing here ever clears it — session reset owns that).

import { useCallback, useEffect, useMemo } from "react";
import type { ComponentType } from "react";
import type { EditorStepProps } from "../../steps/types.ts";
import { GalleryHost } from "../../steps/galleryHost.tsx";
import { buildGalleryHostDeps } from "../../lib/galleryHostDeps.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import marksTreatmentModule from "../questions/gallery/marksTreatment.ts";
import { getMarksTreatmentValue, type MarksTreatmentValue } from "./marksValue.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useOpenAssignStore } from "../../stores/openAssignStore.ts";
import { mirrorMarksCompletionToSession } from "./marksSessionMirror.ts";
import { useApplyOnOpen } from "../../components/OpenApplyHost.tsx";
import { useIsLiveOpen } from "../../editors/carve/useRemovalActions.ts";

const MARKS_STEP_ID = "marks";

const MarksStepHost: ComponentType<EditorStepProps> = ({ onComplete, onBack }: EditorStepProps) => {
  const record = useDecisionStore((s) => s.decisions["marks-treatment"]);
  const deps = useMemo(buildGalleryHostDeps, []);
  const completion = (record?.value as MarksTreatmentValue | undefined)?.completion ?? null;
  useEffect(() => {
    mirrorMarksCompletionToSession(completion);
  }, [completion]);
  // Open (spec 111 live files, T086b, SC-008): the guard rules are written
  // into the file by the author's own action, finishing the series. Nothing
  // runs on mount, on a remount, on going back, or for a decision restored
  // from a draft, so none of those can prompt or write.
  const live = useIsLiveOpen();
  const applyOnOpen = useApplyOnOpen();
  const keyboardId = useWorkingCopyStore((s) => s.startKeyboard?.id ?? "");
  const finish = useCallback((result: unknown) => {
    const done = (): void => onComplete(result);
    const current = (getMarksTreatmentValue() as MarksTreatmentValue | undefined)?.completion ?? null;
    if (!live || current === null) return done();
    const key = `${keyboardId}|${JSON.stringify(current)}`;
    // Declined for this very completion: do not ask again (session memory).
    if (useOpenAssignStore.getState().declinedMarks === key) return done();
    // Whatever the apply does, the author's step still finishes (a failure shows
    // the host's notice; a rejected promise must not strand the step).
    void applyOnOpen({ kind: "marks" })
      .then((r) => {
        if (r.status === "declined") useOpenAssignStore.getState().declineMarks(key);
      })
      .catch(() => {})
      .finally(done);
  }, [live, keyboardId, applyOnOpen, onComplete]);
  return (
    <GalleryHost
      module={marksTreatmentModule}
      record={record}
      stepId={MARKS_STEP_ID}
      deps={deps}
      stepContext={{ onComplete: finish, ...(onBack !== undefined && { onBack }) }}
    />
  );
};

export { MarksStepHost };
