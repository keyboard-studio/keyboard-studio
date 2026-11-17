// useDocCreateFixes: the "create this page" fixes offered on a keyboard opened for
// update (spec 111 FR-029/FR-041), and the pages the descriptor will not let be
// created. A memoised synchronous derivation over the docs preview and the working
// copy: no timer, no write. Accepting is applyDocCreate.

import { useMemo } from "react";

import type { SuggestedFix } from "../lib/consistencySuggestions.ts";
import { docCreatePlans, type DocCreatePlans } from "../lib/docCreateFix.ts";
import { isLiveOpen } from "../lib/openMode.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDocsPreview } from "./useDocsPreview.ts";

const NONE: DocCreatePlans = { fixes: [], blocked: [] };

export function useDocCreatePlans(): DocCreatePlans {
  const live = useWorkingCopyStore((s) => isLiveOpen(s));
  const startVfs = useWorkingCopyStore((s) => s.startVfs);
  const startKeyboard = useWorkingCopyStore((s) => s.startKeyboard);
  const convention = useWorkingCopyStore((s) => s.startWelcomeConvention);
  const { generated, created } = useDocsPreview();
  return useMemo(() => {
    if (!live || startVfs === null || startKeyboard === null) return NONE;
    return docCreatePlans({
      vfs: startVfs,
      keyboardId: startKeyboard.id,
      convention,
      rendered: {
        "readme-md": generated.readmeMd,
        "readme-htm": generated.readmeHtm,
        "welcome-htm": created.welcomeHtm,
        "help-php": created.helpPhp,
      },
    });
  }, [live, startVfs, startKeyboard, convention, generated, created]);
}

export function useDocCreateFixes(): SuggestedFix[] {
  return useDocCreatePlans().fixes;
}
