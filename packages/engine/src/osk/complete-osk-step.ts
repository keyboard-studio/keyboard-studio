// complete-osk-step — the OSK step's onComplete result (specs/osk-editor).
//
// Lifted to product code (spec 107 FR-040) so the headless author calls the
// same seam the UI's Continue handler does: the editor's effective KvksIR
// (the generated base plus the author's label edits) emitted to `.kvks`
// XML, or undefined when there is no OSK (no working-copy IR yet).
//
// The completion currently records no decision and writes no IR — the
// `.kvks` emission lands in the build from the working copy's key
// assignments; the decision recording (the `osk-labels` gallery module)
// lands with the step's completion wiring.

import { emitKvks } from "../codec/emit-kvks.js";
import type { KvksIR } from "@keyboard-studio/contracts";

/** The result the OSK editor's Continue button hands to `onComplete`. */
export function oskContinueResult(kvks: KvksIR | null): { kvksXml: string } | undefined {
  return kvks === null ? undefined : { kvksXml: emitKvks(kvks) };
}
