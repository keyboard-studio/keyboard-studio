// useDocRegenerationFixes: the regeneration fixes offered on Open (spec 111
// FR-028). A memoised synchronous derivation over the docs preview and the
// working copy: no timer, no write. Accepting is applyDocRegeneration.

import { useMemo } from "react";

import type { SuggestedFix } from "../lib/consistencySuggestions.ts";
import { docRegenerationFixes } from "../lib/docRegenerationFix.ts";
import { isOpenMode } from "../lib/openMode.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDocsPreview } from "./useDocsPreview.ts";

const NONE: SuggestedFix[] = [];

export function useDocRegenerationFixes(): SuggestedFix[] {
  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  const startVfs = useWorkingCopyStore((s) => s.startVfs);
  const startKeyboard = useWorkingCopyStore((s) => s.startKeyboard);
  // The raw renders: on Open the page fields are the file text, which would be
  // compared with itself. The current text is read from startVfs.
  const { generated } = useDocsPreview();
  return useMemo(() => {
    if (!isOpenMode(instantiationMode) || startVfs === null || startKeyboard === null) return NONE;
    return docRegenerationFixes({
      vfs: startVfs,
      keyboardId: startKeyboard.id,
      rendered: {
        "readme-md": generated.readmeMd,
        "readme-htm": generated.readmeHtm,
        "welcome-htm": generated.welcomeHtm,
        "help-php": generated.helpPhp,
      },
    });
  }, [instantiationMode, startVfs, startKeyboard, generated]);
}
