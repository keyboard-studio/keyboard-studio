// htmlStepCompletion — records the Documentation editor Continue payload (specs/html-editor).
//
// Lifted seam shared by HtmlEditor and future headless step drivers,
// mirroring lib/oskStepCompletion.ts (completeOskStep).
//
// Recording is step-side: the editor writes the authored text to the
// working-copy store directly (the CssEditor pattern), and Continue records
// the `welcome-htm` decision with the same payload for the audit trail.
// The gallery module's apply() stays a no-op: WorkingCopyPatch has no
// authored-docs channel, so a module apply cannot store these fields
// (see survey/questions/gallery/welcomeHtm.ts).

import { useDecisionStore } from "../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

/** The Documentation step's Continue payload: the authored text per member. */
export interface HtmlContinueResult {
  welcomeHtm?: string;
  readmeHtm?: string;
  readmeMd?: string;
  helpPhp?: string;
}

/** Record `welcome-htm` from the author's Documentation-step Continue, and write the authored fields to the store. */
export function completeHtmlStep(result: unknown): void {
  const payload = result as HtmlContinueResult | undefined;
  if (payload === undefined) return;
  const store = useWorkingCopyStore.getState();
  if (payload.welcomeHtm !== undefined) store.setAuthoredWelcomeHtm(payload.welcomeHtm);
  if (payload.readmeHtm !== undefined) store.setAuthoredReadmeHtm(payload.readmeHtm);
  if (payload.readmeMd !== undefined) store.setAuthoredReadmeMd(payload.readmeMd);
  if (payload.helpPhp !== undefined) store.setAuthoredHelpPhp(payload.helpPhp);
  if (
    payload.welcomeHtm === undefined &&
    payload.readmeHtm === undefined &&
    payload.readmeMd === undefined &&
    payload.helpPhp === undefined
  ) {
    return;
  }
  useDecisionStore.getState().record({
    id: "welcome-htm",
    value: { ...payload },
    provenance: "asked",
  });
}
