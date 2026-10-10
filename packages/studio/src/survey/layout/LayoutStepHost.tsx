// LayoutStepHost — the manifest step component for the `layout` step
// (spec 090 T011): the gallery-host wrapper around WindowsLayoutRenderer.
//
// The wrapper owns the step chrome the renderer contract deliberately
// excludes: Back/Continue publishing and step completion. Continue on an
// untouched suggestion records the proposal as confirmed (through the
// host's record+apply path, like every renderer change); Continue after a
// pick just completes — the pick was already recorded when it happened.

import { useMemo } from "react";
import type { ComponentType } from "react";
import { useLingui } from "@lingui/react/macro";
import type { EditorStepProps } from "../../steps/types.ts";
import { GalleryHost, decideGalleryValue } from "../../steps/galleryHost.tsx";
import { buildGalleryHostDeps } from "../../lib/galleryHostDeps.ts";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { deriveSurveyContext } from "../../decisions/identitySelectors.ts";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import { proposeWindowsLayout, windowsLayoutById } from "../../lib/windowsLayouts.ts";
import { LAYOUT_FAMILY_STEP_ID } from "../../lib/layoutFamily.ts";
import windowsLayoutModule from "../questions/gallery/windowsLayout.ts";
import type { WindowsLayoutValue } from "../questions/gallery/windowsLayout.ts";

const LayoutStepHost: ComponentType<EditorStepProps> = ({ onComplete, onBack }: EditorStepProps) => {
  const { t } = useLingui();
  const bcp47 = useDecisionStore((s) => deriveSurveyContext(s.decisions).bcp47_tag);
  const record = useDecisionStore((s) => s.decisions["windows-layout"]);
  const deps = useMemo(buildGalleryHostDeps, []);

  const proposal = useMemo(() => proposeWindowsLayout(bcp47), [bcp47]);
  const value = record?.value as WindowsLayoutValue | undefined;
  const recordedId =
    value !== undefined && windowsLayoutById(value.layoutId) !== undefined ? value.layoutId : undefined;
  const isSuggestion = (recordedId ?? proposal.layout.id) === proposal.layout.id;

  function confirm(): void {
    if (record === undefined) {
      decideGalleryValue<WindowsLayoutValue>(
        windowsLayoutModule,
        { layoutId: proposal.layout.id, origin: "confirmed" },
        { provenance: "asked" },
        LAYOUT_FAMILY_STEP_ID,
        deps,
      );
    }
    useSurveyAnswerStore.getState().setStatus(LAYOUT_FAMILY_STEP_ID, { kind: "finished" });
    onComplete(undefined);
  }

  usePublishStepNav({
    ...(onBack !== undefined
      ? {
          back: {
            label: t({ id: "layout.step.backButton", message: "Back" }),
            onClick: onBack,
            testId: "layout-back",
          },
        }
      : {}),
    forward: {
      label: isSuggestion
        ? t({ id: "layout.step.confirmButton", message: "Yes, use this layout" })
        : t({ id: "layout.step.continueButton", message: "Continue with this layout" }),
      onClick: confirm,
      testId: "layout-continue",
    },
  });

  return (
    <GalleryHost module={windowsLayoutModule} record={record} stepId={LAYOUT_FAMILY_STEP_ID} deps={deps} />
  );
};

export { LayoutStepHost };
