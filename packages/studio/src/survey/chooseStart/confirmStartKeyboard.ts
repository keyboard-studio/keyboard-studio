// confirmStartKeyboard — what "Choose this keyboard" does, lifted out of
// StartKeyboardRenderer (spec 107 FR-040) so the UI and the headless author
// confirm a starting keyboard the same way.
//
// The F1 rebase-confirm gate stays synchronous and FIRST: a Cancel records
// nothing and completes nothing (see lib/confirmRebase.ts). On confirm the
// `base-keyboard` decision is reported through the gallery host's onChange
// BEFORE the step completes, preserving the "writes before advance" ordering,
// and the step's result carries the previewed base.

import type { StartKeyboard } from "@keyboard-studio/contracts";
import { confirmRebaseTo } from "../../lib/confirmRebase.ts";
/** The `base-keyboard` decision value (see StartKeyboardRenderer.tsx for its notes). */
export interface StartKeyboardValue {
  id: string;
  name: string;
}

/**
 * @returns the step result (`{ base }`) to complete with, or null when the
 *   author cancelled the rebase confirm (nothing recorded).
 */
export function confirmStartKeyboard(
  previewedBase: StartKeyboard,
  onChange: (value: StartKeyboardValue) => void,
): { base: StartKeyboard } | null {
  // F1 fix: resolve the rebase question SYNCHRONOUSLY, before any decision
  // write. Cancel aborts here.
  if (!confirmRebaseTo(previewedBase.id)) return null;
  onChange({ id: previewedBase.id, name: previewedBase.displayName });
  return { base: previewedBase };
}
