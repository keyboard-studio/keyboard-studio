// useDocsPreview — spec 061 Story 2: a synchronous, pure derivation of the
// four shipped documentation files' rendered content from current store
// state.
//
// No `useEffect`, no timer — Constitution Article IV reserves the studio's
// one 300ms debounce cycle for the TS-check/WASM-oracle validation pair
// (decision D3); docs rendering has no async step to debounce, so it
// recomputes on every store change exactly like any other derived-state
// selector (research D-08). Renders through the SAME `helpDocsRender`
// functions `projectWorkingCopyForOutput` calls at output time, so the
// preview cannot visibly disagree with what a produced package would contain
// (FR-005/FR-010/SC-006).

import { useMemo } from "react";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import {
  renderReadmeMd,
  renderReadmeHtm,
  renderWelcomeHtm,
  renderHelpPhp,
  type HelpDocsRenderInput,
} from "@keyboard-studio/engine";

export interface DocsPreview {
  readmeMd: string;
  readmeHtm: string;
  welcomeHtm: string;
  helpPhp: string;
}

export function useDocsPreview(): DocsPreview {
  const helpDocs = useWorkingCopyStore((s) => s.helpDocs);
  const identity = useWorkingCopyStore((s) => s.identity);
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const baseWelcomeHtmText = useWorkingCopyStore((s) => s.baseWelcomeHtmText);
  const baseHelpPhpText = useWorkingCopyStore((s) => s.baseHelpPhpText);

  return useMemo(() => {
    const displayName = identity?.displayName ?? baseKeyboard?.displayName ?? "";
    const keyboardId = baseKeyboard?.id ?? "";
    // The base IR's own header.targets — a synchronous approximation of the
    // final projected .kmn's store(&TARGETS) (which projectWorkingCopyForOutput
    // reads instead, after carve/identity/rename have run). Good enough for a
    // live preview; not claimed byte-identical to the eventual output list.
    const platforms = baseIr?.header.targets.map((t) => t.toLowerCase()) ?? [];
    const input: HelpDocsRenderInput = {
      answers: helpDocs,
      displayName,
      ...(identity?.bcp47 !== undefined && identity.bcp47 !== "" ? { primaryBcp47: identity.bcp47 } : {}),
      platforms,
      keyboardId,
    };
    return {
      readmeMd: renderReadmeMd(input),
      readmeHtm: renderReadmeHtm(input),
      welcomeHtm: renderWelcomeHtm(input, baseWelcomeHtmText),
      helpPhp: renderHelpPhp(input, baseHelpPhpText),
    };
  }, [helpDocs, identity, baseKeyboard, baseIr, baseWelcomeHtmText, baseHelpPhpText]);
}
