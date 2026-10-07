// MarksStepHost — the manifest step component for the `marks` step
// (spec 090 T023): the gallery-host wrapper around MarksSeriesStep, the
// `marks-treatment` module's renderer.
//
// The wrapper owns the hosting (record, host deps, navigation through
// GalleryStepContext) plus ONE session side-effect the module's apply
// cannot perform: mirroring the completion payload's R10
// `migrationNeeded` determination into the survey session — the flag the
// retired reducer MARKS handler set through its injected deps. The
// renderer computes the determination at the completion report (from
// the pre-guard working IR, the reducer's exact input) and carries it in
// the value; this host writes it, with the reducer's only-ever-true
// semantics (nothing here ever clears it — session reset owns that).

import { useEffect, useMemo } from "react";
import type { ComponentType } from "react";
import type { EditorStepProps } from "../../steps/types.ts";
import { GalleryHost } from "../../steps/galleryHost.tsx";
import { buildGalleryHostDeps } from "../../lib/galleryHostDeps.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import marksTreatmentModule from "../questions/gallery/marksTreatment.ts";
import type { MarksTreatmentValue } from "./marksValue.ts";

const MARKS_STEP_ID = "marks";

const MarksStepHost: ComponentType<EditorStepProps> = ({ onComplete, onBack }: EditorStepProps) => {
  const record = useDecisionStore((s) => s.decisions["marks-treatment"]);
  const deps = useMemo(buildGalleryHostDeps, []);
  const completion = (record?.value as MarksTreatmentValue | undefined)?.completion ?? null;
  useEffect(() => {
    if (completion?.migrationNeeded === true) {
      useSurveySessionStore.getState().setMarksMigrationNeeded(true);
    }
  }, [completion]);
  return (
    <GalleryHost
      module={marksTreatmentModule}
      record={record}
      stepId={MARKS_STEP_ID}
      deps={deps}
      stepContext={{ onComplete, ...(onBack !== undefined && { onBack }) }}
    />
  );
};

export { MarksStepHost };
