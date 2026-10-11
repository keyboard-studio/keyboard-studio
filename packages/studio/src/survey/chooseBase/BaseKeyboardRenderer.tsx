// BaseKeyboardRenderer — the `base-keyboard` gallery module's renderer
// (spec 090 T013): the BaseResolution picker, hosted.
//
// Decision contract: the ONLY decision write is the confirm — it reports
// the previewed base's catalog identity through `onChange` (the gallery
// host records the `base-keyboard` decision; StudioShell's instantiation
// effect arms off that record, not off a session flag). Preview clicks are
// NOT the decision: they flow through the step-context extras the wrapper
// (BaseResolutionAdapter) provides, because the live compile pipeline that
// renders the preview is host-layer plumbing keyed to the session's
// preview base — the same reason StudioShell itself writes that field on
// its restore path.
//
// The F1 rebase-confirm gate stays synchronous and FIRST, exactly where
// it was in the adapter: a Cancel records nothing, completes nothing, and
// leaves base/draft/wizard untouched (see lib/confirmRebase.ts).

import type { BaseKeyboard } from "@keyboard-studio/contracts";
import type { DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import { useGalleryStepContext } from "../../steps/galleryHost.tsx";
import { confirmRebaseTo } from "../../lib/confirmRebase.ts";
import type { SuggestTarget } from "../../lib/suggestBase.ts";
import { BaseResolution } from "../../editors/panels/BaseResolution.tsx";

/**
 * The base-keyboard decision value: the catalog record's identity.
 * Declared here, with the renderer, and re-exported by the gallery module
 * (survey/questions/gallery/baseKeyboard.ts): the module imports this
 * file for the component, so the type must not also flow module → here
 * (a depcruise no-circular cycle; research addendum D-090-8).
 */
export interface BaseKeyboardValue {
  id: string;
  name: string;
}

/** The preview plumbing the wrapper hands the renderer via step-context extras. */
export interface BasePreviewExtras {
  target: SuggestTarget;
  previewedBase: BaseKeyboard | null;
  previewStatus: "idle" | "loading" | "ready" | "error";
  onPreview: (base: BaseKeyboard | null) => void;
}

export function BaseKeyboardRenderer({ onChange }: DecisionRendererProps<BaseKeyboardValue>) {
  const step = useGalleryStepContext();
  const extras = step.extras?.basePreview as BasePreviewExtras | undefined;
  if (extras === undefined) {
    throw new Error("BaseKeyboardRenderer: step context is missing the basePreview extras");
  }
  const { target, previewedBase, previewStatus, onPreview } = extras;

  function handleConfirm(): void {
    if (previewedBase === null) return;
    // F1 fix: resolve the rebase question SYNCHRONOUSLY, before any
    // decision write. Cancel aborts here — nothing is recorded and the
    // wizard stays on the picker (see the module comment above).
    if (!confirmRebaseTo(previewedBase.id)) return;
    onChange({ id: previewedBase.id, name: previewedBase.displayName });
    step.onComplete({ base: previewedBase });
  }

  return (
    <BaseResolution
      target={target}
      previewedBase={previewedBase}
      previewStatus={previewStatus}
      onPreview={onPreview}
      onConfirm={handleConfirm}
      {...(step.onBack ? { onBack: step.onBack } : {})}
    />
  );
}
