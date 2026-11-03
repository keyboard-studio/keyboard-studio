// oskStepCompletion — records the OSK editor Continue payload (spec osk-editor).
//
// Lifted seam shared by OskEditorAdapter and future headless step drivers.

import type { OskContinueResult } from "@keyboard-studio/engine";
import { useDecisionStore } from "../stores/decisionStore.ts";

/** Record `osk-layout` when the author finishes the OSK step with a kvks payload. */
export function completeOskStep(result: unknown): void {
  const payload = result as OskContinueResult | undefined;
  if (payload?.kvksXml === undefined || payload.kvksXml.trim() === "") {
    return;
  }
  useDecisionStore.getState().record({
    id: "osk-layout",
    value: { kvksXml: payload.kvksXml },
    provenance: "asked",
  });
}
