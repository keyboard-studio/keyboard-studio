// useDocMemberStates — the studio's memoised read of the FR-022 documentation
// tier record (spec 076 US3, research R5).
//
// A `useMemo` over the exact store slices `deriveDocMemberStates` consumes —
// no `useEffect`, no timer. Constitution Article IV reserves the studio's one
// 300 ms debounce cycle for the TS-check/WASM-oracle validation pair (decision
// D3); this derivation has no async step, so it recomputes on store change
// like any other derived-state selector (the `useDocsPreview` precedent).
//
// Every consumer — the Output checklist, the upstream-finding classifier
// (FR-020) — reads THIS hook; none re-derives tier logic locally.

import { useMemo } from "react";
import type { DocMemberState } from "@keyboard-studio/contracts";
import { deriveDocMemberStates } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { resolveOutputKeyboardId } from "../lib/outputKeyboardId.ts";
import { missingInheritedImageRefs, welcomeFolderFileNames } from "../lib/welcomeFolder.ts";

/** Warning text the welcome row carries when the carried images did not survive a reload. */
export const WELCOME_IMAGES_DROPPED_WARNING =
  "the base's welcome images were too large to keep in the saved draft; re-open the base to carry them again";

export function useDocMemberStates(): DocMemberState[] {
  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  const helpDocs = useWorkingCopyStore((s) => s.helpDocs);
  const historyEntryState = useWorkingCopyStore((s) => s.historyEntryState);
  const baseWelcomeHtmText = useWorkingCopyStore((s) => s.baseWelcomeHtmText);
  const baseHelpPhpText = useWorkingCopyStore((s) => s.baseHelpPhpText);
  const baseReadmeMdText = useWorkingCopyStore((s) => s.baseReadmeMdText);
  const baseHistoryMdText = useWorkingCopyStore((s) => s.baseHistoryMdText);
  const baseWelcomeImages = useWorkingCopyStore((s) => s.baseWelcomeImages);
  const baseWelcomeImagesDropped = useWorkingCopyStore((s) => s.baseWelcomeImagesDropped);
  const identity = useWorkingCopyStore((s) => s.identity);
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);

  return useMemo(() => {
    const carriedNames = welcomeFolderFileNames(baseWelcomeImages);
    const missingInheritedImages =
      baseWelcomeHtmText !== null ? missingInheritedImageRefs(baseWelcomeHtmText, carriedNames) : [];
    const states = deriveDocMemberStates({
      instantiationMode,
      helpDocs,
      historyEntryState,
      base: {
        welcomeHtmText: baseWelcomeHtmText,
        helpPhpText: baseHelpPhpText,
        readmeMdText: baseReadmeMdText,
        historyMdText: baseHistoryMdText,
        hasWelcomeImages: carriedNames.length > 0,
      },
      keyboardId: resolveOutputKeyboardId(identity, baseKeyboard),
      missingInheritedImages,
    });
    if (!baseWelcomeImagesDropped) return states;
    // The same loss the projection names in its warnings, on the row it affects.
    return states.map((s) =>
      s.member === "welcome-htm" ? { ...s, warnings: [...s.warnings, WELCOME_IMAGES_DROPPED_WARNING] } : s,
    );
  }, [
    instantiationMode,
    helpDocs,
    historyEntryState,
    baseWelcomeHtmText,
    baseHelpPhpText,
    baseReadmeMdText,
    baseHistoryMdText,
    baseWelcomeImages,
    baseWelcomeImagesDropped,
    identity,
    baseKeyboard,
  ]);
}
