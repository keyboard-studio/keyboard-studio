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
import { buildDocContent, parseTouchLayoutOrNull } from "../lib/docContent.ts";
import { resolveOutputKeyboardId } from "../lib/outputKeyboardId.ts";

export interface DocsPreview {
  readmeMd: string;
  readmeHtm: string;
  welcomeHtm: string;
  helpPhp: string;
  /** spec 102 FR-034: the generated typing guide was left out because the inherited docs already hold one. */
  typingGuideSuppressed: boolean;
}

export function useDocsPreview(): DocsPreview {
  const helpDocs = useWorkingCopyStore((s) => s.helpDocs);
  const identity = useWorkingCopyStore((s) => s.identity);
  const startKeyboard = useWorkingCopyStore((s) => s.startKeyboard);
  const startIr = useWorkingCopyStore((s) => s.startIr);
  const startWelcomeHtmText = useWorkingCopyStore((s) => s.startWelcomeHtmText);
  const startHelpPhpText = useWorkingCopyStore((s) => s.startHelpPhpText);
  // spec 102 US2: the derived sections come from the working-copy IR as built.
  const workingIr = useWorkingCopyStore((s) => s.ir);
  const touchLayoutJson = useWorkingCopyStore((s) => s.touchLayoutJson);
  // spec 080 FR-006: the base README is inherited on an adaptation only; the
  // slice is null on Track 1 by construction, and the track guard keeps it so.
  const startReadmeMdText = useWorkingCopyStore((s) =>
    s.instantiationMode === "adapt-existing" ? s.startReadmeMdText : null,
  );

  return useMemo(() => {
    const displayName = identity?.displayName ?? startKeyboard?.displayName ?? "";
    // The base IR's own header.targets — a synchronous approximation of the
    // final projected .kmn's store(&TARGETS) (which projectWorkingCopyForOutput
    // reads instead, after carve/identity/rename have run). Good enough for a
    // live preview; not claimed byte-identical to the eventual output list.
    const platforms = startIr?.header.targets.map((t) => t.toLowerCase()) ?? [];
    // Same input the output projection passes (serializeWorkingCopy step 5c):
    // the start prose is non-null on Track 2 only.
    const ir = workingIr ?? startIr;
    const docContent =
      ir !== null
        ? buildDocContent({
            ir,
            touchLayout: parseTouchLayoutOrNull(touchLayoutJson),
            inheritedProse: startWelcomeHtmText ?? startHelpPhpText,
          })
        : null;
    const input: HelpDocsRenderInput = {
      answers: helpDocs,
      displayName,
      ...(identity?.bcp47 !== undefined && identity.bcp47 !== "" ? { primaryBcp47: identity.bcp47 } : {}),
      ...(startKeyboard !== null ? { keyboardId: resolveOutputKeyboardId(identity, startKeyboard) } : {}),
      platforms,
      ...(docContent !== null ? { generated: docContent.slots } : {}),
    };
    return {
      readmeMd: renderReadmeMd(input, startReadmeMdText),
      readmeHtm: renderReadmeHtm(input),
      welcomeHtm: renderWelcomeHtm(input, startWelcomeHtmText),
      helpPhp: renderHelpPhp(input, startHelpPhpText, startWelcomeHtmText),
      typingGuideSuppressed: docContent?.typingGuideSuppressed ?? false,
    };
  }, [helpDocs, identity, startKeyboard, startIr, workingIr, touchLayoutJson, startWelcomeHtmText, startHelpPhpText, startReadmeMdText]);
}
