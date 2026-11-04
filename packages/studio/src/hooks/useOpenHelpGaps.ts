// useOpenHelpGaps: publishes which help documents an opened keyboard is missing
// or fails (spec 111 FR-029) to the help step's gate. A synchronous effect over
// store slices: no timer, no diagnostics (decision D3 is untouched). Outside
// Open, or before the baseline findings exist, it publishes "not known", which
// leaves the help step asked.

import { useEffect } from "react";

import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { deriveOpenHelpGaps } from "../lib/openHelpGaps.ts";
import { isOpenMode } from "../lib/openMode.ts";
import { setOpenHelpGaps } from "../survey/questions/openHelpGaps.ts";

export function useOpenHelpGaps(): void {
  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  const startVfs = useWorkingCopyStore((s) => s.startVfs);
  const startKeyboard = useWorkingCopyStore((s) => s.startKeyboard);
  const baselineDocFindings = useWorkingCopyStore((s) => s.baselineDocFindings);

  useEffect(() => {
    if (!isOpenMode(instantiationMode) || startVfs === null || startKeyboard === null || baselineDocFindings === null) {
      setOpenHelpGaps(null);
      return;
    }
    setOpenHelpGaps(
      deriveOpenHelpGaps({ vfs: startVfs, keyboardId: startKeyboard.id, baselineFindings: baselineDocFindings }),
    );
    return () => setOpenHelpGaps(null);
  }, [instantiationMode, startVfs, startKeyboard, baselineDocFindings]);
}
