// layoutIr -- the model the Layout tab shows (spec 111 FR-041).
//
// On a keyboard opened for update every Layout-tab edit is written into the file when it is
// confirmed, so the file's own parse (`startIr`) is the model and what the tab shows is read from
// it. On Copy the working IR is the model. The selector returns an existing object, so it is stable.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { isLiveOpen } from "../../lib/openMode.ts";
import type { WorkingCopyState } from "../../stores/workingCopyStore.ts";

export function selectLayoutIr(s: WorkingCopyState): KeyboardIR | null {
  return isLiveOpen(s) ? (s.startIr ?? s.ir) : s.ir;
}
