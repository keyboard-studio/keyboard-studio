// emit(state, mode) -- the one stage that writes a keyboard's .kmn text.
//
// Three modes cover every case where original text matters (spec 118 FR-015):
//   unedited  the starting text, byte for byte
//   open      changed nodes spliced into the author's text; a reformat needs consent
//   copy      the model emitted in full
// The .kvks stays a text pass after this stage.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { emit as emitKmnText } from "../codec/emit.js";
import { openSplice } from "./openSplice.js";

export interface EmitState {
  /** The file as the working copy holds it right now. */
  currentText: string;
  /** `currentText` parsed, or the starting model with spans re-read from it (open mode). */
  currentIr: KeyboardIR;
  /** The model to write. */
  ir: KeyboardIR;
}

export type EmitMode =
  | { kind: "unedited" }
  | { kind: "open"; consentedReemit?: boolean }
  | { kind: "copy" };

export type EmitResult =
  | { ok: true; text: string; reformatted?: { reason: string } }
  | { ok: false; needsConsent: { reason: string } };

export function emit(state: EmitState, mode: EmitMode): EmitResult {
  switch (mode.kind) {
    case "unedited":
      return { ok: true, text: state.currentText };
    case "copy":
      return { ok: true, text: emitKmnText(state.ir) };
    case "open": {
      const r = openSplice({
        currentText: state.currentText,
        currentIr: state.currentIr,
        nextIr: state.ir,
        ...(mode.consentedReemit !== undefined ? { consentedReemit: mode.consentedReemit } : {}),
      });
      if (r.kind === "needs-consent") return { ok: false, needsConsent: { reason: r.reason } };
      if (r.kind === "reformatted") return { ok: true, text: r.text, reformatted: { reason: r.reason } };
      return { ok: true, text: r.text };
    }
  }
}
