// openSplice -- the Open-mode write of a changed .kmn (spec 111).
//
// Changed nodes are spliced into the author's own text. A full reformat is
// used only with the author's agreement; without it the file is left as it
// stands and the caller is told it needs consent.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { emit as emitKmnText } from "../codec/emit.js";
import { projectKmnText } from "../pattern-apply/spliceKmn.js";

export interface OpenSpliceInput {
  /** The file as it stands now; `currentIr` carries line spans that agree with it. */
  currentText: string;
  currentIr: KeyboardIR;
  nextIr: KeyboardIR;
  consentedReemit?: boolean;
}

export type OpenSpliceResult =
  | { kind: "spliced"; text: string }
  | { kind: "reformatted"; text: string; reason: string }
  | { kind: "needs-consent"; reason: string };

export function openSplice(input: OpenSpliceInput): OpenSpliceResult {
  const projected = projectKmnText(input.currentText, input.currentIr, input.nextIr);
  if (projected.ok) return { kind: "spliced", text: projected.text };
  if (input.consentedReemit === true) {
    return { kind: "reformatted", text: emitKmnText(input.nextIr), reason: projected.reason };
  }
  return { kind: "needs-consent", reason: projected.reason };
}
