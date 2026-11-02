// PreviewProjection: what one successful preview compile run hands the LDML findings view
// (spec 108 T054). Text, not parsed touch/kvks, so the store holds plain data and the findings
// hook parses inside its memo.

import type { KeyboardIR } from "@keyboard-studio/contracts";

export interface PreviewProjection {
  /** The IR parsed from the projected `.kmn` of the run. */
  ir: KeyboardIR;
  /** The `.keyman-touch-layout` text the run compiled, or null when there is none. */
  touchLayoutText: string | null;
  /** The `.kvks` text the run compiled, or null when there is none. */
  kvksText: string | null;
  keyboardId: string;
}
