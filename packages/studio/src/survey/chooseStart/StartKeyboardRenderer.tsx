// StartKeyboardRenderer — the `base-keyboard` gallery module's renderer
// (spec 090 T013): the StartResolution picker, hosted.
//
// Decision contract: the ONLY decision write is the confirm — it reports
// the previewed base's catalog identity through `onChange` (the gallery
// host records the `base-keyboard` decision; StudioShell's instantiation
// effect arms off that record, not off a session flag). Preview clicks are
// NOT the decision: they flow through the step-context extras the wrapper
// (StartResolutionAdapter) provides, because the live compile pipeline that
// renders the preview is host-layer plumbing keyed to the session's
// preview base — the same reason StudioShell itself writes that field on
// its restore path.
//
// The F1 rebase-confirm gate stays synchronous and FIRST, exactly where
// it was in the adapter: a Cancel records nothing, completes nothing, and
// leaves base/draft/wizard untouched (see lib/confirmRebase.ts).

import type { StartKeyboard } from "@keyboard-studio/contracts";
import type { DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import { useGalleryStepContext } from "../../steps/galleryHost.tsx";
import { confirmStartKeyboard } from "./confirmStartKeyboard.ts";
import type { SuggestTarget } from "../../lib/suggestStart.ts";
import { StartResolution } from "../../editors/panels/StartResolution.tsx";

/**
 * The base-keyboard decision value: the catalog record's identity.
 * Declared here, with the renderer, and re-exported by the gallery module
 * (survey/questions/gallery/baseKeyboard.ts): the module imports this
 * file for the component, so the type must not also flow module → here
 * (a depcruise no-circular cycle; research addendum D-090-8).
 */
// Defined beside the lifted confirm (spec 107 FR-040) so confirmStartKeyboard.ts
// does not import this component back; re-exported for existing importers.
export type { StartKeyboardValue } from "./confirmStartKeyboard.ts";
import type { StartKeyboardValue } from "./confirmStartKeyboard.ts";

/** The preview plumbing the wrapper hands the renderer via step-context extras. */
export interface StartPreviewExtras {
  target: SuggestTarget;
  previewedBase: StartKeyboard | null;
  previewStatus: "idle" | "loading" | "ready" | "error";
  onPreview: (base: StartKeyboard | null) => void;
}

export function StartKeyboardRenderer({ onChange }: DecisionRendererProps<StartKeyboardValue>) {
  const step = useGalleryStepContext();
  const extras = step.extras?.startPreview as StartPreviewExtras | undefined;
  if (extras === undefined) {
    throw new Error("BaseKeyboardRenderer: step context is missing the basePreview extras");
  }
  const { target, previewedBase, previewStatus, onPreview } = extras;

  function handleConfirm(): void {
    if (previewedBase === null) return;
    // The F1 rebase gate, the decision write and the completion result are
    // survey/chooseStart/confirmStartKeyboard.ts; a Cancel returns null and
    // the wizard stays on the picker (see the module comment above).
    const result = confirmStartKeyboard(previewedBase, onChange);
    if (result === null) return;
    step.onComplete(result);
  }

  return (
    <StartResolution
      target={target}
      previewedBase={previewedBase}
      previewStatus={previewStatus}
      onPreview={onPreview}
      onConfirm={handleConfirm}
      {...(step.onBack ? { onBack: step.onBack } : {})}
    />
  );
}
